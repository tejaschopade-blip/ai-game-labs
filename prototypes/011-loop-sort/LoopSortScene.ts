// Loop Sort DNA — presentation layer.
//
// The logic in LoopSortLogic.ts is authoritative and Phaser-free. This scene
// never inspects sprite positions to decide anything: selectBatch() returns an
// ordered ResolveEvent[] and this file plays that list back as a timeline.
//
// Visual direction: "Soft Toy Factory" — a small moulded-plastic sorting
// machine on a warm paper desk. All tokens live in LoopSortTheme.ts, all
// drawing in LoopSortVisuals.ts; this file owns composition, timing and juice.
//
// Portrait 1080x1920 via Foundation V3's applyPrototypeConfig().

import Phaser from 'phaser'

import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'
import { fadeIn } from '../../src/systems/Transitions'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import type { ButtonHandle, PanelHandle, DotsHandle } from '../../src/ui/UIFactory'
import {
  createPresentation, type Presentation, type Theme,
  drawRoundedCard, drawShadow, drawPill,
  bakeGraphics, bakeTexture, makePressable, type PressableHandle,
  hex, mix,
} from '../../src/presentation'

import { LEVELS } from './LoopSortLevels'
import {
  createGame, selectBatch, occupiedCount, usableCapacity,
} from './LoopSortLogic'
import type {
  CubeColor, GameState, ResolveEvent, Obstacle,
} from './LoopSortTypes'
import {
  loopSortTheme, CUBE_SKIN, MACHINE, GROUND, STATUS, OBSTACLE, MOTION,
} from './LoopSortTheme'
import {
  drawToyCube, drawIceShell, drawConveyor, drawSlotWell, drawChevron,
  drawBatchCard, drawTray, walkPath, type Point,
} from './LoopSortVisuals'

// ── Timeline ──────────────────────────────────────────────────────────────────
//
// Two numbers per event: how long its tween runs, and how far the timeline
// advances before the NEXT event fires. The second is ~55% of the first, so
// motion overlaps instead of queueing. A 3-cube batch with one clear runs about
// 1.3s end to end, with input locked throughout.
//
// (An earlier build ran these at 2-10ms, which removed the animation entirely.
// WATCH -> ANTICIPATE is half this prototype's hypothesis; the fix for a long
// input lock is overlap, not speed.)
const INSERT_MS   = MOTION.enter
const SHIFT_MS    = MOTION.slide
const OBSTACLE_MS = MOTION.obstacle
/** attract -> hold -> pop, played as one chain per matched cube. */
const CLEAR_MS    = MOTION.attract + MOTION.anticipate + MOTION.clear

const INSERT_STEP   = 175
const SHIFT_STEP    = 130
const CLEAR_STEP    = 235
const OBSTACLE_STEP = 250
const CHAIN_BEAT    = 180
const TAIL_MS       = 150

const DEPTH = {
  ground:   -5,
  track:     0,
  socket:    1,
  hub:       2,
  chevron:   3,
  shadow:    4,
  cube:      5,
  obstacle:  8,
  tray:      9,
  hud:      12,
  panel:    100,
}

interface CubeView {
  g: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Image
  color: CubeColor
  frost?: Phaser.GameObjects.Image
  /**
   * The cube's current travel tween. Tracked because an insert drives position
   * from a proxy rather than from the image, so `killTweensOf(image)` cannot
   * reach it — and a cube can be matched while it is still in the air.
   */
  moveTween?: Phaser.Tweens.Tween
}

interface ObstacleView {
  parts: Phaser.GameObjects.GameObject[]
}

interface BatchCardView {
  container: Phaser.GameObjects.Container
  idle: Phaser.GameObjects.Image
  pressed: Phaser.GameObjects.Image
  press: PressableHandle
  restY: number
}

// ── Belt geometry ─────────────────────────────────────────────────────────────

interface BeltPath {
  /** `count` slot centres, evenly spaced by arc length, slot 0 at top-centre. */
  slots: Point[]
  /** The dense path the slots were sampled from — used to draw the machine. */
  path: Point[]
}

