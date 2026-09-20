// Loop Sort — Continuous Conveyor Match-3.
//
// THE ONE IDEA
//   The belt never stops. The player never places a cube. They watch a ring of
//   cells turn past a fixed intake chute, and they decide *which batch* to drop
//   and *at what moment*. The moment is the aim.
//
// WHAT THIS FILE OWNS
//   Presentation and timing only. Every rule lives in LoopSortLogic; every
//   colour, radius and duration in LoopSortTheme; every knob in LoopSortTuning.
//   The scene's job is to make `rotation` look like a machine.
//
// HOW MOTION WORKS
//   Nothing on the belt is tweened to a position. Every belt object — cube,
//   empty well, tread bar, target bracket — is placed every frame from a single
//   arc-length sample of the track:
//
//       screenPos = track.at(((rotation + cell) / capacity) mod 1)
//
//   A shove changes a cube's logical `cell` by one; its drawn `visCell` chases
//   it exponentially. That is the entire movement system, and it is why the
//   belt has a constant speed through the corners and never snaps.

import Phaser from 'phaser'

import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'
import { fadeIn } from '../../src/systems/Transitions'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import type { ButtonHandle, PanelHandle, DotsHandle } from '../../src/ui/UIFactory'
import {
  createPresentation, makePressable, bakeGraphics, bakeTexture,
  drawShadow, drawPill, hex, mix,
  type Presentation, type PressableHandle, type Theme,
} from '../../src/presentation'

import { LEVELS } from './LoopSortLevels'
import {
  INTAKE_T, advance, canRelease, createGame, describeBelt,
  freeCount, goalProgress, intakeCell, matchSizeOf, occupiedCount, releaseBatch,
} from './LoopSortLogic'
import type { CubeColor, GameState, ReleaseEvent } from './LoopSortTypes'
import {
  CUBE_SKIN, GROUND, MACHINE, MOTION, STATUS, loopSortTheme,
} from './LoopSortTheme'
import {
  LoopTrack, buildLoopTrack, drawBatchCard, drawChute, drawConveyor,
  drawSlotWell, drawTargetRing, drawToyCube, drawTray, drawTread,
  type Point, type TrackSample,
} from './LoopSortVisuals'
import { SPEED_STEPS, effectiveSpeed, tuning } from './LoopSortTuning'

const DEPTH = {
  track:   0,
  tread:   1,
  well:    2,
  hub:     3,
  target:  4,
  chute:   5,
  cube:    6,
  chuteLip: 7,
  tray:    9,
  hud:    12,
  panel: 100,
}

/**
 * A cube on screen. `cell` is the truth from the logic; `visCell` is what is
 * drawn and lags behind it, which is what turns an instant logical shove into a
 * visible slide.
 */
interface CubeView {
  img: Phaser.GameObjects.Image
  color: CubeColor
  cell: number
  visCell: number
  /** Entry offset in screen space, tweened to zero as the cube leaves the chute. */
  ox: number
  oy: number
  /** Cleared cubes keep riding the belt while they pop, then are destroyed. */
  dying: boolean
}

interface BatchCardView {
  container: Phaser.GameObjects.Container
  idle: Phaser.GameObjects.Image
  pressed: Phaser.GameObjects.Image
  press: PressableHandle
  batchId: string
  restY: number
  enabled: boolean
}

