// Loop Sort DNA — presentation layer.
//
// The logic in LoopSortLogic.ts is authoritative and Phaser-free. This scene
// never inspects sprite positions to decide anything: selectBatch() returns an
// ordered ResolveEvent[] and this file plays that list back as a timeline.
//
// First prototype in the repo to run portrait (1080x1920) via Foundation V3's
// applyPrototypeConfig(). Everything else is landscape 960x540.

import Phaser from 'phaser'

import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'
import { DesignTokens as T } from '../../src/core/DesignTokens'
import { Layout } from '../../src/systems/Layout'
import { GameJuice } from '../../src/systems/GameJuice'
import { addShadow } from '../../src/systems/Shadow'
import { createBackground, type BackgroundHandle } from '../../src/systems/Background'
import { fadeIn } from '../../src/systems/Transitions'
import { UIFactory, type ButtonHandle, type PanelHandle, type ProgressBarHandle } from '../../src/ui/UIFactory'
import { DebugOverlay } from '../../src/ui/DebugOverlay'

import { LEVELS } from './LoopSortLevels'
import {
  createGame, selectBatch, occupiedCount, usableCapacity,
} from './LoopSortLogic'
import type {
  CubeColor, GameState, ResolveEvent, Obstacle,
} from './LoopSortTypes'

// ── Tuning ────────────────────────────────────────────────────────────────────

// How long each tween actually runs.
const INSERT_MS   = 2
const SHIFT_MS    =10
const CLEAR_MS    = 10
const OBSTACLE_MS = 10

// How far the timeline advances before the NEXT event fires. Deliberately
// shorter than the durations above so animations overlap. Advancing by the
// full duration made every event queue end-to-end, so one tap on a 3-cube
// batch with a chain locked input for ~2s.
const INSERT_STEP   = 2
const SHIFT_STEP    = 2
const CLEAR_STEP    = 1
const OBSTACLE_STEP = 5
const CHAIN_BEAT    = 5
const TAIL_MS       = 4

const CUBE_FILL: Record<CubeColor, number> = {
  red:    0xff5566,
  blue:   0x4a90ff,
  green:  0x3ddc84,
  yellow: 0xffc53d,
}

const DEPTH = {
  track:    0,
  socket:   1,
  shadow:   2,
  cube:     3,
  obstacle: 6,
  hud:      10,
  panel:    100,
}

interface Point { x: number; y: number }

interface CubeView {
  g: Phaser.GameObjects.Graphics
  shadow: Phaser.GameObjects.Graphics
  color: CubeColor
}

interface ObstacleView {
  parts: Phaser.GameObjects.GameObject[]
}

// ── Belt geometry ─────────────────────────────────────────────────────────────

/**
 * `count` points spaced by arc length around a rounded rectangle, starting at
 * top-centre and running clockwise. Slot 0 therefore sits at top-centre, which
 * matters because slot 0 is the compaction target.
 */
function beltPoints(
  cx: number, cy: number, w: number, h: number, r: number, count: number,
): Point[] {
  const hw = w / 2
  const hh = h / 2
  const rad = Math.min(r, hw, hh)

  const path: Point[] = []
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const steps = 12
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      path.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t })
    }
  }
  const arc = (ax: number, ay: number, a0: number, a1: number): void => {
    const steps = 10
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps)
      path.push({ x: ax + Math.cos(a) * rad, y: ay + Math.sin(a) * rad })
    }
  }

  const HALF_PI = Math.PI / 2
  line(cx, cy - hh, cx + hw - rad, cy - hh)
  arc(cx + hw - rad, cy - hh + rad, -HALF_PI, 0)
  line(cx + hw, cy - hh + rad, cx + hw, cy + hh - rad)
  arc(cx + hw - rad, cy + hh - rad, 0, HALF_PI)
  line(cx + hw - rad, cy + hh, cx - hw + rad, cy + hh)
  arc(cx - hw + rad, cy + hh - rad, HALF_PI, Math.PI)
  line(cx - hw, cy + hh - rad, cx - hw, cy - hh + rad)
  arc(cx - hw + rad, cy - hh + rad, Math.PI, Math.PI * 1.5)
  line(cx - hw + rad, cy - hh, cx, cy - hh)

  // Cumulative arc length, then sample `count` evenly spaced points.
  const cum: number[] = [0]
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Phaser.Math.Distance.BetweenPoints(path[i - 1], path[i]))
  }
  const total = cum[cum.length - 1]

  const out: Point[] = []
  let cursor = 1
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total
    while (cursor < cum.length - 1 && cum[cursor] < d) cursor++
    const segLen = cum[cursor] - cum[cursor - 1]
    const t = segLen > 0 ? (d - cum[cursor - 1]) / segLen : 0
    const a = path[cursor - 1]
    const b = path[cursor]
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────