/**
 * Points spaced by arc length around a rounded rectangle, starting at
 * top-centre and running clockwise. Slot 0 sits at top-centre because slot 0 is
 * the compaction target.
 *
 * The dense path is returned too: stroking the machine through the *slot*
 * centres draws a coarse polygon whose corners bulge away from the cubes.
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
    const steps = 16
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
  private trayY = 0

  // view objects
  private trackImg?: Phaser.GameObjects.Image
  private socketImg?: Phaser.GameObjects.Image
  private intakeMark?: Phaser.GameObjects.Image
  private chevrons: Phaser.GameObjects.Image[] = []
  private cubeViews = new Map<string, CubeView>()
  /** Views mid-clear: already out of cubeViews but not yet destroyed. */
  private dyingViews = new Set<CubeView>()
  private obstacleViews = new Map<string, ObstacleView>()
  private batchCards: BatchCardView[] = []
  private trayLabel?: Phaser.GameObjects.Text
  private trayPlate?: Phaser.GameObjects.Image
  private hud: Phaser.GameObjects.GameObject[] = []
  private hubParts: Phaser.GameObjects.GameObject[] = []
  private levelDots?: DotsHandle
  private goalChips: Array<{ bg: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; color: CubeColor }> = []
  private gaugeG?: Phaser.GameObjects.Graphics
  private freeNumber?: Phaser.GameObjects.Text
  private beltCaption?: Phaser.GameObjects.Text
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

    this.p = createPresentation(this, {
      theme: loopSortTheme(),
      // Warm paper with a soft pool of light where the machine sits. The
      // vignette is low because the ground is light; its job is to stop the
      // frame reading as an infinite sheet, not to darken the corners.
      background: {
        preset: 'paper',
        patternSpacing: 64,
        patternAlpha: 0.045,
        light: 0.5,
        lightY: 0.47,
        vignette: 0.16,
      },
      sounds: {
        select: 'ls_select', move: 'ls_move', match: 'ls_match', chain: 'ls_chain',
        destroy: 'ls_obstacle', complete: 'ls_success', fail: 'ls_fail',
      },
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

  /**
   * Playtest affordance: `?lvl=12` opens level 13 directly. Twenty levels is a
   * lot to replay to reach the one being tuned, and this costs one line.
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

  update(): void {
    this.overlay.update()
  }

  private teardown(): void {
    this.clearLevel()
    // createPresentation registers its own SHUTDOWN cleanup for the background.
  }

  /** Semantic audio. No assets ship, so every call is a silent no-op today. */
  private sfx(slot: 'select' | 'move' | 'match' | 'chain' | 'destroy' | 'complete' | 'fail'): void {
    this.p.juice.play(slot)
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
    this.drawMachine()
    this.drawSockets()
    this.buildHub()
    this.buildObstacles()
    this.spawnInitialCubes()
    this.buildHeader()
    this.buildBatchTray()
    this.refreshReadouts()
  }

  /**
   * Cancels every pending callback and destroys everything built for the
   * current level. runToken is bumped first so any callback already dequeued
   * this frame becomes a no-op.
   *
   * Deliberately does NOT call tweens.killAll(): that destroys tweens without
   * firing onComplete, stranding the presentation layer's particles on the
   * display list. Tweens are killed per owned object instead, and transient VFX
   * is left to finish and clean itself up.
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
        if (v.frost) { this.tweens.killTweensOf(v.frost); v.frost.destroy() }
      }
    }
    killViews(this.cubeViews.values())
    this.cubeViews.clear()
    killViews(this.dyingViews)
    this.dyingViews.clear()

    for (const o of this.obstacleViews.values()) {
      this.tweens.killTweensOf(o.parts)
      for (const p of o.parts) p.destroy()
    }
    this.obstacleViews.clear()

    this.trackImg?.destroy();  this.trackImg = undefined
    this.socketImg?.destroy(); this.socketImg = undefined
    if (this.intakeMark) {
      this.tweens.killTweensOf(this.intakeMark)
      this.intakeMark.destroy()
      this.intakeMark = undefined
    }
    for (const c of this.chevrons) { this.tweens.killTweensOf(c); c.destroy() }
    this.chevrons = []

    this.destroyBatchTray()

    for (const h of this.hud) { this.tweens.killTweensOf(h); h.destroy() }
    this.hud = []
    for (const h of this.hubParts) { this.tweens.killTweensOf(h); h.destroy() }
    this.hubParts = []

    this.levelDots?.destroy(); this.levelDots = undefined
    this.goalChips = []
    this.gaugeG = undefined
    this.freeNumber = undefined
    this.beltCaption = undefined

    // Shared cube/shadow textures are keyed by size, which changes with the
    // level's capacity, so they are released with the level that made them.
    for (const key of this.ownedTextures) {
      if (this.textures.exists(key)) this.textures.remove(key)
    }
    this.ownedTextures.clear()

    this.dismissPanel()
  }

  private destroyBatchTray(): void {
    for (const c of this.batchCards) {
      this.tweens.killTweensOf(c.container)
      c.press.destroy()
      c.container.destroy()
    }
    this.batchCards = []
    this.trayLabel?.destroy();  this.trayLabel = undefined
    this.trayPlate?.destroy();  this.trayPlate = undefined
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

  /**
   * Composition: header (level + goals) / machine / tray. The machine gets the
   * largest share of the frame — it is the only thing the player reads
   * continuously, and the HUD is deliberately not allowed to grow into it.
   */
  private computeGeometry(): void {
    const safe = this.p.layout.safeRect
    const headerH = 300
    const trayH   = 400

    const top = safe.y + headerH
    const bottom = safe.y + safe.height - trayH
    const availH = Math.max(bottom - top, 420)

    const w = Math.min(safe.width - 120, 880)
    const h = Math.min(availH - 90, 880)
    this.beltCentre = { x: this.p.layout.width / 2, y: top + availH / 2 }

    const belt = beltPoints(
      this.beltCentre.x, this.beltCentre.y, w, h,
      Math.min(w, h) * 0.24, this.state.level.capacity,
    )
    this.slots = belt.slots
    this.beltPath = belt.path

    const gap = this.slots.length > 1
      ? Phaser.Math.Distance.BetweenPoints(this.slots[0], this.slots[1])
      : 160
    this.cubeSize = Math.round(Phaser.Math.Clamp(gap * 0.6, 58, 126))

    this.trayY = safe.y + safe.height - 182
    this.spawnFrom = { x: this.p.layout.width / 2, y: this.trayY }
  }

  /**
   * Square canvas the belt layers bake into, plus the offset that puts the belt
   * at its centre. The Image is then positioned at `beltCentre`, so
   * texture-centre lands on belt-centre and every slot sits exactly where
   * `this.slots` says it does.
   */
  private beltBakeBox(): { box: number; dx: number; dy: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of this.beltPath) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const pad = this.cubeSize + 110
    const box = Math.ceil(Math.max(maxX - minX, maxY - minY) + pad * 2)
    return { box, dx: box / 2 - this.beltCentre.x, dy: box / 2 - this.beltCentre.y }
  }

  private drawMachine(): void {
    const { box, dx, dy } = this.beltBakeBox()
    this.trackImg = bakeGraphics(this, box, box, g => {
      drawConveyor(g, this.beltPath, dx, dy, this.cubeSize)
    }).setPosition(this.beltCentre.x, this.beltCentre.y).setDepth(DEPTH.track)

    this.buildChevrons()
  }

  /**
   * Flow indicators: a handful of chevrons along the belt whose opacity runs
   * around the loop in sequence. Nothing moves, so it costs one tween each —
   * but the eye reads direction, which is the one thing a static ring cannot
   * say on its own.
   */
  private buildChevrons(): void {
    const size = Math.round(this.cubeSize * 0.34)
    const key = bakeTexture(this, `ls_chevron_${size}`, size * 1.6, size * 1.6, (g, w, h) => {
      drawChevron(g, w / 2, h / 2, size, MACHINE.casingLight, 1)
    })
    this.ownedTextures.add(key)

    // Sample the path finely once, then pick the point midway between each pair
    // of slots. Placing chevrons by raw arc length lands them on top of the
    // slots, where they read as marks on the cubes rather than as flow.
    const samples: Array<{ p: Point; a: number; d: number }> = []
    walkPath(this.beltPath, 5, (p, nx, ny, dist) => {
      // (nx, ny) is the normal; travel direction is (ny, -nx).
      samples.push({ p, a: Math.atan2(-nx, ny), d: dist })
    })
    if (samples.length === 0) return
    const total = samples[samples.length - 1].d
    const count = this.slots.length

    for (let i = 0; i < count; i++) {
      const want = ((i + 0.5) / count) * total
      let best = samples[0]
      let bestGap = Infinity
      for (const s of samples) {
        const gap = Math.abs(s.d - want)
        if (gap < bestGap) { bestGap = gap; best = s }
      }
      const img = this.add.image(best.p.x, best.p.y, key)
        .setRotation(best.a)
        .setDepth(DEPTH.chevron)
        .setAlpha(0.1)
      this.tweens.add({
        targets: img,
        alpha: 0.3,
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
        delay: (i / count) * 1800,
      })
      this.chevrons.push(img)
    }
  }

  private drawSockets(): void {
    if (this.socketImg) { this.socketImg.destroy(); this.socketImg = undefined }
    const s = this.cubeSize
    const { box, dx, dy } = this.beltBakeBox()

    this.socketImg = bakeGraphics(this, box, box, g => {
      for (let i = 0; i < this.slots.length; i++) {
        const p = this.slots[i]
        drawSlotWell(g, p.x + dx, p.y + dy, s, this.isCurtainedView(i))
      }
    }).setPosition(this.beltCentre.x, this.beltCentre.y).setDepth(DEPTH.socket)

    this.drawIntakeMark()
  }

  /** Slot 0 is the compaction target. It gets a labelled, breathing intake. */
  private drawIntakeMark(): void {
    if (this.intakeMark) {
      this.tweens.killTweensOf(this.intakeMark)
      this.intakeMark.destroy()
      this.intakeMark = undefined
    }
    const p = this.slots[0]
    if (!p) return
    const s = this.cubeSize
    const box = s + 96

    this.intakeMark = bakeGraphics(this, box, box + 70, (g, w, h) => {
      const cx = w / 2
      const cy = h / 2 + 35
      g.lineStyle(6, MACHINE.accent, 0.55)
      g.strokeRoundedRect(cx - s / 2 - 12, cy - s / 2 - 12, s + 24, s + 24, s * 0.27 + 10)
      g.fillStyle(MACHINE.accent, 0.95)
      const ay = cy - s / 2 - 36
      g.fillTriangle(cx, ay + 18, cx - 19, ay - 9, cx + 19, ay - 9)
    }).setPosition(p.x, p.y - 35).setDepth(DEPTH.socket)

    this.p.anim.pulse(this.intakeMark, 1.05, 1600)
  }

  private isCurtainedView(slot: number): boolean {
    return this.state.level.obstacles.some(o =>
      o.kind === 'curtain' && !this.openCurtains.has(o.id) && slot >= o.from && slot <= o.to)
  }

  // ── Hub ─────────────────────────────────────────────────────────────────────

  /**
   * The centre of the loop: a moulded plate carrying the one readout that is
   * genuinely about the belt — how much room is left. Goals live in the header
   * (they are level state, not machine state), so the hub stays quiet and the
   * cubes keep the eye.
   */
  private buildHub(): void {
    const c = this.beltCentre
    const inner = Math.min(
      Math.abs(this.slots[0].y - c.y),
      Math.abs(this.slots[Math.floor(this.slots.length / 4)].x - c.x),
    ) - this.cubeSize / 2 - 46
    const radius = Math.max(140, Math.min(196, inner))

    const plate = bakeGraphics(this, radius * 2 + 40, radius * 2 + 40, (g, w, h) => {
      const x = w / 2
      const y = h / 2
      g.fillStyle(0x6b5a42, 0.05)
      g.fillCircle(x, y + 7, radius)
      g.fillStyle(MACHINE.casingLight, 0.5)
      g.fillCircle(x, y, radius)
      g.fillStyle(0xffffff, 0.35)
      g.fillCircle(x, y - 4, radius - 9)
      g.lineStyle(3, MACHINE.casingDark, 0.28)
      g.strokeCircle(x, y, radius)
      // Bolt heads at the quarters — a moulded part, not a disc.
      g.fillStyle(MACHINE.casingDark, 0.22)
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2
        g.fillCircle(x + Math.cos(a) * (radius - 24), y + Math.sin(a) * (radius - 24), 7)
      }
    }).setPosition(c.x, c.y).setDepth(DEPTH.hub)
    this.hubParts.push(plate)

    this.gaugeG = this.add.graphics().setDepth(DEPTH.hub + 1)
    this.hubParts.push(this.gaugeG)

    this.freeNumber = this.add.text(c.x, c.y - 10, '0',
      this.p.text('heading', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.hub + 2)
    this.hubParts.push(this.freeNumber)

    const cap = this.add.text(c.x, c.y + 44, 'FREE',
      this.p.text('caption', GROUND.inkSoft)).setOrigin(0.5).setDepth(DEPTH.hub + 2)
    this.hubParts.push(cap)

    this.beltCaption = this.add.text(c.x, c.y + 150, '',
      this.p.text('caption', mix(GROUND.inkSoft, GROUND.paper, 0.35)))
      .setOrigin(0.5).setDepth(DEPTH.hub + 2)
    this.hubParts.push(this.beltCaption)
  }

  /** Amber at 60% full, red at 85% — unchanged thresholds, new presentation. */
  private pressureColor(ratio: number): number {
    return ratio >= 0.85 ? STATUS.danger : ratio >= 0.6 ? STATUS.warn : STATUS.ok
  }

  private refreshReadouts(): void {
    for (const chip of this.goalChips) {
      const goal = this.state.level.goal.find(g => g.color === chip.color)
      if (!goal) continue
      const got = Math.min(this.clearedView[chip.color], goal.count)
      chip.text.setText(`${got}/${goal.count}`)
      chip.text.setColor(hex(got >= goal.count ? STATUS.ok : GROUND.ink))
    }

    const used = this.cubeViews.size
    const usable = usableCapacity(this.state)
    const free = Math.max(0, usable - used)
    const ratio = usable > 0 ? Phaser.Math.Clamp(used / usable, 0, 1) : 0
    const color = this.pressureColor(ratio)

    // Redrawn only when the free count actually moves, not every frame.
    if (free !== this.lastFreeShown) {
      const wasSet = this.lastFreeShown >= 0
      this.lastFreeShown = free

      const c = this.beltCentre
      const g = this.gaugeG
      if (g) {
        const radius = 104
        const start = Phaser.Math.DegToRad(132)
        const sweep = Phaser.Math.DegToRad(276)
        g.clear()
        g.lineStyle(12, MACHINE.casingDark, 0.3)
        g.beginPath()
        g.arc(c.x, c.y + 6, radius, start, start + sweep, false)
        g.strokePath()
        if (ratio > 0) {
          g.lineStyle(12, color, 1)
          g.beginPath()
          g.arc(c.x, c.y + 6, radius, start, start + sweep * ratio, false)
          g.strokePath()
        }
      }

      this.freeNumber?.setText(String(free))
      this.freeNumber?.setColor(hex(ratio >= 0.6 ? color : GROUND.ink))
      if (wasSet && this.freeNumber) this.p.anim.punch(this.freeNumber, 1.14)
    }

    this.beltCaption?.setText(`${used} / ${usable} ON BELT`)
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  private buildHeader(): void {
    const t = this.t
    const safe = this.p.layout.safeRect
    const level = this.state.level
    const cx = this.p.layout.width / 2

    const title = this.add.text(cx, safe.y + 76, `LEVEL ${level.id}`,
      this.p.text('heading', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.hud)
    this.hud.push(title)

    // Position within the current block of five. Levels are grouped in fives
    // and the first five are the showcase, so the block is the unit that means
    // something to the player.
    const inBlock = this.levelIndex % 5
    this.levelDots = this.p.ui.createDots({
      x: cx, y: safe.y + 136,
      count: 5, active: inBlock + 1,
      size: 18, gap: 18,
      color: MACHINE.accent,
      emptyColor: 0xd9cdb8,
    })
    this.levelDots.container.setDepth(DEPTH.hud)

    const name = this.add.text(cx, safe.y + 186, level.name.toUpperCase(),
      this.p.text('caption', GROUND.inkSoft)).setOrigin(0.5).setDepth(DEPTH.hud)
    this.hud.push(name)

    // Goal chips: a cube face and a count. The face is the same art the belt
    // uses, so "collect these" needs no legend.
    const goals = level.goal
    const chipW = 168
    const chipGap = 20
    const totalW = goals.length * chipW + (goals.length - 1) * chipGap
    goals.forEach((goal, i) => {
      const x = cx - totalW / 2 + chipW / 2 + i * (chipW + chipGap)
      const y = safe.y + 258

      const bg = bakeGraphics(this, chipW + 24, 92, (g, w, h) => {
        drawShadow(g, w / 2, h / 2, chipW, 66, { radius: 33, dy: 5, spread: 4, alpha: 0.1 }, t)
        drawPill(g, w / 2, h / 2, chipW, 66, {
          fill: GROUND.card,
          stroke: mix(GROUND.cardEdge, CUBE_SKIN[goal.color].body, 0.45),
          strokeWidth: 3,
        }, t)
        drawToyCube(g, w / 2 - chipW / 2 + 36, h / 2, 42, goal.color, t)
      }).setPosition(x, y).setDepth(DEPTH.hud)

      const text = this.add.text(x + 30, y, `0/${goal.count}`,
        this.p.text('caption', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.hud + 1)

      this.hud.push(bg, text)
      this.goalChips.push({ bg, text, color: goal.color })
    })

    // Restart, top-right, clear of DebugOverlay's top-left corner.
    const restart = this.p.ui.createIcon({
      x: this.p.layout.safeRight(-76),
      y: safe.y + 86,
      size: 68,
      background: GROUND.card,
      backgroundAlpha: 1,
      radius: t.radius.pill,
      onPress: () => { if (!this.busy) this.loadLevel(this.levelIndex) },
      draw: (g, size) => {
        const r = size * 0.3
        g.lineStyle(size * 0.13, GROUND.inkSoft, 1)
        g.beginPath()
        g.arc(0, 0, r, Phaser.Math.DegToRad(55), Phaser.Math.DegToRad(315), false)
        g.strokePath()
        const a = Phaser.Math.DegToRad(55)
        const hx = Math.cos(a) * r
        const hy = Math.sin(a) * r
        g.fillStyle(GROUND.inkSoft, 1)
        g.fillTriangle(
          hx + size * 0.15, hy + size * 0.02,
          hx - size * 0.05, hy - size * 0.12,
          hx - size * 0.09, hy + size * 0.14,
        )
      },
    })
    restart.container.setDepth(DEPTH.hud)
    this.hud.push(restart.container)
  }

  // ── Cubes ───────────────────────────────────────────────────────────────────

  /**
   * One shared texture per colour rather than a live Graphics per cube. A cube
   * costs seven fills to draw; thirteen of them re-tessellating every frame is
   * the single most expensive thing a board like this can do.
   */
  private cubeTextureKey(color: CubeColor): string {
    const s = this.cubeSize
    const key = `ls_cube_${color}_${s}`
    if (!this.textures.exists(key)) {
      bakeTexture(this, key, s + 10, s + 10, (g, w, h) => {
        drawToyCube(g, w / 2, h / 2, s, color, this.t)
      })
      this.ownedTextures.add(key)
    }
    return key
  }

  private frostTextureKey(stage: 0 | 1 | 2): string {
    const s = this.cubeSize
    const key = `ls_frost_${stage}_${s}`
    if (!this.textures.exists(key)) {
      bakeTexture(this, key, s + 24, s + 24, (g, w, h) => {
        drawIceShell(g, w / 2, h / 2, s, stage)
      })
      this.ownedTextures.add(key)
    }
    return key
  }

  private cubeShadowKey(): string {
    const s = this.cubeSize
    const key = `ls_cubeshadow_${s}`
    if (!this.textures.exists(key)) {
      const pad = 40
      bakeTexture(this, key, s + pad * 2, s + pad * 2, (g, w, h) => {
        drawShadow(g, w / 2, h / 2, s, s, { radius: s * 0.27 }, this.t)
      })
      this.ownedTextures.add(key)
    }
    return key
  }

  private createCubeView(id: string, color: CubeColor, at: Point, frozen: boolean): CubeView {
    const shadow = this.add.image(at.x, at.y, this.cubeShadowKey()).setDepth(DEPTH.shadow)
    const g = this.add.image(at.x, at.y, this.cubeTextureKey(color)).setDepth(DEPTH.cube)
    const view: CubeView = { g, shadow, color }
    if (frozen) {
      view.frost = this.add.image(at.x, at.y, this.frostTextureKey(0)).setDepth(DEPTH.cube + 1)
    }
    this.cubeViews.set(id, view)
    return view
  }

  /** Keeps a cube's shadow and frost locked to its body. */
  private syncCube(v: CubeView): void {
    v.shadow.setPosition(v.g.x, v.g.y)
    v.frost?.setPosition(v.g.x, v.g.y)
  }

  private spawnInitialCubes(): void {
    const bodies: Phaser.GameObjects.GameObject[] = []
    for (let i = 0; i < this.state.cells.length; i++) {
      const cube = this.state.cells[i]
      if (!cube) continue
      const v = this.createCubeView(cube.id, cube.color, this.slots[i], cube.frozen)
      v.shadow.setAlpha(0)
      v.frost?.setAlpha(0)
      bodies.push(v.g)
      this.tweens.add({
        targets: [v.shadow, ...(v.frost ? [v.frost] : [])],
        alpha: 1,
        duration: this.t.duration.normal,
        delay: bodies.length * 60,
      })
    }
    // The board loads as a sequence, which shows the belt's direction before
    // the player has tapped anything.
    this.p.anim.stagger(bodies, 60)
  }

  // ── Obstacles ───────────────────────────────────────────────────────────────

  private buildObstacles(): void {
    for (const o of this.state.level.obstacles) {
      const parts = this.drawObstacle(o)
      if (parts.length > 0) this.obstacleViews.set(o.id, { parts })
    }
  }

  /**
   * "Clearing N of this colour opens me", as a chip pushed outside the belt.
   * Sitting it on the obstacle made it unreadable, and the unlock condition is
   * the only thing about an obstacle the player can act on.
   */
  private unlockChip(
    at: Point, color: CubeColor, count: number, extra = 0,
  ): Phaser.GameObjects.GameObject[] {
    const t = this.t
    const dx = at.x - this.beltCentre.x
    const dy = at.y - this.beltCentre.y
    const len = Math.hypot(dx, dy) || 1
    const push = this.cubeSize / 2 + 52 + extra
    const chipW = 104

    const safe = this.p.layout.safeRect
    const minX = safe.x + chipW / 2 + 14
    const maxX = safe.x + safe.width - chipW / 2 - 14

    let x = at.x + (dx / len) * push
    let y = at.y + (dy / len) * push

    // An obstacle on a left or right straight pushes its chip off-screen, and
    // clamping alone slides it back on top of the obstacle it labels. Drop it
    // below the slot instead, where there is always room.
    if (x < minX || x > maxX) {
      x = at.x
      y = at.y + this.cubeSize / 2 + 46
    }
    x = Phaser.Math.Clamp(x, minX, maxX)
    y = Phaser.Math.Clamp(y, safe.y + 44, safe.y + safe.height - 44)

    const bg = bakeGraphics(this, chipW + 20, 68, (g, w, h) => {
      drawShadow(g, w / 2, h / 2, chipW, 52, { radius: 26, dy: 4, spread: 3, alpha: 0.12 }, t)
      drawPill(g, w / 2, h / 2, chipW, 52, {
        fill: GROUND.card,
        stroke: mix(GROUND.cardEdge, CUBE_SKIN[color].body, 0.55),
        strokeWidth: 3,
      }, t)
      drawToyCube(g, w / 2 - chipW / 2 + 26, h / 2, 32, color, t)
    }).setPosition(x, y).setDepth(DEPTH.obstacle + 1)

    const txt = this.add.text(x + 20, y, String(count),
      this.p.text('caption', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.obstacle + 2)

    return [bg, txt]
  }

  private drawObstacle(o: Obstacle): Phaser.GameObjects.GameObject[] {
    const t = this.t
    const s = this.cubeSize
    const parts: Phaser.GameObjects.GameObject[] = []

    if (o.kind === 'curtain') {
      // A roller shutter. Origin is the TOP edge so it can roll up on open.
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        const boxH = s + 28
        const img = bakeGraphics(this, s + 28, boxH, (g, w, h) => {
          drawRoundedCard(g, w / 2, h / 2, s + 18, s + 18, {
            fill: OBSTACLE.curtain, radius: s * 0.27 + 5,
            stroke: OBSTACLE.curtainDark, strokeWidth: 4,
            highlight: 0.22, bevel: 0.1,
          }, t)
          g.lineStyle(4, OBSTACLE.curtainSlat, 0.45)
          for (let k = 1; k < 5; k++) {
            const ly = h / 2 - (s + 18) / 2 + ((s + 18) / 5) * k
            g.lineBetween(w / 2 - (s + 18) / 2 + 8, ly, w / 2 + (s + 18) / 2 - 8, ly)
          }
        })
        img.setOrigin(0.5, 0).setPosition(p.x, p.y - boxH / 2).setDepth(DEPTH.obstacle)
        parts.push(img)
      }
      const head = this.slots[Math.floor((o.from + o.to) / 2)] ?? this.slots[o.from]
      if (head) parts.push(...this.unlockChip(head, o.requiredColor, o.requiredCount))

    } else if (o.kind === 'ice') {
      // The frost sheet itself lives on the cube view; this is the frame around
      // it, which is what shakes and cracks.
      const p = this.slots[o.slot]
      if (p) {
        const img = bakeGraphics(this, s + 72, s + 72, (g, w, h) => {
          const x = w / 2
          const y = h / 2
          g.lineStyle(7, OBSTACLE.iceRim, 0.85)
          g.strokeRoundedRect(x - s / 2 - 14, y - s / 2 - 14, s + 28, s + 28, s * 0.27 + 10)
          g.lineStyle(5, OBSTACLE.iceDeep, 0.8)
          const e = s / 2 + 14
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            g.lineBetween(x + sx * e, y + sy * e, x + sx * (e + 16), y + sy * (e + 16))
          }
        }).setPosition(p.x, p.y).setDepth(DEPTH.obstacle)
        parts.push(img)
        parts.push(...this.unlockChip(p, o.requiredColor, o.requiredCount, 14))
      }

    } else if (o.kind === 'barrier') {
      const a = this.slots[o.at - 1]
      const b = this.slots[o.at]
      if (a && b) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        // Normal to travel: a wall sits ACROSS the lane.
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2
        const len = s * 1.3
        const img = bakeGraphics(this, len + 50, 74, (g, w, h) => {
          drawShadow(g, w / 2, h / 2, len, 30, { radius: 15, dy: 5, spread: 3, alpha: 0.16 }, t)
          drawRoundedCard(g, w / 2, h / 2, len, 30, {
            fill: OBSTACLE.barrier, radius: 15,
            stroke: OBSTACLE.barrierDark, strokeWidth: 4,
            highlight: 0.3, bevel: 0.12,
          }, t)
          // Bolt heads: a mechanical part, not a painted line.
          g.fillStyle(OBSTACLE.barrierDark, 0.85)
          g.fillCircle(w / 2 - len / 2 + 17, h / 2, 7)
          g.fillCircle(w / 2 + len / 2 - 17, h / 2, 7)
          g.fillStyle(0xffffff, 0.5)
          g.fillCircle(w / 2 - len / 2 + 17, h / 2 - 2, 3)
          g.fillCircle(w / 2 + len / 2 - 17, h / 2 - 2, 3)
        }).setPosition(mx, my).setDepth(DEPTH.obstacle)
        img.setRotation(ang)
        parts.push(img)
        parts.push(...this.unlockChip({ x: mx, y: my }, o.requiredColor, o.requiredCount, 34))
      }

    } else {
      // Hidden: an unmarked wooden crate over the slot.
      for (let i = o.from; i <= o.to && i < this.slots.length; i++) {
        const p = this.slots[i]
        const img = bakeGraphics(this, s + 34, s + 34, (g, w, h) => {
          drawShadow(g, w / 2, h / 2, s + 14, s + 14, { radius: s * 0.27, dy: 6, spread: 4, alpha: 0.16 }, t)
          drawRoundedCard(g, w / 2, h / 2, s + 14, s + 14, {
            fill: OBSTACLE.crate, radius: s * 0.27,
            stroke: OBSTACLE.crateDark, strokeWidth: 4,
            highlight: 0.26, bevel: 0.1,
          }, t)
          // Crate battens.
          g.lineStyle(6, OBSTACLE.crateDark, 0.5)
          g.lineBetween(w / 2 - s * 0.4, h / 2 - s * 0.4, w / 2 + s * 0.4, h / 2 + s * 0.4)
          g.lineBetween(w / 2 + s * 0.4, h / 2 - s * 0.4, w / 2 - s * 0.4, h / 2 + s * 0.4)
        }).setPosition(p.x, p.y).setDepth(DEPTH.obstacle)
        parts.push(img)

        const q = this.add.text(p.x, p.y, '?', this.p.text('heading', 0xfff6e6))
          .setOrigin(0.5).setDepth(DEPTH.obstacle + 1)
        parts.push(q)
      }
    }
    return parts
  }

  /**
   * Obstacle state changes are the slowest, loudest thing in the scene, because
   * they are the only events that change what the board can hold. Each kind
   * gets its own three-beat sequence: react, break, reveal.
   */
  private animObstacle(id: string, became: 'open' | 'broken' | 'revealed' | 'unlocked'): void {
    const view = this.obstacleViews.get(id)
    const def = this.state.level.obstacles.find(o => o.id === id)
    if (!view || !def) return
    const token = this.runToken

    let at: Point = this.beltCentre
    if (def.kind === 'ice') at = this.slots[def.slot] ?? this.beltCentre
    else if (def.kind === 'barrier') at = this.slots[def.at] ?? this.beltCentre
    else at = this.slots[def.from] ?? this.beltCentre

    this.sfx('destroy')
    this.obstacleViews.delete(id)

    // Beat 1 — the whole thing shudders. Same for every kind: something is
    // about to give.
    for (const part of view.parts) {
      const px = (part as unknown as { x: number }).x
      this.tweens.add({
        targets: part, x: px + 5,
        duration: 45, yoyo: true, repeat: 2, ease: 'Sine.InOut',
        onComplete: () => { (part as unknown as { x: number }).x = px },
      })
    }

    const finish = (): void => {
      for (const p of view.parts) p.destroy()
    }

    if (def.kind === 'curtain') {
      // Beat 2 — the shutter rolls up, slat by slat.
      this.time.delayedCall(150, () => {
        if (token !== this.runToken) return
        view.parts.forEach((part, i) => {
          this.tweens.add({
            targets: part,
            scaleY: 0, alpha: 0,
            duration: OBSTACLE_MS * 0.55,
            delay: i * 55,
            ease: 'Back.In',
          })
        })
        this.p.vfx.dust(at.x, at.y, { color: OBSTACLE.curtainDark, intensity: 'medium' })
      })
      this.time.delayedCall(OBSTACLE_MS, () => { if (token === this.runToken) finish() })

    } else if (def.kind === 'ice') {
      // Beat 2 — the frost cracks in two stages, then shatters.
      const frozen = [...this.cubeViews.values()].filter(v => v.frost)
      this.time.delayedCall(130, () => {
        if (token !== this.runToken) return
        for (const v of frozen) v.frost?.setTexture(this.frostTextureKey(1))
        this.p.vfx.spark(at.x, at.y, { color: OBSTACLE.iceRim, intensity: 'small', distance: 60 })
      })
      this.time.delayedCall(260, () => {
        if (token !== this.runToken) return
        for (const v of frozen) {
          v.frost?.setTexture(this.frostTextureKey(2))
          if (v.frost) this.p.anim.punch(v.frost, 1.08)
        }
      })
      this.time.delayedCall(390, () => {
        if (token !== this.runToken) return
        // Beat 3 — it breaks, the cube underneath is revealed and reacts.
        this.p.vfx.shards(at.x, at.y, { color: OBSTACLE.ice, intensity: 'medium' })
        this.p.vfx.ring(at.x, at.y, this.cubeSize * 0.7, { color: OBSTACLE.iceRim })
        for (const v of frozen) {
          this.tweens.killTweensOf(v.frost!)
          v.frost!.destroy()
          v.frost = undefined
          this.p.anim.squash(v.g, 0.18)
        }
        this.p.vfx.screenShake(2, 130)
        finish()
      })

    } else if (def.kind === 'barrier') {
      // Beat 2 — the bolts release and the gate retracts into the rails.
      this.time.delayedCall(170, () => {
        if (token !== this.runToken) return
        this.p.vfx.spark(at.x, at.y, { color: OBSTACLE.barrier, intensity: 'medium', distance: 90 })
        this.tweens.add({
          targets: view.parts[0],
          scaleX: 0,
          duration: OBSTACLE_MS * 0.5,
          ease: 'Back.In',
        })
        this.tweens.add({
          targets: view.parts.slice(1),
          alpha: 0,
          duration: OBSTACLE_MS * 0.4,
        })
      })
      this.time.delayedCall(OBSTACLE_MS, () => {
        if (token !== this.runToken) return
        this.p.vfx.ring(at.x, at.y, this.cubeSize * 0.8, { color: OBSTACLE.barrier })
        finish()
      })

    } else {
      // Hidden — the crate lifts off and the contents are revealed. This is a
      // discovery, so it pops upward rather than fading out.
      this.time.delayedCall(140, () => {
        if (token !== this.runToken) return
        this.tweens.add({
          targets: view.parts,
          y: `-=${this.cubeSize * 0.7}`,
          alpha: 0,
          scaleX: 1.16, scaleY: 1.16,
          angle: 9,
          duration: OBSTACLE_MS * 0.6,
          ease: 'Back.In',
          onComplete: finish,
        })
        this.p.vfx.spark(at.x, at.y, { color: MACHINE.accent, intensity: 'medium' })
        this.p.vfx.ring(at.x, at.y, this.cubeSize * 0.7, { color: MACHINE.accent })
        this.p.vfx.dust(at.x, at.y, { color: OBSTACLE.crateDark })
      })
    }

    if (became === 'open') {
      this.openCurtains.add(id)
      // Redraw the sockets only after the shutter has actually gone, or the
      // slots brighten under a curtain that is still on screen.
      this.time.delayedCall(OBSTACLE_MS * 0.6, () => {
        if (token === this.runToken) this.drawSockets()
      })
    }
    this.refreshReadouts()
  }

  // ── Batch tray ──────────────────────────────────────────────────────────────

  /**
   * Batch cards are physical objects on the desk, not menu buttons: pressing
   * one sinks it toward its shadow, releasing springs it back, and choosing it
   * throws its contents at the machine.
   */
  private buildBatchTray(): void {
    this.destroyBatchTray()

    const t = this.t
    const safe = this.p.layout.safeRect
    const offered = this.state.offered
    if (offered.length === 0) return

    const cardH = 196
    const maxW = safe.width - 96
    const gap = 26
    const cardW = Math.min(300, (maxW - gap * (offered.length - 1)) / offered.length)
    const totalW = cardW * offered.length + gap * (offered.length - 1)
    const startX = this.p.layout.width / 2 - totalW / 2 + cardW / 2
    const trayY = this.trayY

    this.trayPlate = bakeGraphics(this, safe.width - 20, cardH + 104, (g, w, h) => {
      drawTray(g, w / 2, h / 2, safe.width - 44, cardH + 80, t)
    }).setPosition(this.p.layout.width / 2, trayY).setDepth(DEPTH.tray)

    this.trayLabel = this.add.text(
      this.p.layout.width / 2, trayY - cardH / 2 - 76, 'CHOOSE A BATCH',
      this.p.text('caption', GROUND.inkSoft),
    ).setOrigin(0.5).setDepth(DEPTH.hud)

    const cardKey = (state: 'idle' | 'pressed'): string => {
      const key = `ls_card_${state}_${Math.round(cardW)}_${cardH}`
      if (!this.textures.exists(key)) {
        bakeTexture(this, key, cardW + 60, cardH + 60, (g, w, h) => {
          drawBatchCard(g, w / 2, h / 2, cardW, cardH, t, state)
        })
        this.ownedTextures.add(key)
      }
      return key
    }

    offered.forEach((batch, i) => {
      const x = startX + i * (cardW + gap)

      const idle = this.add.image(0, 0, cardKey('idle'))
      const pressed = this.add.image(0, 0, cardKey('pressed')).setVisible(false)

      // Preview cubes use the same baked textures as the belt, so what you tap
      // and what arrives are visibly the same object.
      const mini = Math.min(72, (cardW - 56) / Math.max(batch.cubes.length, 1))
      const spread = mini + 16
      const originX = -((batch.cubes.length - 1) * spread) / 2
      const scale = mini / this.cubeSize
      const previews = batch.cubes.map((color, k) =>
        this.add.image(originX + k * spread, -14, this.cubeTextureKey(color)).setScale(scale))

      const chipY = cardH / 2 - 34
      const chipKey = `ls_countchip_${batch.cubes.length}`
      if (!this.textures.exists(chipKey)) {
        bakeTexture(this, chipKey, 120, 60, (g, w, h) => {
          drawPill(g, w / 2, h / 2, 92, 42, {
            fill: 0xf0e7d7, stroke: GROUND.cardEdge, strokeWidth: 2, highlight: 0,
          }, t)
        })
        this.ownedTextures.add(chipKey)
      }
      const chip = this.add.image(0, chipY, chipKey)
      const chipText = this.add.text(0, chipY, `×${batch.cubes.length}`,
        this.p.text('caption', GROUND.inkSoft)).setOrigin(0.5)

      const container = this.add.container(x, trayY, [idle, pressed, ...previews, chip, chipText])
        .setSize(cardW, cardH)
        .setDepth(DEPTH.tray + 1)

      const sink = (down: boolean): void => {
        idle.setVisible(!down)
        pressed.setVisible(down)
        this.tweens.add({
          targets: container,
          y: trayY + (down ? 9 : 0),
          duration: MOTION.press,
          ease: down ? 'Quad.Out' : 'Back.Out',
        })
      }

      const press = makePressable(this, container, {
        hitSize: { width: cardW, height: cardH },
        hitPadding: 18,
        pressScale: 0.97,
        onPressStart: () => sink(true),
        onCancel: () => sink(false),
        onPress: () => {
          sink(false)
          this.onBatchPressed(batch.id, { x, y: trayY })
        },
      }, t)

      this.batchCards.push({ container, idle, pressed, press, restY: trayY })

      container.setAlpha(0)
      this.tweens.add({
        targets: container,
        alpha: 1, y: trayY,
        duration: this.t.duration.normal,
        delay: i * 65,
        ease: 'Back.Out',
      })
      container.y = trayY + 60
    })
  }

  private setBatchesEnabled(enabled: boolean): void {
    for (const c of this.batchCards) c.press.setEnabled(enabled)
  }

  private onBatchPressed(batchId: string, from: Point): void {
    if (this.busy) return
    if (this.state.phase === 'LEVEL_COMPLETE' || this.state.phase === 'LEVEL_FAILED') return

    this.spawnFrom = from
    this.sfx('select')

    // The chosen card hands its contents over rather than just disappearing.
    const card = this.batchCards.find(c => Math.abs(c.container.x - from.x) < 2)
    if (card) {
      this.tweens.add({
        targets: card.container,
        y: card.restY - 22, alpha: 0.35,
        duration: this.t.duration.fast, ease: 'Quad.Out',
      })
    }

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
          this.schedule(token, t, () => this.animShift(group))
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
          this.schedule(token, t + MOTION.settle, () => this.showFail(reason))
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
   * Cubes compacting toward slot 0. A small per-cube delay turns a block slide
   * into a ripple, which is what makes "they find each other" legible.
   */
  private animShift(group: Array<{ cubeId: string; to: number }>): void {
    group.forEach((s, k) => {
      const v = this.cubeViews.get(s.cubeId)
      const p = this.slots[s.to]
      if (!v || !p) return
      const tween = this.tweens.add({
        targets: v.g,
        x: p.x, y: p.y,
        duration: SHIFT_MS,
        delay: Math.min(k * 30, 120),
        ease: 'Back.Out',
        easeParams: [1.1],
        onUpdate: () => this.syncCube(v),
        onComplete: () => {
          v.moveTween = undefined
          if (this.dyingViews.has(v)) return
          this.syncCube(v)
          this.p.anim.squash(v.g, 0.08, { duration: MOTION.land })
        },
      })
      v.moveTween = tween
    })
    if (group.length > 0) this.sfx('move')
  }

  /**
   * A cube travelling from the card the player tapped to its slot. It arcs:
   * a straight lerp from the tray to the top of the ring passes through the hub
   * and reads as a glitch, where an arc reads as a throw.
   */
  private animInsert(cubeId: string, color: CubeColor, slot: number): void {
    const to = this.slots[slot]
    if (!to) return

    const from = this.spawnFrom
    const view = this.createCubeView(cubeId, color, from, false)
    view.g.setScale(0.55)
    view.shadow.setAlpha(0)

    const ctrl = {
      x: (from.x + to.x) / 2 + (to.x - from.x) * 0.18,
      y: Math.min(from.y, to.y) - 170,
    }
    const proxy = { k: 0 }
    view.moveTween = this.tweens.add({
      targets: proxy, k: 1,
      duration: INSERT_MS,
      ease: 'Sine.InOut',
      onUpdate: () => {
        const k = proxy.k
        const inv = 1 - k
        view.g.setPosition(
          inv * inv * from.x + 2 * inv * k * ctrl.x + k * k * to.x,
          inv * inv * from.y + 2 * inv * k * ctrl.y + k * k * to.y,
        )
        this.syncCube(view)
      },
      onComplete: () => {
        view.moveTween = undefined
        // A cube can be matched mid-flight: the clear chain is already running
        // on this image, and anim.squash would kill it and strand the cube.
        if (this.dyingViews.has(view)) return
        view.g.setPosition(to.x, to.y)
        this.syncCube(view)
        // Impact: squash, a puff of dust, and it settles.
        this.p.anim.squash(view.g, 0.16, { duration: MOTION.land })
        this.p.vfx.dust(to.x, to.y + this.cubeSize * 0.42, {
          color: MACHINE.casingLight, intensity: 'small',
        })
      },
    })
    this.tweens.add({
      targets: view.g, scaleX: 1, scaleY: 1,
      duration: INSERT_MS * 0.7, ease: 'Back.Out',
    })
    this.tweens.add({ targets: view.shadow, alpha: 1, duration: INSERT_MS })
    this.refreshReadouts()
  }

  /**
   * The payoff. Three beats, and the animation — not a label — carries the
   * information:
   *
   *   attract   the matched cubes lean into each other and brighten
   *   hold      a beat where nothing moves, so the connection registers
   *   pop       flash, burst, shrink out, floating count
   *
   * Chain depth escalates burst size, shake and text, but never past the point
   * where the board stops being readable.
   */
  private animClear(e: { cubeIds: string[]; color: CubeColor; slots: number[]; chainIndex: number }): void {
    const skin = CUBE_SKIN[e.color]
    const views: CubeView[] = []
    for (const id of e.cubeIds) {
      const v = this.cubeViews.get(id)
      if (!v) continue
      views.push(v)
      this.cubeViews.delete(id)
      this.dyingViews.add(v)
      // Whatever the cube was doing, the match owns it now.
      v.moveTween?.remove()
      v.moveTween = undefined
      this.tweens.killTweensOf(v.g)
    }
    if (views.length === 0) return

    const cx = views.reduce((s, v) => s + v.g.x, 0) / views.length
    const cy = views.reduce((s, v) => s + v.g.y, 0) / views.length
    const chain = e.chainIndex

    for (const v of views) {
      const towardX = v.g.x + (cx - v.g.x) * 0.16
      const towardY = v.g.y + (cy - v.g.y) * 0.16

      this.tweens.add({
        targets: v.shadow,
        alpha: 0,
        duration: CLEAR_MS * 0.7,
        delay: MOTION.attract,
      })

      this.tweens.chain({
        targets: v.g,
        onComplete: () => {
          this.dyingViews.delete(v)
          v.g.destroy()
          v.shadow.destroy()
          v.frost?.destroy()
        },
        tweens: [
          // 1. attract + swell
          {
            x: towardX, y: towardY, scaleX: 1.14, scaleY: 1.14,
            duration: MOTION.attract, ease: 'Sine.Out',
            onUpdate: () => this.syncCube(v),
          },
          // 2. hold, flashed white — the beat that says "connected"
          {
            scaleX: 1.14, scaleY: 1.14,
            duration: MOTION.anticipate,
            onStart: () => v.g.setTintFill(0xffffff),
          },
          // 3. pop
          {
            scaleX: 0.1, scaleY: 0.1, alpha: 0,
            angle: Phaser.Math.Between(-35, 35),
            duration: MOTION.clear, ease: 'Back.In',
            onStart: () => {
              v.g.clearTint()
              this.p.vfx.burst(v.g.x, v.g.y, {
                color: skin.body,
                intensity: chain > 0 ? 'medium' : 'small',
                distance: 150 + chain * 40,
              })
            },
          },
        ],
      })
    }

    // Group feedback lands on the hold, not on the pop, so the two beats read
    // as cause and effect.
    this.time.delayedCall(MOTION.attract, () => {
      this.p.vfx.ring(cx, cy, this.cubeSize * 0.85, { color: skin.body })
      this.p.vfx.glow(cx, cy, this.cubeSize * 0.9, { color: skin.body })
    })
    this.time.delayedCall(MOTION.attract + MOTION.anticipate, () => {
      this.p.vfx.floatingText(cx, cy - this.cubeSize * 0.2,
        chain > 0 ? `CHAIN ×${chain + 1}` : `+${e.cubeIds.length}`,
        { color: chain > 0 ? MACHINE.accent : skin.body, fontSize: chain > 0 ? 58 : 46 })
      this.p.vfx.screenShake(1.5 + chain * 1.6, 110 + chain * 40)
      this.sfx(chain > 0 ? 'chain' : 'match')
    })

    this.clearedView[e.color] += e.cubeIds.length
    this.refreshReadouts()

    const goal = this.state.level.goal.find(g => g.color === e.color)
    if (goal && this.clearedView[e.color] >= goal.count) {
      const chip = this.goalChips.find(c => c.color === e.color)
      if (chip) this.p.anim.punch(chip.bg, 1.18)
    }
  }

  private onTimelineEnd(): void {
    this.busy = false
    if (this.state.phase === 'LEVEL_COMPLETE' || this.state.phase === 'LEVEL_FAILED') return
    this.buildBatchTray()
    this.refreshReadouts()
  }

  // ── End of level ────────────────────────────────────────────────────────────

  /**
   * The board gets a moment before the panel arrives: the remaining cubes hop
   * in sequence, the machine throws confetti, and only then does the UI cover
   * it. Cutting straight to a dialog throws away the payoff the player just
   * earned.
   */
  private showComplete(): void {
    this.setBatchesEnabled(false)
    const token = this.runToken
    this.sfx('complete')

    const bodies = [...this.cubeViews.values()].map(v => v.g)
    bodies.forEach((b, i) => {
      this.tweens.add({
        targets: b, y: b.y - 26,
        duration: 170, delay: i * 70, yoyo: true, ease: 'Sine.Out',
        onUpdate: () => {
          const v = [...this.cubeViews.values()].find(c => c.g === b)
          if (v) this.syncCube(v)
        },
      })
    })
    for (const c of this.chevrons) this.p.anim.punch(c, 1.5)

    this.p.vfx.confetti({
      colors: [CUBE_SKIN.red.body, CUBE_SKIN.blue.body, CUBE_SKIN.green.body,
               CUBE_SKIN.yellow.body, MACHINE.accent],
    })
    this.p.vfx.ring(this.beltCentre.x, this.beltCentre.y, this.cubeSize * 1.4,
      { color: STATUS.ok })
    this.p.vfx.screenShake(2.5, 220)

    const last = this.levelIndex >= LEVELS.length - 1
    this.time.delayedCall(MOTION.settle + bodies.length * 40, () => {
      if (token !== this.runToken) return
      this.buildPanel(
        last ? 'ALL LEVELS CLEAR' : 'LEVEL COMPLETE',
        last ? 'You reached the end of the experiment.' : `Solved in ${this.state.picks} picks.`,
        last ? 'Replay' : 'Next level',
        () => this.loadLevel(last ? 0 : this.levelIndex + 1),
        true,
      )
    })
  }

  /**
   * Failure is calm and explains itself. The board shakes once, the belt turns
   * red, and the panel says which of the two failure conditions happened —
   * "you lost" without "why" is the least useful message a puzzle can send.
   */
  private showFail(reason: 'full' | 'noValidPlacement' | 'outOfBatches'): void {
    this.setBatchesEnabled(false)
    const token = this.runToken
    this.sfx('fail')

    for (const v of this.cubeViews.values()) this.p.anim.shake(v.g, 6)
    this.p.vfx.screenShake(3, 200)

    // The belt itself reads as the thing that failed.
    if (this.gaugeG) {
      this.freeNumber?.setColor(hex(STATUS.danger))
      this.p.anim.punch(this.freeNumber!, 1.2)
    }

    const why = reason === 'outOfBatches'
      ? 'The batch queue ran out before the goal was met.'
      : 'The belt filled up — there was no room left to place a cube.'

    this.time.delayedCall(MOTION.settle, () => {
      if (token !== this.runToken) return
      this.buildPanel('OUT OF ROOM', why, 'Try again',
        () => this.loadLevel(this.levelIndex), false)
    })
  }

  private buildPanel(
    title: string, body: string, cta: string, onCta: () => void, won: boolean,
  ): void {
    this.dismissPanel()
    const t = this.t
    const c = this.p.layout.center()
    const panelW = Math.min(this.p.layout.width - 120, 840)
    const panelH = 560

    // The decision is over; the tray hands the screen back.
    for (const card of this.batchCards) {
      this.p.anim.slideOut(card.container, 'bottom', 140, { duration: t.duration.normal })
    }
    if (this.trayLabel) this.p.anim.fadeOut(this.trayLabel, { duration: t.duration.fast })

    const scrim = this.add.rectangle(
      this.p.layout.width / 2, this.p.layout.height / 2,
      this.p.layout.width, this.p.layout.height,
      GROUND.ink, 1,
    ).setAlpha(0).setDepth(DEPTH.panel - 1).setInteractive()
    this.panelExtras.push(scrim)
    this.tweens.add({ targets: scrim, alpha: 0.42, duration: t.duration.normal })

    this.panel = this.p.ui.createPanel({
      x: c.x, y: c.y,
      width: panelW, height: panelH,
      fill: GROUND.card,
      stroke: won ? mix(GROUND.cardEdge, STATUS.ok, 0.5) : GROUND.cardEdge,
      strokeWidth: 3,
      radius: t.radius.lg, shadow: true,
    })
    this.panel.container.setDepth(DEPTH.panel)

    const heading = this.add.text(0, -panelH / 2 + 92, title,
      this.p.text('subheading', won ? STATUS.ok : GROUND.ink)).setOrigin(0.5)
    this.panel.container.add(heading)

    const rule = this.add.graphics()
    rule.fillStyle(GROUND.cardEdge, 1)
    rule.fillRect(-110, -panelH / 2 + 140, 220, 3)
    this.panel.container.add(rule)

    const bodyLabel = this.add.text(c.x, c.y - 30, body, {
      ...this.p.text('body', GROUND.inkSoft),
      align: 'center',
      wordWrap: { width: panelW - 150 },
    }).setOrigin(0.5).setDepth(DEPTH.panel + 1)
    this.panelExtras.push(bodyLabel)

    const primary = this.p.ui.createButton({
      x: c.x, y: c.y + 110,
      text: cta,
      width: 440, height: 124,
      textScale: 'body',
      color: won ? STATUS.ok : MACHINE.accent,
      textColor: '#ffffff',
      radius: t.radius.md, shadow: true,
      onPress: () => { if (!this.busy) onCta() },
    })
    primary.container.setDepth(DEPTH.panel + 1)
    this.panelButtons.push(primary)

    const secondary = this.p.ui.createButton({
      x: c.x, y: c.y + 110 + 124 + 26,
      text: won ? 'Replay level' : 'Back to level 1',
      width: 440, height: 104,
      textScale: 'small',
      color: 0xf0e7d7,
      textColor: hex(GROUND.inkSoft),
      radius: t.radius.md, shadow: true,
      onPress: () => { if (!this.busy) this.loadLevel(won ? this.levelIndex : 0) },
    })
    secondary.container.setDepth(DEPTH.panel + 1)
    this.panelButtons.push(secondary)

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
