// Loop Sort DNA — presentation layer.
//
// The logic in LoopSortLogic.ts is authoritative and Phaser-free. This scene
// never inspects sprite positions to decide anything: selectBatch() returns an
// ordered ResolveEvent[] and this file plays that list back as a timeline.
//
// Portrait 1080x1920 via Foundation V3's applyPrototypeConfig(), and built on
// the V4 presentation layer (docs/presentation.md). No gameplay rule, timing
// contract or event semantic below differs from the previous version except the
// animation DURATIONS, which are called out where they are defined.

import Phaser from 'phaser'

import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'
import { fadeIn } from '../../src/systems/Transitions'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import type { ButtonHandle, PanelHandle } from '../../src/ui/UIFactory'
import {
  createPresentation, customizeTheme, type Presentation, type Theme,
  drawRoundedCard, drawGameTile, drawShadow, drawPill, drawHighlight,
  bakeGraphics, bakeTexture, hex, shade, mix,
} from '../../src/presentation'

import { LEVELS } from './LoopSortLevels'
import {
  createGame, selectBatch, occupiedCount, usableCapacity,
} from './LoopSortLogic'
import type {
  CubeColor, GameState, ResolveEvent, Obstacle,
} from './LoopSortTypes'

// ── Tuning ────────────────────────────────────────────────────────────────────
//
// How long each tween runs. The previous version had these at 2–10ms, which
// made every cube teleport — and "WATCH → ANTICIPATE" is half the hypothesis
// this prototype exists to test. They are back to watchable values.
//
// The reason they were cut is real, though: advancing the timeline by the full
// duration queues every event end-to-end and locks input for seconds. The fix
// is overlap, not speed. Each *_STEP below is how far the timeline advances
// before the NEXT event fires, and is deliberately ~55% of its duration, so
// a cube is still settling as the next one launches. A 3-cube batch with one
// clear runs ~1.1s end to end.
const INSERT_MS   = 300
const SHIFT_MS    = 230
const CLEAR_MS    = 300
const OBSTACLE_MS = 420

const INSERT_STEP   = 165
const SHIFT_STEP    = 125
const CLEAR_STEP    = 155
const OBSTACLE_STEP = 230
const CHAIN_BEAT    = 165
const TAIL_MS       = 130

const CUBE_FILL: Record<CubeColor, number> = {
  red:    0xff5566,
  blue:   0x4a90ff,
  green:  0x3ddc84,
  yellow: 0xffc53d,
}

const DEPTH = {
  track:    0,
  socket:   1,
  dash:     2,
  shadow:   3,
  cube:     4,
  obstacle: 6,
  hud:      10,
  panel:    100,
}

interface Point { x: number; y: number }

interface CubeView {
  g: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
  color: CubeColor
}

interface ObstacleView {
  parts: Phaser.GameObjects.GameObject[]
}

// ── Belt geometry ─────────────────────────────────────────────────────────────

interface BeltPath {
  /** `count` slot centres, evenly spaced by arc length, slot 0 at top-centre. */
  slots: Point[]
  /** The dense path the slots were sampled from — used to draw the track. */
  path: Point[]
}

/**
 * Points spaced by arc length around a rounded rectangle, starting at
 * top-centre and running clockwise. Slot 0 therefore sits at top-centre, which
 * matters because slot 0 is the compaction target.
 *
 * Now also returns the dense path. Stroking the track through the *slot*
 * centres drew a coarse polygon whose corners bulged away from the cubes; the
 * track is drawn along this path instead.
 */
function beltPoints(
  cx: number, cy: number, w: number, h: number, r: number, count: number,
): BeltPath {
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
    const steps = 14
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

  const slots: Point[] = []
  let cursor = 1
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total
    while (cursor < cum.length - 1 && cum[cursor] < d) cursor++
    const segLen = cum[cursor] - cum[cursor - 1]
    const t = segLen > 0 ? (d - cum[cursor - 1]) / segLen : 0
    const a = path[cursor - 1]
    const b = path[cursor]
    slots.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return { slots, path }
}