export class LoopSortScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private juice!: GameJuice
  private ui!: UIFactory
  private layout!: Layout
  private bg?: BackgroundHandle

  private state!: GameState
  private levelIndex = 0

  // geometry
  private slots: Point[] = []
  private cubeSize = 120
  private beltCentre: Point = { x: 0, y: 0 }

  // view objects
  private trackG?: Phaser.GameObjects.Graphics
  private socketG?: Phaser.GameObjects.Graphics
  private cubeViews = new Map<string, CubeView>()
  /** Views mid-clear: already out of cubeViews but not yet destroyed. */
  private dyingViews = new Set<CubeView>()
  private obstacleViews = new Map<string, ObstacleView>()
  private batchButtons: ButtonHandle[] = []
  private trayLabel?: Phaser.GameObjects.Text
  private hud: Phaser.GameObjects.GameObject[] = []
  private capacityBar?: ProgressBarHandle
  private capacityText?: Phaser.GameObjects.Text
  private goalText?: Phaser.GameObjects.Text
  private panel?: PanelHandle
  private panelButtons: ButtonHandle[] = []
  private panelExtras: Phaser.GameObjects.GameObject[] = []

  // run bookkeeping
  private busy = false
  private runToken = 0
  private spawnFrom: Point = { x: 0, y: 0 }
  private openCurtains = new Set<string>()
  private clearedView: Record<CubeColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 }

  constructor() { super({ key: 'LoopSortScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    // Portrait, before anything reads scale.width.
    applyPrototypeConfig(this, {
      name: '011-loop-sort',
      sceneKey: 'LoopSortScene',
      orientation: 'portrait',
    })

    this.layout = new Layout(this)
    this.ui = new UIFactory(this)
    // No sound keys: the repo ships zero audio assets and GameJuice no-ops.
    this.juice = new GameJuice(this)

    this.bg = createBackground(this, {
      color: 0x10131f,
      gradientTo: 0x1b2036,
      pattern: 'dots',
      patternAlpha: 0.03,
      patternSpacing: 96,
      particles: 0,          // deliberately off — nothing competes with the belt
    })

    this.overlay = new DebugOverlay(this, '011-loop-sort')
    this.overlay.addWatch('Level',   () => `${this.levelIndex + 1}/${LEVELS.length}`)
    this.overlay.addWatch('Phase',   () => this.state?.phase ?? '-')
    this.overlay.addWatch('Belt',    () => this.state
      ? `${occupiedCount(this.state)}/${usableCapacity(this.state)}` : '-')
    this.overlay.addWatch('Batches', () => this.state
      ? `${this.state.offered.length} offered, ${this.state.level.batchQueue.length - this.state.queueIndex} queued`
      : '-')

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown())

    this.loadLevel(0)
    fadeIn(this, T.duration.normal)
  }

  update(): void {
    this.overlay.update()
  }

  private teardown(): void {
    this.clearLevel()
    this.bg?.destroy()
    this.bg = undefined
  }

  // ── Level construction ──────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    this.clearLevel()

    this.levelIndex = Phaser.Math.Clamp(index, 0, LEVELS.length - 1)
    this.state = createGame(LEVELS[this.levelIndex])
    this.openCurtains.clear()
    this.clearedView = { red: 0, blue: 0, green: 0, yellow: 0 }

    this.computeGeometry()
    this.drawTrack()
    this.drawSockets()
    this.buildObstacles()
    this.spawnInitialCubes()
    this.buildHud()
    this.buildBatchTray()
    this.refreshReadouts()
  }

  /**
   * Cancels every pending callback and destroys everything this scene created
   * for the current level. runToken is bumped first so any callback already
   * dequeued this frame becomes a no-op.
   *
   * Deliberately does NOT call tweens.killAll(): that destroys tweens without
   * firing onComplete, which would strand VFXManager's burst particles and
   * floating text on the display list (their cleanup lives in onComplete, and
   * this scene has no handle on them). Tweens are killed per owned object
   * instead, and transient VFX is left to finish and clean itself up.
   */
  private clearLevel(): void {
    this.runToken++
    this.busy = false
    this.time.removeAllEvents()

    const killViews = (views: Iterable<CubeView>): void => {
      for (const v of views) {
        this.tweens.killTweensOf(v.g)
        this.tweens.killTweensOf(v.shadow)
        v.g.destroy()
        v.shadow.destroy()
      }
    }
    killViews(this.cubeViews.values())
    this.cubeViews.clear()
    // Views mid-clear are already out of cubeViews; their destroy lives in a
    // tween onComplete that will never fire once the tween is killed.
    killViews(this.dyingViews)
    this.dyingViews.clear()

    for (const o of this.obstacleViews.values()) {
      this.tweens.killTweensOf(o.parts)
      for (const p of o.parts) p.destroy()
    }
    this.obstacleViews.clear()

    this.trackG?.destroy();  this.trackG = undefined
    this.socketG?.destroy(); this.socketG = undefined

    this.destroyBatchTray()

    for (const h of this.hud) {
      this.tweens.killTweensOf(h)
      h.destroy()
    }
    this.hud = []

    if (this.capacityBar) {
      this.tweens.killTweensOf(this.capacityBar.container)
      this.capacityBar.destroy()
      this.capacityBar = undefined
    }
    this.capacityText = undefined
    this.goalText = undefined

    this.dismissPanel()
  }

  private destroyBatchTray(): void {
    for (const b of this.batchButtons) {
      this.tweens.killTweensOf(b.container)
      b.destroy()
    }
    this.batchButtons = []
    this.trayLabel?.destroy()
    this.trayLabel = undefined
  }

  private dismissPanel(): void {
    for (const b of this.panelButtons) {
      this.tweens.killTweensOf(b.container)
      b.destroy()
    }
    this.panelButtons = []
    for (const e of this.panelExtras) {
      this.tweens.killTweensOf(e)
      e.destroy()
    }
    this.panelExtras = []
    if (this.panel) {
      this.tweens.killTweensOf(this.panel.container)
      this.panel.destroy()
      this.panel = undefined
    }
  }

  private computeGeometry(): void {
    const safe = this.layout.safeRect
    const hudH  = 330
    const trayH = 430

    const top = safe.y + hudH
    const bottom = safe.y + safe.height - trayH
    const availW = safe.width
    const availH = Math.max(bottom - top, 400)

    const w = Math.min(availW - 90, 880)
    const h = Math.min(availH - 70, 880)
    this.beltCentre = { x: this.layout.width / 2, y: top + availH / 2 }

    this.slots = beltPoints(
      this.beltCentre.x, this.beltCentre.y, w, h,
      Math.min(w, h) * 0.24, this.state.level.capacity,
    )

    // Cube size from the gap between neighbouring slots, so a long belt packs
    // tighter instead of overlapping.
    const gap = this.slots.length > 1
      ? Phaser.Math.Distance.BetweenPoints(this.slots[0], this.slots[1])
      : 160
    this.cubeSize = Phaser.Math.Clamp(gap * 0.66, 62, 146)
    this.spawnFrom = { x: this.layout.width / 2, y: safe.y + safe.height - trayH * 0.5 }
  }

  private drawTrack(): void {
    const g = this.add.graphics().setDepth(DEPTH.track)
    const pts = this.slots
    if (pts.length > 1) {
      g.lineStyle(this.cubeSize * 0.92, 0x232a45, 1)
      g.beginPath()
      g.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
      g.closePath()
      g.strokePath()
    }
    this.trackG = g
  }

  /**
   * Empty slot sockets. This is the level's core planning information — the
   * player must be able to see remaining space without counting cubes.
   */
  private drawSockets(): void {
    this.socketG?.destroy()
    const g = this.add.graphics().setDepth(DEPTH.socket)
    const s = this.cubeSize
    const r = T.radius.md

    for (let i = 0; i < this.slots.length; i++) {
      const p = this.slots[i]
      const blocked = this.isCurtainedView(i)
      g.fillStyle(blocked ? 0x181c2c : 0x2c3458, blocked ? 0.85 : 1)
      g.fillRoundedRect(p.x - s / 2, p.y - s / 2, s, s, r)
      g.lineStyle(3, blocked ? 0x222840 : 0x3a457a, 1)
      g.strokeRoundedRect(p.x - s / 2, p.y - s / 2, s, s, r)
    }

    // Slot 0 marker — the compaction target, kept subtle.
    if (this.slots.length > 0) {
      const p = this.slots[0]
      g.lineStyle(4, 0x5f6ea8, 0.9)
      g.strokeRoundedRect(p.x - s / 2 - 7, p.y - s / 2 - 7, s + 14, s + 14, r + 4)
    }
    this.socketG = g
  }

  private isCurtainedView(slot: number): boolean {
    return this.state.level.obstacles.some(o =>
      o.kind === 'curtain' && !this.openCurtains.has(o.id) && slot >= o.from && slot <= o.to)
  }

  // ── Cubes ───────────────────────────────────────────────────────────────────

  private drawCube(g: Phaser.GameObjects.Graphics, color: CubeColor, frozen: boolean): void {
    const s = this.cubeSize
    g.clear()
    g.fillStyle(CUBE_FILL[color], 1)
    g.fillRoundedRect(-s / 2, -s / 2, s, s, T.radius.md)
    // top highlight gives the flat fill a readable form
    g.fillStyle(0xffffff, 0.18)
    g.fillRoundedRect(-s / 2 + 6, -s / 2 + 6, s - 12, s * 0.26, T.radius.sm)
    if (frozen) {
      g.fillStyle(0xbfe6ff, 0.42)
      g.fillRoundedRect(-s / 2, -s / 2, s, s, T.radius.md)
      g.lineStyle(4, 0xe4f5ff, 0.85)
      g.strokeRoundedRect(-s / 2, -s / 2, s, s, T.radius.md)
    }
  }

  private createCubeView(id: string, color: CubeColor, at: Point, frozen: boolean): CubeView {
    const g = this.add.graphics().setDepth(DEPTH.cube).setPosition(at.x, at.y)
    this.drawCube(g, color, frozen)
    const shadow = addShadow(this, {
      x: at.x, y: at.y, width: this.cubeSize, height: this.cubeSize,
    }, { radius: T.radius.md, depth: DEPTH.shadow })
    const view: CubeView = { g, shadow, color }
    this.cubeViews.set(id, view)
    return view
  }

  private spawnInitialCubes(): void {
    for (let i = 0; i < this.state.cells.length; i++) {
      const cube = this.state.cells[i]
      if (!cube) continue
      this.createCubeView(cube.id, cube.color, this.slots[i], cube.frozen)
    }
  }

  /** Moves a cube view and keeps its shadow locked to it for the whole tween. */
  private moveCube(view: CubeView, to: Point, duration: number, ease = 'Quad.Out'): void {
    this.tweens.add({
      targets: view.g,
      x: to.x, y: to.y,
      duration, ease,
      onUpdate: () => {
        view.shadow.setPosition(view.g.x + T.shadow.offsetX, view.g.y + T.shadow.offsetY)
      },
    })
  }

  // ── Obstacles ───────────────────────────────────────────────────────────────

  private buildObstacles(): void {
    for (const o of this.state.level.obstacles) {
      const parts = this.drawObstacle(o)
      if (parts.length > 0) this.obstacleViews.set(o.id, { parts })
    }
  }

  private drawObstacle(o: Obstacle): Phaser.GameObjects.GameObject[] {
    const s = this.cubeSize
    const parts: Phaser.GameObjects.GameObject[] = []

    if (o.kind === 'curtain') {
      const g = this.add.graphics().setDepth(DEPTH.obstacle)
      g.fillStyle(0x7a5bd6, 0.5)
      g.lineStyle(4, 0xa88cf0, 0.85)
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        g.fillRoundedRect(p.x - s / 2 - 5, p.y - s / 2 - 5, s + 10, s + 10, T.radius.md)
        g.strokeRoundedRect(p.x - s / 2 - 5, p.y - s / 2 - 5, s + 10, s + 10, T.radius.md)
      }
      parts.push(g)

    } else if (o.kind === 'ice') {
      // The frozen look is drawn on the cube itself; this is the frost halo.
      const p = this.slots[o.slot]
      if (p) {
        const g = this.add.graphics().setDepth(DEPTH.obstacle)
        g.lineStyle(5, 0xbfe6ff, 0.75)
        g.strokeRoundedRect(p.x - s / 2 - 8, p.y - s / 2 - 8, s + 16, s + 16, T.radius.md + 4)
        parts.push(g)
      }

    } else if (o.kind === 'barrier') {
      const a = this.slots[o.at - 1]
      const b = this.slots[o.at]
      if (a && b) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2
        const len = s * 0.95
        const g = this.add.graphics().setDepth(DEPTH.obstacle)
        g.lineStyle(14, 0xff9f43, 1)
        g.lineBetween(
          mx - Math.cos(ang) * len / 2, my - Math.sin(ang) * len / 2,
          mx + Math.cos(ang) * len / 2, my + Math.sin(ang) * len / 2,
        )
        parts.push(g)
      }

    } else {
      const g = this.add.graphics().setDepth(DEPTH.obstacle)
      g.fillStyle(0x394063, 1)
      g.lineStyle(4, 0x545d8c, 1)
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        g.fillRoundedRect(p.x - s / 2 - 4, p.y - s / 2 - 4, s + 8, s + 8, T.radius.md)
        g.strokeRoundedRect(p.x - s / 2 - 4, p.y - s / 2 - 4, s + 8, s + 8, T.radius.md)
      }
      parts.push(g)
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        const q = this.add.text(p.x, p.y, '?', {
          fontSize: `${Math.round(s * 0.5)}px`, color: '#9aa3d4', fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(DEPTH.obstacle + 1)
        parts.push(q)
      }
    }
    return parts
  }

  private animObstacle(id: string, became: 'open' | 'broken' | 'revealed' | 'unlocked'): void {
    const view = this.obstacleViews.get(id)
    const def = this.state.level.obstacles.find(o => o.id === id)
    if (!view || !def) return

    let at: Point = this.beltCentre
    if (def.kind === 'ice') at = this.slots[def.slot] ?? this.beltCentre
    else if (def.kind === 'barrier') at = this.slots[def.at] ?? this.beltCentre
    else at = this.slots[def.from] ?? this.beltCentre

    this.juice.collect(at.x, at.y)

    this.tweens.add({
      targets: view.parts,
      alpha: 0,
      scaleX: became === 'broken' ? 1.25 : 1,
      scaleY: became === 'broken' ? 1.25 : 1,
      duration: OBSTACLE_MS,
      ease: 'Quad.Out',
      onComplete: () => {
        for (const p of view.parts) p.destroy()
        this.obstacleViews.delete(id)
      },
    })

    if (became === 'open') {
      this.openCurtains.add(id)
      this.drawSockets()
    }
    if (became === 'broken') {
      // The cube stops being ice; redraw it without the frost overlay.
      for (const [cid, v] of this.cubeViews) {
        const live = this.state.cells.find(c => c?.id === cid)
        if (live && !live.frozen) this.drawCube(v.g, v.color, false)
      }
    }
    this.refreshReadouts()
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  private buildHud(): void {
    const safe = this.layout.safeRect
    const level = this.state.level
    const cx = this.layout.width / 2
    let y = safe.y + 52

    const title = this.ui.createLabel({
      x: cx, y,
      text: `LEVEL ${level.id} · ${level.name.toUpperCase()}`,
      textScale: 'small',
      color: '#aeb8e8',
      align: 'center',
    }).setDepth(DEPTH.hud)
    this.hud.push(title)

    y += 62
    const teaches = this.ui.createLabel({
      x: cx, y,
      text: level.teaches,
      textScale: 'tiny',
      color: '#6f78a8',
      align: 'center',
      wordWrapWidth: safe.width - 180,
    }).setDepth(DEPTH.hud)
    this.hud.push(teaches)

    // Goal chips — secondary, not competing with the belt.
    y += 78
    this.goalText = this.ui.createLabel({
      x: cx, y, text: '', textScale: 'small', color: '#dfe4ff', align: 'center',
    }).setDepth(DEPTH.hud)
    this.hud.push(this.goalText)

    // Capacity meter: the squeeze must be legible at a glance, so it is shown
    // both spatially (empty sockets) and numerically here.
    y += 74
    this.capacityBar = this.ui.createProgressBar({
      x: cx, y, width: Math.min(safe.width - 220, 620), height: 18,
      bgColor: 0x242a44, fillColor: 0x3ddc84, radius: T.radius.pill,
      value: 0, duration: T.duration.fast,
    })
    this.capacityBar.container.setDepth(DEPTH.hud)

    this.capacityText = this.ui.createLabel({
      x: cx, y: y + 40, text: '', textScale: 'tiny', color: '#8b94c4', align: 'center',
    }).setDepth(DEPTH.hud)
    this.hud.push(this.capacityText)

    // Restart, top-right, clear of DebugOverlay's top-left corner.
    const restart = this.ui.createIcon({
      x: this.layout.safeRight(-64),
      y: safe.y + 56,
      size: 74,
      background: 0x242a44,
      backgroundAlpha: 0.9,
      radius: T.radius.pill,
      onPress: () => { if (!this.busy) this.loadLevel(this.levelIndex) },
      draw: (g, size) => {
        const r = size * 0.3
        g.lineStyle(size * 0.11, 0xc6cdf5, 0.95)
        g.beginPath()
        g.arc(0, 0, r, Phaser.Math.DegToRad(55), Phaser.Math.DegToRad(315), false)
        g.strokePath()
        const a = Phaser.Math.DegToRad(55)
        const hx = Math.cos(a) * r
        const hy = Math.sin(a) * r
        g.fillStyle(0xc6cdf5, 0.95)
        g.fillTriangle(
          hx + size * 0.13, hy + size * 0.02,
          hx - size * 0.05, hy - size * 0.10,
          hx - size * 0.08, hy + size * 0.12,
        )
      },
    })
    restart.container.setDepth(DEPTH.hud)
    this.hud.push(restart.container)
  }

  private refreshReadouts(): void {
    const goals = this.state.level.goal
      .map(g => `${g.color[0].toUpperCase()} ${Math.min(this.clearedView[g.color], g.count)}/${g.count}`)
      .join('     ')
    this.goalText?.setText(goals)

    const used = this.cubeViews.size
    const usable = usableCapacity(this.state)
    const ratio = usable > 0 ? used / usable : 0
    this.capacityBar?.setValue(Phaser.Math.Clamp(ratio, 0, 1), true)

    // Pressure is shown on the readout's colour as well as the bar's length,
    // so "nearly full" lands without the player counting sockets.
    const free = usable - used
    this.capacityText?.setText(`BELT  ${used} / ${usable}      ${free} FREE`)
    this.capacityText?.setColor(
      ratio >= 0.85 ? '#ff5566' : ratio >= 0.6 ? '#ffc53d' : '#8b94c4',
    )
  }

  // ── Batch tray ──────────────────────────────────────────────────────────────

  private buildBatchTray(): void {
    // Rebuilt after every pick, so the old tray (label included) must go first.
    this.destroyBatchTray()

    const safe = this.layout.safeRect
    const offered = this.state.offered
    if (offered.length === 0) return

    const trayY = safe.y + safe.height - 190
    const maxW = safe.width - 80
    const gap = 28
    const cardW = Math.min(300, (maxW - gap * (offered.length - 1)) / offered.length)
    const cardH = Math.max(T.button.minTouch + 40, 190)
    const totalW = cardW * offered.length + gap * (offered.length - 1)
    const startX = this.layout.width / 2 - totalW / 2 + cardW / 2

    this.trayLabel = this.ui.createLabel({
      x: this.layout.width / 2,
      y: trayY - cardH / 2 - 52,
      text: 'CHOOSE A BATCH',
      textScale: 'tiny',
      color: '#6f78a8',
      align: 'center',
    }).setDepth(DEPTH.hud)

    offered.forEach((batch, i) => {
      const x = startX + i * (cardW + gap)
      const handle = this.ui.createButton({
        x, y: trayY,
        text: '',
        width: cardW,
        height: cardH,
        color: 0x2a3155,
        radius: T.radius.lg,
        shadow: true,
        minTouch: T.button.minTouch,
        onPress: () => this.onBatchPressed(batch.id, { x, y: trayY }),
      })
      handle.container.setDepth(DEPTH.hud)

      // Cube preview drawn into the button's own container so destroy() cleans
      // it up with everything else.
      const mini = Math.min(58, (cardW - 40) / Math.max(batch.cubes.length, 1))
      const spread = mini + 12
      const originX = -((batch.cubes.length - 1) * spread) / 2
      const g = this.add.graphics()
      batch.cubes.forEach((color, k) => {
        const mx = originX + k * spread
        g.fillStyle(0x000000, 0.22)
        g.fillRoundedRect(mx - mini / 2, -mini / 2 + 5, mini, mini, T.radius.sm)
        g.fillStyle(CUBE_FILL[color], 1)
        g.fillRoundedRect(mx - mini / 2, -mini / 2, mini, mini, T.radius.sm)
        g.fillStyle(0xffffff, 0.18)
        g.fillRoundedRect(mx - mini / 2 + 3, -mini / 2 + 3, mini - 6, mini * 0.26, 2)
      })
      handle.container.add(g)

      this.batchButtons.push(handle)
    })
  }

  private setBatchesEnabled(enabled: boolean): void {
    for (const b of this.batchButtons) b.setEnabled(enabled)
  }

  private onBatchPressed(batchId: string, from: Point): void {
    if (this.busy) return
    if (this.state.phase === 'LEVEL_COMPLETE' || this.state.phase === 'LEVEL_FAILED') return

    this.spawnFrom = from
    const { next, events } = selectBatch(this.state, batchId)
    this.state = next
    this.playEvents(events)
  }

  // ── Event timeline ──────────────────────────────────────────────────────────

  private schedule(token: number, delay: number, fn: () => void): void {
    if (delay <= 0) {
      if (token === this.runToken) fn()
      return
    }
    this.time.delayedCall(delay, () => { if (token === this.runToken) fn() })
  }

  /**
   * Plays the logic's event log as a timeline. Input stays locked for the whole
   * run. Consecutive shifts move together; cascades are staggered by chainIndex
   * so a chain reads as a sequence rather than one simultaneous pop.
   */
  private playEvents(events: ResolveEvent[]): void {
    this.busy = true
    this.setBatchesEnabled(false)
    const token = ++this.runToken

    let t = 0
    let lastChain = -1
    let i = 0

    while (i < events.length) {
      const e = events[i]

      switch (e.kind) {
        case 'shift': {
          const group: Array<{ cubeId: string; to: number }> = []
          while (i < events.length) {
            const s = events[i]
            if (s.kind !== 'shift') break
            group.push({ cubeId: s.cubeId, to: s.to })
            i++
          }
          this.schedule(token, t, () => {
            for (const s of group) {
              const v = this.cubeViews.get(s.cubeId)
              const p = this.slots[s.to]
              if (v && p) this.moveCube(v, p, SHIFT_MS)
            }
          })
          t += SHIFT_STEP
          break
        }

        case 'insert': {
          const { cubeId, color, slot } = e
          this.schedule(token, t, () => this.animInsert(cubeId, color, slot))
          t += INSERT_STEP
          i++
          break
        }

        case 'clear': {
          if (lastChain >= 0 && e.chainIndex !== lastChain) t += CHAIN_BEAT
          lastChain = e.chainIndex
          const ev = e
          this.schedule(token, t, () => this.animClear(ev))
          t += CLEAR_STEP
          i++
          break
        }

        case 'obstacle': {
          const { obstacleId, became } = e
          this.schedule(token, t, () => this.animObstacle(obstacleId, became))
          t += OBSTACLE_STEP
          i++
          break
        }

        case 'fail': {
          const reason = e.reason
          this.schedule(token, t, () => this.showFail(reason))
          t += CLEAR_STEP
          i++
          break
        }

        case 'complete': {
          this.schedule(token, t + CHAIN_BEAT, () => this.showComplete())
          t += CLEAR_STEP
          i++
          break
        }
      }
    }

    this.schedule(token, t + TAIL_MS, () => this.onTimelineEnd())
  }

  private animInsert(cubeId: string, color: CubeColor, slot: number): void {
    const to = this.slots[slot]
    if (!to) return
    const view = this.createCubeView(cubeId, color, this.spawnFrom, false)
    view.g.setScale(0.7)
    view.shadow.setAlpha(0)
    this.tweens.add({
      targets: view.g, scaleX: 1, scaleY: 1,
      duration: INSERT_MS, ease: 'Back.Out',
    })
    this.tweens.add({ targets: view.shadow, alpha: 1, duration: INSERT_MS })
    this.moveCube(view, to, INSERT_MS, 'Cubic.Out')
    this.refreshReadouts()
  }

  private animClear(e: { cubeIds: string[]; color: CubeColor; slots: number[]; chainIndex: number }): void {
    const pts: Point[] = []
    for (const id of e.cubeIds) {
      const v = this.cubeViews.get(id)
      if (!v) continue
      pts.push({ x: v.g.x, y: v.g.y })
      this.cubeViews.delete(id)
      this.dyingViews.add(v)
      const shadow = v.shadow
      this.tweens.add({
        targets: v.g,
        scaleX: 0.2, scaleY: 0.2, alpha: 0,
        duration: CLEAR_MS, ease: 'Back.In',
        onComplete: () => {
          this.dyingViews.delete(v)
          v.g.destroy()
          shadow.destroy()
        },
      })
      this.tweens.add({ targets: shadow, alpha: 0, duration: CLEAR_MS * 0.6 })
    }

    if (pts.length > 0) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      // Chain depth scales the payoff, but stays restrained.
      const label = e.chainIndex > 0 ? `CHAIN x${e.chainIndex + 1}` : undefined
      this.juice.success(cx, cy, undefined, label)
    }

    this.clearedView[e.color] += e.cubeIds.length
    this.refreshReadouts()
  }

  private onTimelineEnd(): void {
    this.busy = false
    if (this.state.phase === 'LEVEL_COMPLETE' || this.state.phase === 'LEVEL_FAILED') return
    this.buildBatchTray()
    this.refreshReadouts()
  }

  // ── End-of-level panels ─────────────────────────────────────────────────────

  private showComplete(): void {
    this.setBatchesEnabled(false)
    this.juice.levelComplete()
    const last = this.levelIndex >= LEVELS.length - 1
    this.buildPanel(
      last ? 'ALL LEVELS CLEAR' : 'LEVEL COMPLETE',
      last ? 'You reached the end of the experiment.' : `Picks used: ${this.state.picks}`,
      last ? 'Replay' : 'Continue',
      () => this.loadLevel(last ? 0 : this.levelIndex + 1),
    )
  }

  private showFail(reason: 'full' | 'noValidPlacement' | 'outOfBatches'): void {
    this.setBatchesEnabled(false)
    const p = this.beltCentre
    this.juice.fail(p.x, p.y)
    const why = reason === 'outOfBatches'
      ? 'Out of batches before the goal was met.'
      : 'The belt filled up — no room left to place a cube.'
    this.buildPanel('NO MORE MOVES', why, 'Retry', () => this.loadLevel(this.levelIndex))
  }

  private buildPanel(title: string, body: string, cta: string, onCta: () => void): void {
    this.dismissPanel()
    const c = this.layout.center()

    this.panel = this.ui.createPanel({
      x: c.x, y: c.y,
      width: T.panel.md.width, height: 560,
      fill: 0x1b2036, stroke: 0x3a457a, strokeWidth: 3,
      radius: T.radius.lg, shadow: true,
      title, titleScale: 'heading', titleColor: '#ffffff',
    })
    this.panel.container.setDepth(DEPTH.panel)

    const bodyLabel = this.ui.createLabel({
      x: c.x, y: c.y - 20,
      text: body, textScale: 'small', color: '#9aa3d4',
      align: 'center', wordWrapWidth: T.panel.md.width - 140,
    }).setDepth(DEPTH.panel + 1)
    this.panelExtras.push(bodyLabel)

    const primary = this.ui.createButton({
      x: c.x, y: c.y + 120,
      text: cta,
      width: 440, height: T.button.minTouch,
      color: 0x4a90ff, radius: T.radius.lg, shadow: true,
      onPress: () => { if (!this.busy) onCta() },
    })
    primary.container.setDepth(DEPTH.panel + 1)
    this.panelButtons.push(primary)

    const menu = this.ui.createButton({
      x: c.x, y: c.y + 120 + T.button.minTouch + 28,
      text: 'Levels ' + `${this.levelIndex + 1}/${LEVELS.length}`,
      width: 440, height: T.button.minTouch,
      color: 0x2a3155, radius: T.radius.lg, shadow: true,
      onPress: () => { if (!this.busy) this.loadLevel(this.levelIndex) },
    })
    menu.container.setDepth(DEPTH.panel + 1)
    this.panelButtons.push(menu)
  }
}