export class LoopSortScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private p!: Presentation
  private t!: Theme

  private state!: GameState
  private levelIndex = 0

  // ── Geometry ────────────────────────────────────────────────────────────────
  private track!: LoopTrack
  private beltCentre: Point = { x: 0, y: 0 }
  private cubeSize = 110
  private trayY = 0
  private chute: Point = { x: 0, y: 0 }
  /** Unit vector pointing out of the belt at the intake — the drop direction. */
  private chuteOut: Point = { x: 0, y: 1 }

  // ── Belt objects ────────────────────────────────────────────────────────────
  private trackImg?: Phaser.GameObjects.Image
  private wells: Phaser.GameObjects.Image[] = []
  private treads: Phaser.GameObjects.Image[] = []
  private cubeViews: CubeView[] = []
  private targetImg?: Phaser.GameObjects.Image
  private targetFree = true
  private chuteParts: Phaser.GameObjects.GameObject[] = []

  // ── HUD ─────────────────────────────────────────────────────────────────────
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

  private ownedTextures = new Set<string>()
  private runToken = 0
  private lastFreeShown = -1
  private speedStep = 0
  private ended = false

  constructor() { super({ key: 'LoopSortScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    applyPrototypeConfig(this, {
      name: '011-loop-sort',
      sceneKey: 'LoopSortScene',
      orientation: 'portrait',
    })

    this.p = createPresentation(this, {
      theme: loopSortTheme(),
      background: {
        preset: 'paper',
        patternSpacing: 64,
        patternAlpha: 0.045,
        light: 0.5,
        lightY: 0.44,
        vignette: 0.16,
      },
      sounds: {
        select: 'ls_select', move: 'ls_move', match: 'ls_match', chain: 'ls_chain',
        destroy: 'ls_pop', complete: 'ls_success', fail: 'ls_fail',
      },
    })
    this.t = this.p.theme

    // Reset run-scoped tuning so a scene restart never inherits a debug speed.
    tuning.paused = false
    tuning.speedScale = 1
    this.speedStep = 0

    this.overlay = new DebugOverlay(this, '011-loop-sort')
    this.overlay.addWatch('Level',   () => `${this.levelIndex + 1}/${LEVELS.length} — ${this.state?.level.name ?? ''}`)
    this.overlay.addWatch('State',   () => this.state?.phase ?? '-')
    this.overlay.addWatch('Belt',    () => this.state ? describeBelt(this.state) : '-')
    this.overlay.addWatch('Cubes',   () => this.state
      ? `${occupiedCount(this.state)}/${this.state.cells.length}  free ${freeCount(this.state)}` : '-')
    this.overlay.addWatch('Speed',   () => this.state
      ? `${effectiveSpeed(this.state.level.speed).toFixed(2)} cells/s${tuning.paused ? ' (PAUSED)' : ''}` : '-')
    this.overlay.addWatch('Match',   () => this.state
      ? `size ${matchSizeOf(this.state)} · ${this.state.matches} made · ${this.state.totalCleared} cleared` : '-')
    this.overlay.addWatch('Intake',  () => this.state ? `cell ${intakeCell(this.state)}` : '-')
    this.overlay.addWatch('Keys',    () => 'P=pause  O=speed  N=next  B=back')

    this.bindDebugKeys()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown())

    this.loadLevel(this.startLevelIndex())
    fadeIn(this, this.t.duration.normal)
  }

  /** Playtest affordance: `?lvl=4` opens level 5 directly. */
  private startLevelIndex(): number {
    try {
      const raw = new URLSearchParams(window.location.search).get('lvl')
      const n = raw === null ? 0 : Number(raw)
      return Number.isFinite(n) ? Phaser.Math.Clamp(Math.trunc(n), 0, LEVELS.length - 1) : 0
    } catch {
      return 0
    }
  }

  /**
   * Experiment controls. R (restart) and D (overlay) are already owned by
   * DebugOverlay, so these four avoid them. Slow motion is the important one —
   * a mechanic built on prediction has to be watchable frame by frame.
   */
  private bindDebugKeys(): void {
    const kb = this.input.keyboard
    if (!kb) return
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', () => { tuning.paused = !tuning.paused })
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.O).on('down', () => {
      this.speedStep = (this.speedStep + 1) % SPEED_STEPS.length
      tuning.speedScale = SPEED_STEPS[this.speedStep]
    })
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.N).on('down', () => this.loadLevel(this.levelIndex + 1))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.B).on('down', () => this.loadLevel(this.levelIndex - 1))
  }

  update(_time: number, delta: number): void {
    this.overlay.update()
    if (!this.state) return

    const dt = Math.min(delta, 50) / 1000
    advance(this.state, dt)
    this.syncBelt(dt)
    this.syncTarget()
  }

  private teardown(): void {
    this.clearLevel()
  }

  private sfx(slot: 'select' | 'move' | 'match' | 'chain' | 'destroy' | 'complete' | 'fail'): void {
    this.p.juice.play(slot)
  }

  // ── Level construction ──────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    this.clearLevel()

    this.levelIndex = Phaser.Math.Clamp(index, 0, LEVELS.length - 1)
    this.state = createGame(LEVELS[this.levelIndex])
    this.lastFreeShown = -1
    this.ended = false

    this.computeGeometry()
    this.drawMachine()
    this.buildTreads()
    this.buildWells()
    this.buildChute()
    this.buildTarget()
    this.buildHub()
    this.spawnInitialCubes()
    this.buildHeader()
    this.buildBatchTray()
    this.refreshReadouts()
    this.syncBelt(0)
  }

  /**
   * Cancels pending callbacks and destroys everything built for the level.
   * Deliberately does not call tweens.killAll(): that would strand the
   * presentation layer's particles on the display list.
   */
  private clearLevel(): void {
    this.runToken++
    this.time.removeAllEvents()

    for (const v of this.cubeViews) {
      this.tweens.killTweensOf(v.img)
      v.img.destroy()
    }
    this.cubeViews = []

    for (const w of this.wells) w.destroy()
    this.wells = []
    for (const tr of this.treads) tr.destroy()
    this.treads = []
    for (const c of this.chuteParts) { this.tweens.killTweensOf(c); c.destroy() }
    this.chuteParts = []

    this.trackImg?.destroy();  this.trackImg = undefined
    this.targetImg?.destroy(); this.targetImg = undefined

    for (const part of this.hubParts) part.destroy()
    this.hubParts = []
    this.gaugeG = undefined
    this.freeNumber = undefined
    this.beltCaption = undefined

    for (const h of this.hud) h.destroy()
    this.hud = []
    this.goalChips = []
    this.levelDots?.destroy(); this.levelDots = undefined

    this.destroyBatchTray()
    this.dismissPanel()

    for (const key of this.ownedTextures) {
      if (this.textures.exists(key)) this.textures.remove(key)
    }
    this.ownedTextures.clear()
  }

  private destroyBatchTray(): void {
    for (const c of this.batchCards) {
      c.press.destroy()
      this.tweens.killTweensOf(c.container)
      c.container.destroy()
    }
    this.batchCards = []
    this.trayLabel?.destroy(); this.trayLabel = undefined
    this.trayPlate?.destroy(); this.trayPlate = undefined
  }

  private dismissPanel(): void {
    this.panel?.destroy(); this.panel = undefined
    for (const b of this.panelButtons) b.destroy()
    this.panelButtons = []
    for (const e of this.panelExtras) e.destroy()
    this.panelExtras = []
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  private computeGeometry(): void {
    const safe = this.p.layout.safeRect
    const headerH = 300
    const trayH = 430

    const top = safe.y + headerH
    const bottom = safe.y + safe.height - trayH
    const availH = Math.max(bottom - top, 460)

    const cap = this.state.cells.length
    let w = Math.min(safe.width - 130, 860)
    let h = Math.min(availH - 190, 880)
    const makeTrack = (): LoopTrack => buildLoopTrack(
      this.beltCentre.x, this.beltCentre.y, w, h, Math.min(w, h) * 0.26,
    )

    this.beltCentre = { x: this.p.layout.width / 2, y: top + availH / 2 - 30 }
    this.track = makeTrack()

    // A cell of arc length sets the cube size. FILL is how much of a cell a cube
    // covers: at 0.8 two cubes in touching cells leave a fifth of a cube between
    // them, which still reads as "these two are together". Much below that and
    // the player cannot tell a run of three from three cubes near each other —
    // which is the one thing this game has to communicate.
    const FILL = 0.8
    const spacing = this.track.length / cap
    this.cubeSize = Math.round(Phaser.Math.Clamp(spacing * FILL, 54, 160))

    // If the biggest sensible cube still leaves the cells too far apart, the
    // belt is too big for its cell count — so shrink the belt rather than
    // inflate the cube past the point where it stops looking like a toy block.
    const want = this.cubeSize / FILL
    if (spacing > want) {
      const k = (cap * want) / this.track.length
      w *= k
      h *= k
      this.track = makeTrack()
    }

    const mouth = this.track.at(INTAKE_T)
    const dx = Math.cos(mouth.angle)
    const dy = Math.sin(mouth.angle)
    // Outward normal of a clockwise loop.
    this.chuteOut = { x: dy, y: -dx }
    this.chute = {
      x: mouth.x + this.chuteOut.x * (this.cubeSize / 2 + 78),
      y: mouth.y + this.chuteOut.y * (this.cubeSize / 2 + 78),
    }

    this.trayY = safe.y + safe.height - 196
  }

  /** Screen position and travel angle of a (possibly fractional) cell, right now. */
  private cellPoint(cellF: number): TrackSample {
    const cap = this.state.cells.length
    const raw = (this.state.rotation + cellF) / cap
    return this.track.at(raw)
  }

  private beltBakeBox(): { box: number; dx: number; dy: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of this.track.path) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const pad = this.cubeSize + 110
    const box = Math.ceil(Math.max(maxX - minX, maxY - minY) + pad * 2)
    return { box, dx: box / 2 - this.beltCentre.x, dy: box / 2 - this.beltCentre.y }
  }

  // ── The machine ─────────────────────────────────────────────────────────────

  private drawMachine(): void {
    const { box, dx, dy } = this.beltBakeBox()
    this.trackImg = bakeGraphics(this, box, box, g => {
      drawConveyor(g, this.track.path, dx, dy, this.cubeSize)
    }).setPosition(this.beltCentre.x, this.beltCentre.y).setDepth(DEPTH.track)
  }

  /**
   * Tread bars sitting between the cells. They are the belt's *surface*, so
   * they travel with it — this is what says "moving machine" even when the belt
   * is empty and nothing else on screen is changing.
   */
  private buildTreads(): void {
    const len = this.cubeSize + 12
    const key = bakeTexture(this, `ls_tread_${Math.round(len)}`, 24, len + 8, (g, w, h) => {
      drawTread(g, w / 2, h / 2, len)
    })
    this.ownedTextures.add(key)

    // Two per cell: on the half-cell and on the quarter, so the surface reads as
    // a continuous moving band rather than as one mark per cube.
    const cap = this.state.cells.length
    for (let i = 0; i < cap * 2; i++) {
      this.treads.push(this.add.image(0, 0, key).setDepth(DEPTH.tread))
    }
  }

  private buildWells(): void {
    const s = this.cubeSize
    const key = bakeTexture(this, `ls_well_${s}`, s + 12, s + 12, (g, w, h) => {
      drawSlotWell(g, w / 2, h / 2, s)
    })
    this.ownedTextures.add(key)

    for (let i = 0; i < this.state.cells.length; i++) {
      this.wells.push(this.add.image(0, 0, key).setDepth(DEPTH.well))
    }
  }

  private buildChute(): void {
    const w = this.cubeSize + 40
    const h = 150
    const img = bakeGraphics(this, w * 2, h + 40, (g, bw, bh) => {
      drawChute(g, bw / 2, bh / 2, w, h)
    }).setPosition(this.chute.x, this.chute.y).setDepth(DEPTH.chute)
    // Rotate the funnel so its mouth always faces the belt, whatever INTAKE_T is.
    img.setRotation(Math.atan2(this.chuteOut.y, this.chuteOut.x) - Math.PI / 2)
    this.chuteParts.push(img)

    // No floating label: it collided with the tray caption, and between the
    // hazard stripes, the funnel shape and the bracket that snaps from cell to
    // cell, the intake already explains itself.
    this.p.anim.pulse(img, 1.03, 1600)
  }

  /**
   * The bracket around the cell currently under the chute.
   *
   * This is the prototype's key affordance. Without it a player can see that
   * the belt moves but cannot tell what tapping *now* would do, and the whole
   * mechanic collapses into guessing. Green means the cell is empty and the
   * batch drops straight in; amber means it is taken and the machine will shove.
   */
  private buildTarget(): void {
    const s = this.cubeSize
    for (const [name, color] of [['free', STATUS.ok], ['busy', MACHINE.accent]] as const) {
      const key = `ls_target_${name}_${s}`
      if (!this.textures.exists(key)) {
        bakeTexture(this, key, s * 1.6, s * 1.6, (g, w, h) => {
          drawTargetRing(g, w / 2, h / 2, s, color)
        })
        this.ownedTextures.add(key)
      }
    }
    this.targetImg = this.add.image(this.chute.x, this.chute.y, `ls_target_free_${s}`)
      .setDepth(DEPTH.target)
    this.targetFree = true
    this.p.anim.pulse(this.targetImg, 1.05, 1000)
  }

  // ── Per-frame belt sync ─────────────────────────────────────────────────────

  /**
   * Places every belt object from `rotation`. No tweens are involved: a tween to
   * a fixed screen point would fight the belt, which is exactly the bug that
   * makes conveyor prototypes look like they teleport.
   */
  private syncBelt(dt: number): void {
    const cap = this.state.cells.length
    const half = cap / 2
    const k = dt > 0 ? 1 - Math.exp(-tuning.slideRate * dt) : 1

    for (let i = 0; i < this.wells.length; i++) {
      const p = this.cellPoint(i)
      this.wells[i].setPosition(p.x, p.y)
    }

    for (let i = 0; i < this.treads.length; i++) {
      const p = this.cellPoint(i * 0.5 + 0.25)
      this.treads[i].setPosition(p.x, p.y).setRotation(p.angle)
    }

    for (const v of this.cubeViews) {
      // Shortest way round the ring, so a cube shoved from cell 11 to cell 0
      // slides one step forward instead of unwinding the whole loop.
      let d = v.cell - v.visCell
      d = ((d + half) % cap + cap) % cap - half
      v.visCell += d * k
      v.visCell = ((v.visCell % cap) + cap) % cap

      const p = this.cellPoint(v.visCell)
      v.img.setPosition(p.x + v.ox, p.y + v.oy)
    }
  }

  private syncTarget(): void {
    if (!this.targetImg) return
    const cell = intakeCell(this.state)
    const p = this.cellPoint(cell)
    this.targetImg.setPosition(p.x, p.y)

    const free = this.state.cells[cell] === null
    if (free !== this.targetFree) {
      this.targetFree = free
      this.targetImg.setTexture(`ls_target_${free ? 'free' : 'busy'}_${this.cubeSize}`)
    }
  }

  // ── Cubes ───────────────────────────────────────────────────────────────────

  private cubeTextureKey(color: CubeColor): string {
    const s = this.cubeSize
    const key = `ls_cube_${color}_${s}`
    if (!this.textures.exists(key)) {
      bakeTexture(this, key, s + 46, s + 46, (g, w, h) => {
        drawToyCube(g, w / 2, h / 2, s, color, this.t, { shadow: true })
      })
      this.ownedTextures.add(key)
    }
    return key
  }

  private addCubeView(color: CubeColor, cell: number): CubeView {
    const img = this.add.image(0, 0, this.cubeTextureKey(color)).setDepth(DEPTH.cube)
    const v: CubeView = { img, color, cell, visCell: cell, ox: 0, oy: 0, dying: false }
    this.cubeViews.push(v)
    return v
  }

  private viewFor(cubeId: string): CubeView | undefined {
    return this.cubeIds.get(cubeId)
  }

  /** id -> view. Kept beside cubeViews because events address cubes by id. */
  private cubeIds = new Map<string, CubeView>()

  private spawnInitialCubes(): void {
    this.cubeIds.clear()
    this.state.cells.forEach((cube, i) => {
      if (!cube) return
      const v = this.addCubeView(cube.color, i)
      this.cubeIds.set(cube.id, v)
      v.img.setScale(0)
      this.tweens.add({
        targets: v.img, scale: 1,
        duration: this.t.duration.normal, delay: i * 40, ease: 'Back.Out',
      })
    })
  }

  private destroyView(v: CubeView): void {
    this.tweens.killTweensOf(v.img)
    v.img.destroy()
    const i = this.cubeViews.indexOf(v)
    if (i >= 0) this.cubeViews.splice(i, 1)
    for (const [id, other] of this.cubeIds) if (other === v) this.cubeIds.delete(id)
  }

  // ── Hub readouts ────────────────────────────────────────────────────────────

  private buildHub(): void {
    const c = this.beltCentre
    // Half the hole inside the belt lane, less a margin — so the plate can never
    // grow underneath the cubes however small the loop got.
    const hole = Math.abs(this.track.at(0).y - c.y) - (this.cubeSize + 46) / 2
    const radius = Phaser.Math.Clamp(hole - 26, 96, 190)

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
      g.fillStyle(MACHINE.casingDark, 0.22)
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2
        g.fillCircle(x + Math.cos(a) * (radius - 24), y + Math.sin(a) * (radius - 24), 7)
      }
    }).setPosition(c.x, c.y).setDepth(DEPTH.hub)
    this.hubParts.push(plate)

    this.gaugeG = this.add.graphics().setDepth(DEPTH.hub + 1)
    this.hubParts.push(this.gaugeG)

    this.freeNumber = this.add.text(c.x, c.y - 12, '0',
      this.p.text('heading', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.hub + 2)
    this.hubParts.push(this.freeNumber)

    const cap = this.add.text(c.x, c.y + 42, 'FREE CELLS',
      this.p.text('caption', GROUND.inkSoft)).setOrigin(0.5).setDepth(DEPTH.hub + 2)
    this.hubParts.push(cap)

    this.beltCaption = this.add.text(c.x, c.y + 108, '',
      this.p.text('caption', mix(GROUND.inkSoft, GROUND.paper, 0.35)))
      .setOrigin(0.5).setDepth(DEPTH.hub + 2)
    this.hubParts.push(this.beltCaption)
  }

  private pressureColor(ratio: number): number {
    return ratio >= 0.85 ? STATUS.danger : ratio >= 0.6 ? STATUS.warn : STATUS.ok
  }

  private refreshReadouts(): void {
    for (const chip of this.goalChips) {
      const goal = this.state.level.goal.find(g => g.color === chip.color)
      if (!goal) continue
      const got = Math.min(this.state.clearedByColor[chip.color], goal.count)
      chip.text.setText(`${got}/${goal.count}`)
      chip.text.setColor(hex(got >= goal.count ? STATUS.ok : GROUND.ink))
    }

    const total = this.state.cells.length
    const used = occupiedCount(this.state)
    const free = total - used
    const ratio = total > 0 ? Phaser.Math.Clamp(used / total, 0, 1) : 0
    const color = this.pressureColor(ratio)

    if (free !== this.lastFreeShown) {
      const wasSet = this.lastFreeShown >= 0
      this.lastFreeShown = free

      const c = this.beltCentre
      const g = this.gaugeG
      if (g) {
        const radius = Math.max(86, this.cubeSize)
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

    const pct = Math.round(goalProgress(this.state) * 100)
    this.beltCaption?.setText(`GOAL ${pct}%`)
    this.refreshCardStates()
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  private buildHeader(): void {
    const t = this.t
    const safe = this.p.layout.safeRect
    const level = this.state.level
    const cx = this.p.layout.width / 2

    const title = this.add.text(cx, safe.y + 72, `LEVEL ${level.id}`,
      this.p.text('heading', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.hud)
    this.hud.push(title)

    this.levelDots = this.p.ui.createDots({
      x: cx, y: safe.y + 130,
      count: 5, active: (this.levelIndex % 5) + 1,
      size: 18, gap: 18,
      color: MACHINE.accent,
      emptyColor: 0xd9cdb8,
    })
    this.levelDots.container.setDepth(DEPTH.hud)

    const name = this.add.text(cx, safe.y + 176, level.name.toUpperCase(),
      this.p.text('caption', GROUND.inkSoft)).setOrigin(0.5).setDepth(DEPTH.hud)
    this.hud.push(name)

    const goals = level.goal
    const chipW = goals.length >= 4 ? 132 : 168
    const chipGap = goals.length >= 4 ? 14 : 20
    const totalW = goals.length * chipW + (goals.length - 1) * chipGap
    goals.forEach((goal, i) => {
      const x = cx - totalW / 2 + chipW / 2 + i * (chipW + chipGap)
      const y = safe.y + 246

      const bg = bakeGraphics(this, chipW + 24, 92, (g, w, h) => {
        drawShadow(g, w / 2, h / 2, chipW, 66, { radius: 33, dy: 5, spread: 4, alpha: 0.1 }, t)
        drawPill(g, w / 2, h / 2, chipW, 66, {
          fill: GROUND.card,
          stroke: mix(GROUND.cardEdge, CUBE_SKIN[goal.color].body, 0.45),
          strokeWidth: 3,
        }, t)
        drawToyCube(g, w / 2 - chipW / 2 + 32, h / 2, 40, goal.color, t)
      }).setPosition(x, y).setDepth(DEPTH.hud)

      const text = this.add.text(x + 26, y, `0/${goal.count}`,
        this.p.text('caption', GROUND.ink)).setOrigin(0.5).setDepth(DEPTH.hud + 1)

      this.hud.push(bg, text)
      this.goalChips.push({ bg, text, color: goal.color })
    })

    const restart = this.p.ui.createIcon({
      x: this.p.layout.safeRight(-76),
      y: safe.y + 82,
      size: 68,
      background: GROUND.card,
      backgroundAlpha: 1,
      radius: t.radius.pill,
      onPress: () => this.loadLevel(this.levelIndex),
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

  // ── Batch tray ──────────────────────────────────────────────────────────────

  private buildBatchTray(): void {
    this.destroyBatchTray()

    const t = this.t
    const safe = this.p.layout.safeRect
    const offered = this.state.offered
    if (offered.length === 0) return

    const cardH = 186
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
      this.p.layout.width / 2, trayY - cardH / 2 - 74, 'RELEASE A BATCH',
      this.p.text('caption', GROUND.inkSoft),
    ).setOrigin(0.5).setDepth(DEPTH.hud)

    const cardKey = (state: 'idle' | 'pressed' | 'disabled'): string => {
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

      const mini = Math.min(72, (cardW - 56) / Math.max(batch.cubes.length, 1))
      const spread = mini + 16
      const originX = -((batch.cubes.length - 1) * spread) / 2
      const scale = mini / this.cubeSize
      const previews = batch.cubes.map((color, k) =>
        this.add.image(originX + k * spread, -12, this.cubeTextureKey(color)).setScale(scale))

      const chipY = cardH / 2 - 32
      const chipKey = `ls_countchip`
      if (!this.textures.exists(chipKey)) {
        bakeTexture(this, chipKey, 120, 60, (g, w, h) => {
          drawPill(g, w / 2, h / 2, 92, 42, {
            fill: 0xf0e7d7, stroke: GROUND.cardEdge, strokeWidth: 2, highlight: 0,
          }, t)
        })
        this.ownedTextures.add(chipKey)
      }
      const chip = this.add.image(0, chipY, chipKey)
      const cells = batch.cubes.length
      const chipText = this.add.text(0, chipY, `${cells} cell${cells === 1 ? '' : 's'}`,
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
          this.onBatchPressed(batch.id, container)
        },
      }, t)

      const view: BatchCardView = {
        container, idle, pressed, press, batchId: batch.id, restY: trayY, enabled: true,
      }
      this.batchCards.push(view)

      container.setAlpha(0)
      container.y = trayY + 60
      this.tweens.add({
        targets: container,
        alpha: 1, y: trayY,
        duration: this.t.duration.normal,
        delay: i * 55,
        ease: 'Back.Out',
      })
    })

    this.refreshCardStates()
  }

  /**
   * A card is dead when its batch cannot fit in the free cells. Showing that on
   * the card rather than rejecting the tap is what keeps the loss condition
   * legible: you watch your options go grey as the belt fills.
   */
  private refreshCardStates(): void {
    if (this.ended) return
    for (const card of this.batchCards) {
      const batch = this.state.offered.find(b => b.id === card.batchId)
      const ok = batch ? canRelease(this.state, batch) : false
      if (ok === card.enabled) continue
      card.enabled = ok
      card.press.setEnabled(ok)
      card.container.setAlpha(ok ? 1 : 0.42)
    }
  }

  private setBatchesEnabled(enabled: boolean): void {
    for (const c of this.batchCards) c.press.setEnabled(enabled && c.enabled)
  }

  // ── Release ─────────────────────────────────────────────────────────────────

  private onBatchPressed(batchId: string, card: Phaser.GameObjects.Container): void {
    if (this.state.phase !== 'RUNNING') return
    const batch = this.state.offered.find(b => b.id === batchId)
    if (!batch || !canRelease(this.state, batch)) return

    this.sfx('select')

    // The card hands its contents to the chute rather than just vanishing.
    this.tweens.add({
      targets: card,
      x: this.chute.x, y: this.chute.y,
      scale: 0.35, alpha: 0,
      duration: MOTION.drop, ease: 'Quad.In',
    })
    this.p.anim.punch(this.chuteParts[0] as Phaser.GameObjects.Image, 1.08)

    const events = releaseBatch(this.state, batchId)
    // The cells are spent the instant the batch is committed, so the free-cell
    // gauge moves now rather than when the drop animation lands. Waiting made
    // the one number that governs the loss condition lag the decision.
    this.refreshReadouts()
    this.playEvents(events, batch.cubes.length)

    // Short lockout so a released batch is watched, not mashed over. The belt
    // itself never pauses — only the tray does.
    const token = this.runToken
    this.setBatchesEnabled(false)
    this.time.delayedCall(MOTION.drop + 60, () => {
      if (token !== this.runToken) return
      this.buildBatchTray()
    })
  }

  private schedule(token: number, delay: number, fn: () => void): void {
    if (delay <= 0) { if (token === this.runToken) fn(); return }
    this.time.delayedCall(delay, () => { if (token === this.runToken) fn() })
  }

  /**
   * Turns the logic's event list into motion.
   *
   * Shoves need no code at all — the logic already moved the cube's `cell`, and
   * syncBelt slides it there. Only arrivals and clears are staged.
   */
  private playEvents(events: ReleaseEvent[], batchSize: number): void {
    const token = this.runToken

    for (const e of events) {
      if (e.kind !== 'land') continue
      this.schedule(token, e.order * tuning.entryStagger, () => this.animLand(e.cubeId, e.color, e.cell))
    }

    // Shoved cubes that are already on the belt get a small kick so the ripple
    // reads as the machine pushing rather than as cubes drifting.
    for (const e of events) {
      if (e.kind !== 'shove') continue
      const v = this.viewFor(e.cubeId)
      if (v) { v.cell = e.to; this.p.anim.squash(v.img, 0.1, { duration: MOTION.land }) }
    }
    if (events.some(e => e.kind === 'shove')) this.sfx('move')

    const dropDone = MOTION.drop + Math.max(0, batchSize - 1) * tuning.entryStagger
    for (const e of events) {
      if (e.kind !== 'clear') continue
      this.schedule(token, dropDone + tuning.matchDelay + e.order * 200, () =>
        this.animClear(e.cubeIds, e.color, e.size))
    }

    const endAt = dropDone + tuning.matchDelay
      + events.filter(e => e.kind === 'clear').length * 200
      + MOTION.attract + MOTION.anticipate + MOTION.clear

    this.schedule(token, dropDone + 40, () => this.refreshReadouts())

    if (events.some(e => e.kind === 'complete')) {
      this.schedule(token, endAt, () => this.showComplete())
    } else if (events.some(e => e.kind === 'fail')) {
      this.schedule(token, endAt, () => this.showFail())
    }
  }

  /**
   * A cube leaves the chute. Its logical cell is already set, so the animation
   * only has to retire the screen-space offset between the chute mouth and that
   * cell — which keeps moving, so the cube visibly falls *onto a moving belt*.
   */
  private animLand(cubeId: string, color: CubeColor, cell: number): void {
    // The event's cell is where the cube was *inserted*. A later cube from the
    // same batch may already have shoved it along, so the belt is asked where
    // the cube actually is now rather than trusting the event.
    const live = this.state.cells.findIndex(c => c?.id === cubeId)
    const at = live >= 0 ? live : cell

    const v = this.addCubeView(color, at)
    this.cubeIds.set(cubeId, v)

    const here = this.cellPoint(at)
    v.ox = this.chute.x - here.x
    v.oy = this.chute.y - here.y
    v.img.setScale(0.72)

    const proxy = { k: 1 }
    const ox0 = v.ox
    const oy0 = v.oy
    this.tweens.add({
      targets: proxy, k: 0,
      duration: MOTION.drop, ease: 'Back.Out',
      onUpdate: () => { v.ox = ox0 * proxy.k; v.oy = oy0 * proxy.k },
      onComplete: () => {
        v.ox = 0; v.oy = 0
        this.p.anim.squash(v.img, 0.16, { duration: MOTION.land })
        this.p.vfx.dust(v.img.x, v.img.y, { count: 4, color: MACHINE.casingLight })
      },
    })
    this.tweens.add({
      targets: v.img, scale: 1,
      duration: MOTION.drop, ease: 'Back.Out',
    })
    this.sfx('move')
  }

  /**
   * The payoff. Matched cubes pull together, hold for a beat, then pop — all of
   * it while still riding the belt, because freezing the machine for the best
   * moment in the game would undo the point of the machine.
   */
  private animClear(cubeIds: string[], color: CubeColor, size: number): void {
    const views = cubeIds.map(id => this.viewFor(id)).filter((v): v is CubeView => !!v)
    if (views.length === 0) return

    const cap = this.state.cells.length
    // Mean cell, computed relative to the first so a group across the wrap does
    // not average to the far side of the loop.
    const base = views[0].cell
    let sum = 0
    for (const v of views) {
      let d = v.cell - base
      d = ((d + cap / 2) % cap + cap) % cap - cap / 2
      sum += d
    }
    const centre = base + sum / views.length

    for (const v of views) {
      v.dying = true
      v.img.setDepth(DEPTH.cube + 1)
      // Attract: nudging the logical target is enough — syncBelt does the rest.
      v.cell = base + (((v.cell - base + cap / 2) % cap + cap) % cap - cap / 2)
      this.tweens.add({
        targets: v, cell: centre,
        duration: MOTION.attract + MOTION.anticipate, ease: 'Quad.In',
      })
      this.tweens.add({
        targets: v.img, scale: 1.16,
        duration: MOTION.attract, ease: 'Quad.Out',
      })
    }
    this.sfx(size > 3 ? 'chain' : 'match')

    const token = this.runToken
    this.schedule(token, MOTION.attract + MOTION.anticipate, () => {
      const skin = CUBE_SKIN[color]
      for (const v of views) {
        const { x, y } = v.img
        this.p.vfx.burst(x, y, { color: skin.body, count: 10, intensity: 'medium' })
        this.tweens.add({
          targets: v.img, scale: 0, angle: Phaser.Math.Between(-40, 40),
          duration: MOTION.clear, ease: 'Back.In',
          onComplete: () => this.destroyView(v),
        })
      }
      const mid = views[Math.floor(views.length / 2)].img
      this.p.vfx.ring(mid.x, mid.y, this.cubeSize * 0.9, { color: skin.body })
      this.p.vfx.floatingText(mid.x, mid.y - this.cubeSize * 0.7, `+${size}`, { color: skin.body })
      this.p.juice.impact(mid.x, mid.y, {})
      this.p.vfx.screenShake(size > 3 ? 3 : 1.6, size > 3 ? 200 : 130)
      this.sfx('destroy')
      this.refreshReadouts()
    })
  }

  // ── End of level ────────────────────────────────────────────────────────────

  private showComplete(): void {
    this.ended = true
    this.setBatchesEnabled(false)
    const token = this.runToken
    this.sfx('complete')

    for (const v of this.cubeViews) this.p.anim.punch(v.img, 1.18)
    this.p.vfx.confetti({
      colors: [CUBE_SKIN.red.body, CUBE_SKIN.blue.body, CUBE_SKIN.green.body,
               CUBE_SKIN.yellow.body, MACHINE.accent],
    })
    this.p.vfx.ring(this.beltCentre.x, this.beltCentre.y, this.cubeSize * 1.4, { color: STATUS.ok })
    this.p.vfx.screenShake(2.5, 220)

    const last = this.levelIndex >= LEVELS.length - 1
    this.schedule(token, MOTION.settle, () => {
      this.buildPanel(
        last ? 'ALL LEVELS CLEAR' : 'LEVEL COMPLETE',
        last
          ? 'You reached the end of the experiment.'
          : `${this.state.matches} matches in ${this.state.picks} releases.`,
        last ? 'Replay' : 'Next level',
        () => this.loadLevel(last ? 0 : this.levelIndex + 1),
        true,
      )
    })
  }

  /** Failure is calm and says which of the two conditions happened. */
  private showFail(): void {
    this.ended = true
    this.setBatchesEnabled(false)
    const token = this.runToken
    this.sfx('fail')

    for (const v of this.cubeViews) this.p.anim.shake(v.img, 6)
    this.p.vfx.screenShake(3, 200)
    this.freeNumber?.setColor(hex(STATUS.danger))
    if (this.freeNumber) this.p.anim.punch(this.freeNumber, 1.2)

    const why = this.state.failReason === 'outOfBatches'
      ? 'The batch queue ran out before the goal was met.'
      : 'Every batch left needs more free cells than the belt has.'

    this.schedule(token, MOTION.settle, () => {
      this.buildPanel('BELT JAMMED', why, 'Try again', () => this.loadLevel(this.levelIndex), false)
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
      onPress: onCta,
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
      onPress: () => this.loadLevel(won ? this.levelIndex : 0),
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