/** Walks a dense path at fixed arc-length intervals, yielding point + normal. */
function walkPath(
  path: Point[], spacing: number,
  fn: (p: Point, nx: number, ny: number) => void,
): void {
  let carry = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 0.0001) continue
    const ux = dx / len
    const uy = dy / len
    let d = carry
    while (d < len) {
      fn({ x: a.x + ux * d, y: a.y + uy * d }, -uy, ux)
      d += spacing
    }
    carry = d - len
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class LoopSortScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private p!: Presentation
  private t!: Theme

  private state!: GameState
  private levelIndex = 0

  // geometry
  private slots: Point[] = []
  private beltPath: Point[] = []
  private cubeSize = 120
  private beltCentre: Point = { x: 0, y: 0 }

  // view objects
  private trackImg?: Phaser.GameObjects.Image
  private socketImg?: Phaser.GameObjects.Image
  private intakeMark?: Phaser.GameObjects.Image
  private cubeViews = new Map<string, CubeView>()
  /** Views mid-clear: already out of cubeViews but not yet destroyed. */
  private dyingViews = new Set<CubeView>()
  private obstacleViews = new Map<string, ObstacleView>()
  private batchButtons: ButtonHandle[] = []
  private trayLabel?: Phaser.GameObjects.Text
  private hud: Phaser.GameObjects.GameObject[] = []
  private dash: Phaser.GameObjects.GameObject[] = []
  private gaugeG?: Phaser.GameObjects.Graphics
  private freeNumber?: Phaser.GameObjects.Text
  private freeCaption?: Phaser.GameObjects.Text
  private beltCaption?: Phaser.GameObjects.Text
  private goalChips: Array<{ bg: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; color: CubeColor }> = []
  private panel?: PanelHandle
  private panelButtons: ButtonHandle[] = []
  private panelExtras: Phaser.GameObjects.GameObject[] = []

  /** Shared baked texture keys owned by the current level. */
  private ownedTextures = new Set<string>()

  // run bookkeeping
  private busy = false
  private runToken = 0
  private spawnFrom: Point = { x: 0, y: 0 }
  private openCurtains = new Set<string>()
  private clearedView: Record<CubeColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 }
  private lastFreeShown = -1

  constructor() { super({ key: 'LoopSortScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    // Portrait, before anything reads scale.width.
    applyPrototypeConfig(this, {
      name: '011-loop-sort',
      sceneKey: 'LoopSortScene',
      orientation: 'portrait',
    })

    // Amber accent on the dark puzzle base: this is a sorting machine, and the
    // warm signal colour separates machinery from the four cube colours, none
    // of which may be reused for chrome.
    this.p = createPresentation(this, {
      theme: customizeTheme('puzzle', {
        colors: {
          ...customizeTheme('puzzle', {}).colors,
          accent: 0xffb454,
          background: 0x0e1120,
          backgroundAlt: 0x1b2138,
        },
      }),
      background: { preset: 'softGradient', vignette: 0.32, patternSpacing: 110 },
    })
    this.t = this.p.theme

    this.overlay = new DebugOverlay(this, '011-loop-sort')
    this.overlay.addWatch('Level',   () => `${this.levelIndex + 1}/${LEVELS.length}`)
    this.overlay.addWatch('Phase',   () => this.state?.phase ?? '-')
    this.overlay.addWatch('Belt',    () => this.state
      ? `${occupiedCount(this.state)}/${usableCapacity(this.state)}` : '-')
    this.overlay.addWatch('Batches', () => this.state
      ? `${this.state.offered.length} offered, ${this.state.level.batchQueue.length - this.state.queueIndex} queued`
      : '-')

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown())

    this.loadLevel(this.startLevelIndex())
    fadeIn(this, this.t.duration.normal)
  }

  update(): void {
    this.overlay.update()
  }

  /**
   * Playtest affordance: `?lvl=12` opens level 13 directly. Twenty levels is a
   * lot to replay to reach the one being tuned, and this costs one line. Any
   * missing or malformed value starts at level 1.
   */
  private startLevelIndex(): number {
    try {
      const raw = new URLSearchParams(window.location.search).get('lvl')
      const n = raw === null ? 0 : Number(raw)
      return Number.isFinite(n) ? Phaser.Math.Clamp(Math.trunc(n), 0, LEVELS.length - 1) : 0
    } catch {
      return 0
    }
  }

  private teardown(): void {
    this.clearLevel()
    // createPresentation registers its own SHUTDOWN cleanup for the background.
  }

  // ── Level construction ──────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    this.clearLevel()

    this.levelIndex = Phaser.Math.Clamp(index, 0, LEVELS.length - 1)
    this.state = createGame(LEVELS[this.levelIndex])
    this.openCurtains.clear()
    this.clearedView = { red: 0, blue: 0, green: 0, yellow: 0 }
    this.lastFreeShown = -1

    this.computeGeometry()
    this.drawTrack()
    this.drawSockets()
    this.buildObstacles()
    this.spawnInitialCubes()
    this.buildHeader()
    this.buildDashboard()
    this.buildBatchTray()
    this.refreshReadouts()
  }

  /**
   * Cancels every pending callback and destroys everything this scene created
   * for the current level. runToken is bumped first so any callback already
   * dequeued this frame becomes a no-op.
   *
   * Deliberately does NOT call tweens.killAll(): that destroys tweens without
   * firing onComplete, which would strand the presentation layer's burst
   * particles and floating text on the display list (their cleanup lives in
   * onComplete, and this scene has no handle on them). Tweens are killed per
   * owned object instead, and transient VFX is left to finish and clean itself.
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

    this.trackImg?.destroy();   this.trackImg = undefined
    this.socketImg?.destroy();  this.socketImg = undefined
    if (this.intakeMark) {
      this.tweens.killTweensOf(this.intakeMark)
      this.intakeMark.destroy()
      this.intakeMark = undefined
    }

    this.destroyBatchTray()

    for (const h of this.hud) {
      this.tweens.killTweensOf(h)
      h.destroy()
    }
    this.hud = []

    for (const d of this.dash) {
      this.tweens.killTweensOf(d)
      d.destroy()
    }
    this.dash = []
    this.gaugeG = undefined
    this.freeNumber = undefined
    this.freeCaption = undefined
    this.beltCaption = undefined
    this.goalChips = []

    // Shared cube/shadow textures are keyed by size, which changes with the
    // level's capacity, so they are released with the level that made them.
    for (const key of this.ownedTextures) {
      if (this.textures.exists(key)) this.textures.remove(key)
    }
    this.ownedTextures.clear()

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
    const safe = this.p.layout.safeRect
    // The header shrank: goals and capacity moved inside the loop, which is
    // where the player is already looking and was ~700px of dead pixels.
    const hudH  = 250
    const trayH = 430

    const top = safe.y + hudH
    const bottom = safe.y + safe.height - trayH
    const availW = safe.width
    const availH = Math.max(bottom - top, 400)

    const w = Math.min(availW - 170, 830)
    const h = Math.min(availH - 120, 830)
    this.beltCentre = { x: this.p.layout.width / 2, y: top + availH / 2 }

    const belt = beltPoints(
      this.beltCentre.x, this.beltCentre.y, w, h,
      Math.min(w, h) * 0.24, this.state.level.capacity,
    )
    this.slots = belt.slots
    this.beltPath = belt.path

    // Cube size from the gap between neighbouring slots, so a long belt packs
    // tighter instead of overlapping.
    const gap = this.slots.length > 1
      ? Phaser.Math.Distance.BetweenPoints(this.slots[0], this.slots[1])
      : 160
    this.cubeSize = Math.round(Phaser.Math.Clamp(gap * 0.6, 58, 126))
    this.spawnFrom = { x: this.p.layout.width / 2, y: safe.y + safe.height - trayH * 0.5 }
  }

  // ── Track ───────────────────────────────────────────────────────────────────

  /**
   * The conveyor itself: casing, recessed channel, and tread ticks running
   * along it. Baked — it is completely static, and a 400-point path stroked
   * three times would otherwise re-tessellate every frame.
   */
  /**
   * Size of the square canvas the belt layers bake into, and the offset that
   * puts the belt at its centre. The baked Image is then positioned at
   * `beltCentre`, so texture-centre lands on belt-centre and every slot sits
   * exactly where `this.slots` says it does.
   */
  private beltBakeBox(): { box: number; dx: number; dy: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of this.beltPath) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const pad = this.cubeSize + 90
    const box = Math.ceil(Math.max(maxX - minX, maxY - minY) + pad * 2)
    return { box, dx: box / 2 - this.beltCentre.x, dy: box / 2 - this.beltCentre.y }
  }

  private drawTrack(): void {
    const t = this.t
    const s = this.cubeSize
    const { box, dx, dy } = this.beltBakeBox()

    const stroke = (
      g: Phaser.GameObjects.Graphics, dx: number, dy: number,
      width: number, color: number, alpha: number,
    ): void => {
      g.lineStyle(width, color, alpha)
      g.beginPath()
      g.moveTo(this.beltPath[0].x + dx, this.beltPath[0].y + dy)
      for (let i = 1; i < this.beltPath.length; i++) {
        g.lineTo(this.beltPath[i].x + dx, this.beltPath[i].y + dy)
      }
      g.closePath()
      g.strokePath()
    }

    this.trackImg = bakeGraphics(this, box, box, g => {
      // Drop shadow under the casing, then casing, then recessed channel.
      const casing  = s + 30
      const channel = s + 14
      stroke(g, dx, dy + 8, casing, 0x000000, 0.26)
      stroke(g, dx, dy, casing, mix(t.colors.background, t.colors.surface, 0.9), 1)
      stroke(g, dx, dy - 2, casing - 6, shade(t.colors.surface, 0.04), 1)
      stroke(g, dx, dy, channel, shade(t.colors.background, 0.015), 1)

      // Treads run ACROSS the channel. Two stubs hugging the rails read as a
      // clock face; a crossing line reads as belt surface.
      const half = channel / 2 - 3
      g.lineStyle(4, t.colors.border, 0.18)
      walkPath(this.beltPath, 44, (p, nx, ny) => {
        g.lineBetween(
          p.x + dx - nx * half, p.y + dy - ny * half,
          p.x + dx + nx * half, p.y + dy + ny * half,
        )
      })
    }).setPosition(this.beltCentre.x, this.beltCentre.y).setDepth(DEPTH.track)
  }

  /**
   * Empty slot sockets. This is the level's core planning information — the
   * player must be able to see remaining space without counting cubes, so an
   * empty socket is drawn as a recessed well with inverted lighting.
   */
  private drawSockets(): void {
    if (this.socketImg) { this.socketImg.destroy(); this.socketImg = undefined }
    const t = this.t
    const s = this.cubeSize
    const r = t.radius.md
    const { box, dx, dy } = this.beltBakeBox()

    this.socketImg = bakeGraphics(this, box, box, g => {
      for (let i = 0; i < this.slots.length; i++) {
        const p = this.slots[i]
        const x = p.x + dx
        const y = p.y + dy
        const blocked = this.isCurtainedView(i)

        g.fillStyle(blocked ? shade(t.colors.background, -0.02) : shade(t.colors.background, 0.02), 1)
        g.fillRoundedRect(x - s / 2, y - s / 2, s, s, r)
        // Dark top / lit bottom — the inverse of a raised cube, so an empty
        // socket never reads as a piece.
        g.fillStyle(0x000000, blocked ? 0.22 : 0.13)
        g.fillRoundedRect(x - s / 2, y - s / 2, s, s * 0.3, { tl: r, tr: r, bl: 0, br: 0 })
        g.fillStyle(t.colors.highlight, blocked ? 0.015 : 0.035)
        g.fillRoundedRect(x - s / 2, y + s / 2 - s * 0.16, s, s * 0.16, { tl: 0, tr: 0, bl: r, br: r })
        g.lineStyle(3, blocked ? shade(t.colors.border, -0.08) : t.colors.border, blocked ? 0.45 : 0.7)
        g.strokeRoundedRect(x - s / 2, y - s / 2, s, s, r)
      }
    }).setPosition(this.beltCentre.x, this.beltCentre.y).setDepth(DEPTH.socket)

    this.drawIntakeMark()
  }

  /**
   * Slot 0 is the compaction target — everything slides toward it — but the
   * previous build marked it with a slightly brighter outline that read as
   * noise. It gets a labelled intake chevron that breathes instead.
   */
  private drawIntakeMark(): void {
    if (this.intakeMark) {
      this.tweens.killTweensOf(this.intakeMark)
      this.intakeMark.destroy()
      this.intakeMark = undefined
    }
    const p = this.slots[0]
    if (!p) return
    const t = this.t
    const s = this.cubeSize
    const box = s + 70

    this.intakeMark = bakeGraphics(this, box, box + 60, (g, w, h) => {
      const cx = w / 2
      const cy = h / 2 + 30
      g.lineStyle(4, t.colors.accent, 0.55)
      g.strokeRoundedRect(cx - s / 2 - 9, cy - s / 2 - 9, s + 18, s + 18, t.radius.md + 6)
      // Chevron pointing into the slot.
      g.fillStyle(t.colors.accent, 0.9)
      const ay = cy - s / 2 - 30
      g.fillTriangle(cx, ay + 16, cx - 17, ay - 8, cx + 17, ay - 8)
    }).setPosition(p.x, p.y - 30).setDepth(DEPTH.socket)

    this.p.anim.pulse(this.intakeMark, 1.04, 1500)
  }

  private isCurtainedView(slot: number): boolean {
    return this.state.level.obstacles.some(o =>
      o.kind === 'curtain' && !this.openCurtains.has(o.id) && slot >= o.from && slot <= o.to)
  }

  // ── Cubes ───────────────────────────────────────────────────────────────────

  /**
   * One shared texture per (colour, frozen) pair rather than a live Graphics
   * per cube. Thirteen cubes on a belt is thirteen Graphics re-tessellating a
   * rounded rect, a sheen, a bevel and a frost overlay every single frame.
   */
  private cubeTextureKey(color: CubeColor, frozen: boolean): string {
    const s = this.cubeSize
    const key = `ls_cube_${color}_${frozen ? 'ice' : 'raw'}_${s}`
    if (!this.textures.exists(key)) {
      const t = this.t
      const fill = CUBE_FILL[color]
      bakeTexture(this, key, s + 8, s + 8, (g, w, h) => {
        drawGameTile(g, w / 2, h / 2, s, {
          fill,
          radius: t.radius.md,
          stroke: shade(fill, -0.2),
          strokeWidth: t.stroke.thin,
        }, t)
        if (frozen) {
          // Frost sheet plus a rime edge. The cube colour still reads through,
          // because the player must know what is frozen, not just that it is.
          g.fillStyle(0xbfe6ff, 0.42)
          g.fillRoundedRect(w / 2 - s / 2, h / 2 - s / 2, s, s, t.radius.md)
          drawHighlight(g, w / 2, h / 2, s, s, t.radius.md, 0.22, t)
          g.lineStyle(5, 0xe4f5ff, 0.9)
          g.strokeRoundedRect(w / 2 - s / 2, h / 2 - s / 2, s, s, t.radius.md)
        }
      })
      this.ownedTextures.add(key)
    }
    return key
  }

  private cubeShadowKey(): string {
    const s = this.cubeSize
    const key = `ls_cubeshadow_${s}`
    if (!this.textures.exists(key)) {
      const pad = 34
      bakeTexture(this, key, s + pad * 2, s + pad * 2, (g, w, h) => {
        drawShadow(g, w / 2, h / 2, s, s, { radius: this.t.radius.md }, this.t)
      })
      this.ownedTextures.add(key)
    }
    return key
  }

  private createCubeView(id: string, color: CubeColor, at: Point, frozen: boolean): CubeView {
    const shadow = this.add.image(at.x, at.y, this.cubeShadowKey()).setDepth(DEPTH.shadow)
    const g = this.add.image(at.x, at.y, this.cubeTextureKey(color, frozen)).setDepth(DEPTH.cube)
    const view: CubeView = { g, shadow, color }
    this.cubeViews.set(id, view)
    return view
  }

  private spawnInitialCubes(): void {
    const views: Phaser.GameObjects.GameObject[] = []
    for (let i = 0; i < this.state.cells.length; i++) {
      const cube = this.state.cells[i]
      if (!cube) continue
      const v = this.createCubeView(cube.id, cube.color, this.slots[i], cube.frozen)
      v.shadow.setAlpha(0)
      views.push(v.g)
      this.tweens.add({
        targets: v.shadow, alpha: 1,
        duration: this.t.duration.normal, delay: views.length * 55,
      })
    }
    // The board arrives as a sequence rather than all at once — it reads as a
    // machine loading, and it shows the belt's direction before the first tap.
    this.p.anim.stagger(views, 55)
  }


  // ── Obstacles ───────────────────────────────────────────────────────────────

  private buildObstacles(): void {
    for (const o of this.state.level.obstacles) {
      const parts = this.drawObstacle(o)
      if (parts.length > 0) this.obstacleViews.set(o.id, { parts })
    }
  }

  /**
   * "Clearing N of this colour opens me" — a colour dot and a count on a chip,
   * pushed OUTSIDE the belt along the outward normal. Sitting it on top of the
   * obstacle made it unreadable against the slats, and the unlock condition is
   * the only thing the player can act on.
   */
  private unlockCaption(
    at: Point, color: CubeColor, count: number, extra = 0,
  ): Phaser.GameObjects.GameObject[] {
    const t = this.t
    const dx = at.x - this.beltCentre.x
    const dy = at.y - this.beltCentre.y
    const len = Math.hypot(dx, dy) || 1
    const push = this.cubeSize / 2 + 46 + extra
    const chipW = 96
    // Clamped into the safe rect: an obstacle on the right-hand straight pushes
    // its chip clean off a 1080-wide screen otherwise.
    const safe = this.p.layout.safeRect
    const x = Phaser.Math.Clamp(
      at.x + (dx / len) * push, safe.x + chipW / 2 + 12, safe.x + safe.width - chipW / 2 - 12)
    const y = Phaser.Math.Clamp(
      at.y + (dy / len) * push, safe.y + 40, safe.y + safe.height - 40)

    const bg = bakeGraphics(this, chipW + 16, 60, (g, w, h) => {
      drawPill(g, w / 2, h / 2, chipW, 46, {
        fill: shade(t.colors.background, 0.04),
        stroke: mix(t.colors.border, CUBE_FILL[color], 0.6),
        strokeWidth: 2,
      }, t)
      g.fillStyle(CUBE_FILL[color], 1)
      g.fillRoundedRect(w / 2 - chipW / 2 + 12, h / 2 - 10, 20, 20, 5)
    }).setPosition(x, y).setDepth(DEPTH.obstacle + 1)

    const txt = this.add.text(x + 14, y, String(count),
      this.p.text('caption', t.colors.text)).setOrigin(0.5).setDepth(DEPTH.obstacle + 2)

    return [bg, txt]
  }

  private drawObstacle(o: Obstacle): Phaser.GameObjects.GameObject[] {
    const t = this.t
    const s = this.cubeSize
    const parts: Phaser.GameObjects.GameObject[] = []

    if (o.kind === 'curtain') {
      // A hanging shutter: slats, not a translucent purple wash.
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        const img = bakeGraphics(this, s + 24, s + 24, (g, w, h) => {
          const x = w / 2
          const y = h / 2
          drawRoundedCard(g, x, y, s + 14, s + 14, {
            fill: 0x6a4fc4, radius: t.radius.md + 4,
            stroke: 0xa88cf0, strokeWidth: t.stroke.thin,
          }, t)
          g.lineStyle(3, 0x1d1436, 0.35)
          for (let k = 1; k < 5; k++) {
            const ly = y - (s + 14) / 2 + ((s + 14) / 5) * k
            g.lineBetween(x - (s + 14) / 2 + 6, ly, x + (s + 14) / 2 - 6, ly)
          }
        }).setPosition(p.x, p.y).setDepth(DEPTH.obstacle)
        parts.push(img)
      }
      const head = this.slots[Math.floor((o.from + o.to) / 2)] ?? this.slots[o.from]
      if (head) parts.push(...this.unlockCaption(head, o.requiredColor, o.requiredCount))

    } else if (o.kind === 'ice') {
      // The frozen look is on the cube texture itself; this is the frost halo.
      const p = this.slots[o.slot]
      if (p) {
        const img = bakeGraphics(this, s + 60, s + 60, (g, w, h) => {
          const x = w / 2
          const y = h / 2
          g.lineStyle(6, 0xbfe6ff, 0.8)
          g.strokeRoundedRect(x - s / 2 - 12, y - s / 2 - 12, s + 24, s + 24, t.radius.md + 8)
          // Four frost spurs on the corners.
          g.lineStyle(5, 0xe4f5ff, 0.75)
          const e = s / 2 + 12
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            g.lineBetween(x + sx * e, y + sy * e, x + sx * (e + 14), y + sy * (e + 14))
          }
        }).setPosition(p.x, p.y).setDepth(DEPTH.obstacle)
        parts.push(img)
        parts.push(...this.unlockCaption(p, o.requiredColor, o.requiredCount, 12))
      }

    } else if (o.kind === 'barrier') {
      const a = this.slots[o.at - 1]
      const b = this.slots[o.at]
      if (a && b) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2
        const len = s * 1.15
        const img = bakeGraphics(this, len + 40, 60, (g, w, h) => {
          // A bolted gate, drawn horizontally and rotated into place.
          drawRoundedCard(g, w / 2, h / 2, len, 26, {
            fill: 0xff9f43, radius: 8,
            stroke: shade(0xff9f43, -0.22), strokeWidth: t.stroke.thin,
          }, t)
          g.fillStyle(shade(0xff9f43, -0.3), 1)
          g.fillCircle(w / 2 - len / 2 + 14, h / 2, 6)
          g.fillCircle(w / 2 + len / 2 - 14, h / 2, 6)
        }).setPosition(mx, my).setDepth(DEPTH.obstacle)
        // The gate is baked lying along local +x and rotated onto `ang`, which
        // is the belt's normal — i.e. ACROSS the lane, which is what a wall is.
        img.setRotation(ang)
        parts.push(img)
        parts.push(...this.unlockCaption({ x: mx, y: my }, o.requiredColor, o.requiredCount, 10))
      }

    } else {
      // Hidden: an unmarked crate over the slot.
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        const img = bakeGraphics(this, s + 20, s + 20, (g, w, h) => {
          drawGameTile(g, w / 2, h / 2, s + 10, {
            fill: 0x3c4468, radius: t.radius.md,
            stroke: 0x5a6494, strokeWidth: t.stroke.thin,
          }, t)
        }).setPosition(p.x, p.y).setDepth(DEPTH.obstacle)
        parts.push(img)
        const q = this.add.text(p.x, p.y, '?', this.p.text('heading', 0xaab3e0))
          .setOrigin(0.5).setDepth(DEPTH.obstacle + 1)
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

    // Unlocking space is the biggest thing that happens on an obstacle level,
    // so it gets the loudest per-event feedback in the scene.
    this.p.juice.destroy(at.x, at.y, { color: this.t.colors.accent, intensity: 'medium' })
    this.p.vfx.ring(at.x, at.y, this.cubeSize * 0.8, { color: this.t.colors.accent })

    this.tweens.add({
      targets: view.parts,
      alpha: 0,
      scaleX: became === 'broken' ? 1.3 : 1.12,
      scaleY: became === 'broken' ? 1.3 : 1.12,
      duration: OBSTACLE_MS,
      ease: this.t.ease.out,
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
      // The cube stops being ice; swap it to the unfrozen texture.
      for (const [cid, v] of this.cubeViews) {
        const live = this.state.cells.find(c => c?.id === cid)
        if (live && !live.frozen) {
          v.g.setTexture(this.cubeTextureKey(v.color, false))
          this.p.anim.punch(v.g, 1.18)
        }
      }
    }
    this.refreshReadouts()
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  private buildHeader(): void {
    const t = this.t
    const safe = this.p.layout.safeRect
    const level = this.state.level
    const cx = this.p.layout.width / 2

    // Level chip + name on one line: a number badge carries the progression,
    // which three stacked centred strings did not.
    const chip = this.p.ui.createBadge({
      x: cx, y: safe.y + 72,
      text: `LEVEL ${level.id}  ·  ${this.levelIndex + 1}/${LEVELS.length}`,
      textScale: 'tiny',
      color: shade(t.colors.surface, 0.02),
      textColor: hex(t.colors.accent),
      paddingX: 30, height: 52,
    })
    chip.container.setDepth(DEPTH.hud)
    this.hud.push(chip.container)

    const title = this.add.text(cx, safe.y + 138, level.name.toUpperCase(),
      this.p.text('subheading', t.colors.text)).setOrigin(0.5).setDepth(DEPTH.hud)
    this.hud.push(title)

    const teaches = this.add.text(cx, safe.y + 196, level.teaches, {
      ...this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.15)),
      align: 'center',
      wordWrap: { width: safe.width - 180 },
    }).setOrigin(0.5).setDepth(DEPTH.hud)
    this.hud.push(teaches)

    // Restart, top-right, clear of DebugOverlay's top-left corner.
    const restart = this.p.ui.createIcon({
      x: this.p.layout.safeRight(-70),
      y: safe.y + 82,
      size: 70,
      background: shade(t.colors.surface, 0.02),
      backgroundAlpha: 1,
      radius: t.radius.pill,
      onPress: () => { if (!this.busy) this.loadLevel(this.levelIndex) },
      draw: (g, size) => {
        const r = size * 0.3
        g.lineStyle(size * 0.12, t.colors.muted, 1)
        g.beginPath()
        g.arc(0, 0, r, Phaser.Math.DegToRad(55), Phaser.Math.DegToRad(315), false)
        g.strokePath()
        const a = Phaser.Math.DegToRad(55)
        const hx = Math.cos(a) * r
        const hy = Math.sin(a) * r
        g.fillStyle(t.colors.muted, 1)
        g.fillTriangle(
          hx + size * 0.14, hy + size * 0.02,
          hx - size * 0.05, hy - size * 0.11,
          hx - size * 0.09, hy + size * 0.13,
        )
      },
    })
    restart.container.setDepth(DEPTH.hud)
    this.hud.push(restart.container)
  }

  // ── Centre dashboard ────────────────────────────────────────────────────────

  /**
   * Goals and remaining capacity, inside the loop.
   *
   * They used to sit in a stack above the belt while ~700px of the ring's
   * interior stayed empty. Both readouts describe the belt, so they belong at
   * the thing they describe — and the player's eyes are already there.
   */
  private buildDashboard(): void {
    const t = this.t
    const c = this.beltCentre

    const goalCap = this.add.text(c.x, c.y - 196, 'GOAL',
      this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.3)))
      .setOrigin(0.5).setDepth(DEPTH.dash)
    this.dash.push(goalCap)

    // Goal chips — one per colour, showing cleared/required.
    const goals = this.state.level.goal
    const chipW = 162
    const chipGap = 20
    const totalW = goals.length * chipW + (goals.length - 1) * chipGap
    goals.forEach((goal, i) => {
      const x = c.x - totalW / 2 + chipW / 2 + i * (chipW + chipGap)
      const y = c.y - 126

      const bg = bakeGraphics(this, chipW + 20, 84, (g, w, h) => {
        drawPill(g, w / 2, h / 2, chipW, 64, {
          fill: shade(t.colors.surface, 0.02),
          stroke: mix(t.colors.border, CUBE_FILL[goal.color], 0.5),
          strokeWidth: t.stroke.thin,
        }, t)
        g.fillStyle(CUBE_FILL[goal.color], 1)
        g.fillRoundedRect(w / 2 - chipW / 2 + 16, h / 2 - 15, 30, 30, 8)
        drawHighlight(g, w / 2 - chipW / 2 + 31, h / 2, 30, 30, 8, 0.2, t)
      }).setPosition(x, y).setDepth(DEPTH.dash)

      const text = this.add.text(x + 22, y, `0/${goal.count}`,
        this.p.text('caption', t.colors.text)).setOrigin(0.5).setDepth(DEPTH.dash + 1)

      this.dash.push(bg, text)
      this.goalChips.push({ bg, text, color: goal.color })
    })

    // Capacity gauge. Drawn as an arc because the ring already is one, and
    // because "how much room is left" is the question the whole level asks.
    this.gaugeG = this.add.graphics().setDepth(DEPTH.dash)
    this.dash.push(this.gaugeG)

    this.freeNumber = this.add.text(c.x, c.y + 26, '0',
      this.p.text('display', t.colors.text)).setOrigin(0.5).setDepth(DEPTH.dash + 1)
    this.dash.push(this.freeNumber)

    this.freeCaption = this.add.text(c.x, c.y + 104, 'FREE',
      this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.2)))
      .setOrigin(0.5).setDepth(DEPTH.dash + 1)
    this.dash.push(this.freeCaption)

    this.beltCaption = this.add.text(c.x, c.y + 182, '',
      this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.35)))
      .setOrigin(0.5).setDepth(DEPTH.dash + 1)
    this.dash.push(this.beltCaption)
  }

  /** Amber at 60% full, red at 85% — unchanged thresholds, new presentation. */
  private pressureColor(ratio: number): number {
    return ratio >= 0.85 ? this.t.colors.danger
         : ratio >= 0.6  ? this.t.colors.warning
         : this.t.colors.success
  }

  private refreshReadouts(): void {
    const t = this.t

    for (const chip of this.goalChips) {
      const goal = this.state.level.goal.find(g => g.color === chip.color)
      if (!goal) continue
      const got = Math.min(this.clearedView[chip.color], goal.count)
      chip.text.setText(`${got}/${goal.count}`)
      chip.text.setColor(hex(got >= goal.count ? t.colors.success : t.colors.text))
    }

    const used = this.cubeViews.size
    const usable = usableCapacity(this.state)
    const free = Math.max(0, usable - used)
    const ratio = usable > 0 ? Phaser.Math.Clamp(used / usable, 0, 1) : 0
    const color = this.pressureColor(ratio)

    // The gauge is a Graphics rather than a baked image because it changes, but
    // it is redrawn only when the free count actually moves — not per frame.
    if (free !== this.lastFreeShown) {
      const wasSet = this.lastFreeShown >= 0
      this.lastFreeShown = free

      const c = this.beltCentre
      const g = this.gaugeG
      if (g) {
        const radius = 138
        const start = Phaser.Math.DegToRad(135)
        const sweep = Phaser.Math.DegToRad(270)
        g.clear()
        g.lineStyle(16, shade(t.colors.background, 0.05), 1)
        g.beginPath()
        g.arc(c.x, c.y + 20, radius, start, start + sweep, false)
        g.strokePath()
        if (ratio > 0) {
          g.lineStyle(16, color, 1)
          g.beginPath()
          g.arc(c.x, c.y + 20, radius, start, start + sweep * ratio, false)
          g.strokePath()
        }
      }

      this.freeNumber?.setText(String(free))
      this.freeNumber?.setColor(hex(color))
      if (wasSet && this.freeNumber) this.p.anim.punch(this.freeNumber, 1.12)
    }

    this.beltCaption?.setText(`BELT  ${used} / ${usable}`)
  }

  // ── Batch tray ──────────────────────────────────────────────────────────────

  private buildBatchTray(): void {
    // Rebuilt after every pick, so the old tray (label included) must go first.
    this.destroyBatchTray()

    const t = this.t
    const safe = this.p.layout.safeRect
    const offered = this.state.offered
    if (offered.length === 0) return

    const trayY = safe.y + safe.height - 186
    const maxW = safe.width - 70
    const gap = 26
    const cardW = Math.min(310, (maxW - gap * (offered.length - 1)) / offered.length)
    const cardH = 200
    const totalW = cardW * offered.length + gap * (offered.length - 1)
    const startX = this.p.layout.width / 2 - totalW / 2 + cardW / 2

    this.trayLabel = this.add.text(
      this.p.layout.width / 2, trayY - cardH / 2 - 52, 'CHOOSE A BATCH',
      this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.25)),
    ).setOrigin(0.5).setDepth(DEPTH.hud)

    offered.forEach((batch, i) => {
      const x = startX + i * (cardW + gap)
      const handle = this.p.ui.createButton({
        x, y: trayY,
        text: '',
        width: cardW,
        height: cardH,
        color: shade(t.colors.surface, 0.015),
        radius: t.radius.lg,
        shadow: true,
        minTouch: 0,
        onPress: () => this.onBatchPressed(batch.id, { x, y: trayY }),
      })
      handle.container.setDepth(DEPTH.hud)

      // Preview crates use the same baked textures as the belt, so what you
      // tap and what arrives are visibly the same object.
      const mini = Math.min(64, (cardW - 48) / Math.max(batch.cubes.length, 1))
      const spread = mini + 14
      const originX = -((batch.cubes.length - 1) * spread) / 2
      const scale = mini / this.cubeSize

      batch.cubes.forEach((color, k) => {
        const mx = originX + k * spread
        const img = this.add.image(mx, -6, this.cubeTextureKey(color, false)).setScale(scale)
        handle.container.add(img)
      })

      // Count chip: a 3-cube batch and a 2-cube batch must be distinguishable
      // at a glance, because batch SIZE is the capacity decision.
      const chipY = cardH / 2 - 36
      const chip = bakeGraphics(this, 110, 54, (g, w, h) => {
        drawPill(g, w / 2, h / 2, 86, 40, {
          fill: shade(t.colors.background, 0.03),
          stroke: t.colors.border, strokeWidth: 2,
        }, t)
      })
      chip.setPosition(0, chipY)
      handle.container.add(chip)
      const chipText = this.add.text(0, chipY, `${batch.cubes.length} CUBES`.replace(' CUBES', '×'),
        this.p.text('caption', t.colors.muted)).setOrigin(0.5)
      handle.container.add(chipText)

      this.batchButtons.push(handle)
      this.p.anim.slideIn(handle.container, 'bottom', 90, {
        duration: this.t.duration.normal, delay: i * 60,
      })
    })
  }

  private setBatchesEnabled(enabled: boolean): void {
    for (const b of this.batchButtons) b.setEnabled(enabled)
  }

  private onBatchPressed(batchId: string, from: Point): void {
    if (this.busy) return
    if (this.state.phase === 'LEVEL_COMPLETE' || this.state.phase === 'LEVEL_FAILED') return

    this.spawnFrom = from
    this.p.juice.select()
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
   *
   * Structurally unchanged from the previous version — only the constants moved.
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
            group.forEach((s, k) => {
              const v = this.cubeViews.get(s.cubeId)
              const p = this.slots[s.to]
              // A tiny per-cube offset turns a block slide into a ripple, which
              // is what makes "they find each other" legible.
              if (v && p) this.tweens.add({
                targets: [v.g, v.shadow],
                x: p.x, y: p.y,
                duration: SHIFT_MS,
                delay: Math.min(k * 28, 120),
                ease: this.t.ease.overshoot,
              })
            })
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

  /**
   * The cube travels on an arc from the card the player tapped to its slot.
   * A straight lerp from the tray to the top of the ring passes through the
   * dashboard and reads as a glitch; the arc reads as a throw.
   */
  private animInsert(cubeId: string, color: CubeColor, slot: number): void {
    const to = this.slots[slot]
    if (!to) return

    const from = this.spawnFrom
    const view = this.createCubeView(cubeId, color, from, false)
    view.g.setScale(0.72)
    view.shadow.setAlpha(0)

    const ctrl = {
      x: (from.x + to.x) / 2 + (to.x - from.x) * 0.15,
      y: Math.min(from.y, to.y) - 150,
    }
    const proxy = { k: 0 }
    this.tweens.add({
      targets: proxy, k: 1,
      duration: INSERT_MS,
      ease: 'Sine.InOut',
      onUpdate: () => {
        const k = proxy.k
        const inv = 1 - k
        const x = inv * inv * from.x + 2 * inv * k * ctrl.x + k * k * to.x
        const y = inv * inv * from.y + 2 * inv * k * ctrl.y + k * k * to.y
        view.g.setPosition(x, y)
        view.shadow.setPosition(x, y)
      },
      onComplete: () => {
        view.g.setPosition(to.x, to.y)
        view.shadow.setPosition(to.x, to.y)
        this.p.anim.punch(view.g, 1.12, { duration: this.t.duration.fast })
      },
    })
    this.tweens.add({
      targets: view.g, scaleX: 1, scaleY: 1,
      duration: INSERT_MS * 0.8, ease: this.t.ease.out,
    })
    this.tweens.add({ targets: view.shadow, alpha: 1, duration: INSERT_MS })
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
        scaleX: 0.18, scaleY: 0.18, alpha: 0,
        angle: Phaser.Math.Between(-40, 40),
        duration: CLEAR_MS, ease: this.t.ease.in,
        onComplete: () => {
          this.dyingViews.delete(v)
          v.g.destroy()
          shadow.destroy()
        },
      })
      this.tweens.add({ targets: shadow, alpha: 0, duration: CLEAR_MS * 0.6 })
      // Each cube pops where it stood, so the player sees WHICH cubes matched.
      this.p.vfx.burst(v.g.x, v.g.y, {
        color: CUBE_FILL[e.color], intensity: 'small', distance: 120,
      })
    }

    if (pts.length > 0) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      this.p.vfx.ring(cx, cy, this.cubeSize * 0.9, { color: CUBE_FILL[e.color] })
      // Chain depth scales the payoff, but stays restrained.
      if (e.chainIndex > 0) {
        this.p.vfx.floatingText(cx, cy, `CHAIN ×${e.chainIndex + 1}`, {
          color: this.t.colors.accent, fontSize: 56,
        })
        this.p.vfx.screenShake(2 + e.chainIndex, 140)
      }
    }

    this.clearedView[e.color] += e.cubeIds.length
    this.refreshReadouts()

    // A goal chip that just filled should say so.
    const goal = this.state.level.goal.find(g => g.color === e.color)
    if (goal && this.clearedView[e.color] >= goal.count) {
      const chip = this.goalChips.find(c => c.color === e.color)
      if (chip) this.p.anim.punch(chip.bg, 1.16)
    }
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
    this.p.juice.levelComplete({
      targets: [...this.cubeViews.values()].map(v => v.g),
    })
    const last = this.levelIndex >= LEVELS.length - 1
    this.buildPanel(
      last ? 'ALL LEVELS CLEAR' : 'LEVEL COMPLETE',
      last ? 'You reached the end of the experiment.' : `Picks used: ${this.state.picks}`,
      last ? 'Replay' : 'Continue',
      () => this.loadLevel(last ? 0 : this.levelIndex + 1),
      true,
    )
  }

  private showFail(reason: 'full' | 'noValidPlacement' | 'outOfBatches'): void {
    this.setBatchesEnabled(false)
    const p = this.beltCentre
    this.p.juice.fail(p.x, p.y, { intensity: 'medium' })
    // Shake the belt itself, not just the camera — the belt is what failed.
    for (const v of this.cubeViews.values()) this.p.anim.shake(v.g, 7)
    const why = reason === 'outOfBatches'
      ? 'Out of batches before the goal was met.'
      : 'The belt filled up — no room left to place a cube.'
    this.buildPanel('NO MORE MOVES', why, 'Retry', () => this.loadLevel(this.levelIndex), false)
  }

  private buildPanel(
    title: string, body: string, cta: string, onCta: () => void, won: boolean,
  ): void {
    this.dismissPanel()
    const t = this.t
    const c = this.p.layout.center()
    const panelW = 860
    const panelH = 560

    // The tray belongs to a decision that is over. Sliding it away also stops
    // a stale card sitting under the panel looking tappable.
    for (const b of this.batchButtons) {
      this.p.anim.slideOut(b.container, 'bottom', 120, { duration: t.duration.normal })
    }
    if (this.trayLabel) this.p.anim.fadeOut(this.trayLabel, { duration: t.duration.fast })

    // Scrim: dims the board and swallows taps aimed at anything behind it.
    const scrim = this.add.rectangle(
      this.p.layout.width / 2, this.p.layout.height / 2,
      this.p.layout.width, this.p.layout.height,
      t.colors.background, 1,
    ).setAlpha(0).setDepth(DEPTH.panel - 1).setInteractive()
    this.panelExtras.push(scrim)
    this.tweens.add({ targets: scrim, alpha: 0.62, duration: t.duration.normal })

    this.panel = this.p.ui.createPanel({
      x: c.x, y: c.y,
      width: panelW, height: panelH,
      fill: t.colors.surface,
      stroke: won ? mix(t.colors.border, t.colors.success, 0.5) : t.colors.border,
      strokeWidth: t.stroke.thin,
      radius: t.radius.lg, shadow: true,
    })
    this.panel.container.setDepth(DEPTH.panel)

    const heading = this.add.text(0, -panelH / 2 + 86, title,
      this.p.text('heading', won ? t.colors.success : t.colors.danger)).setOrigin(0.5)
    this.panel.container.add(heading)

    const rule = this.add.graphics()
    rule.fillStyle(t.colors.border, 0.7)
    rule.fillRect(-120, -panelH / 2 + 132, 240, 2)
    this.panel.container.add(rule)

    const bodyLabel = this.add.text(c.x, c.y - 42, body, {
      ...this.p.text('body', t.colors.muted),
      align: 'center',
      wordWrap: { width: panelW - 150 },
    }).setOrigin(0.5).setDepth(DEPTH.panel + 1)
    this.panelExtras.push(bodyLabel)

    const primary = this.p.ui.createButton({
      x: c.x, y: c.y + 96,
      text: cta,
      width: 460, height: 130,
      textScale: 'body',
      color: won ? t.colors.primary : t.colors.surfaceAlt,
      radius: t.radius.md, shadow: true,
      onPress: () => { if (!this.busy) onCta() },
    })
    primary.container.setDepth(DEPTH.panel + 1)
    this.panelButtons.push(primary)

    const retry = this.p.ui.createButton({
      x: c.x, y: c.y + 96 + 130 + 26,
      text: won ? 'Replay level' : 'Back to level 1',
      width: 460, height: 110,
      textScale: 'small',
      color: shade(t.colors.surface, 0.03),
      radius: t.radius.md, shadow: true,
      onPress: () => { if (!this.busy) this.loadLevel(won ? this.levelIndex : 0) },
    })
    retry.container.setDepth(DEPTH.panel + 1)
    this.panelButtons.push(retry)

    this.p.anim.pop(this.panel.container)
    for (const b of this.panelButtons) {
      b.container.setAlpha(0)
      this.tweens.add({
        targets: b.container, alpha: 1,
        duration: t.duration.fast, delay: t.duration.fast,
      })
    }
    bodyLabel.setAlpha(0)
    this.tweens.add({
      targets: bodyLabel, alpha: 1,
      duration: t.duration.fast, delay: t.duration.fast,
    })
  }
}
