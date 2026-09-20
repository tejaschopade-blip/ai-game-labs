import Phaser from 'phaser'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { fadeIn } from '../../src/systems/Transitions'
import { ButtonHandle, PanelHandle, ProgressBarHandle, BadgeHandle } from '../../src/ui/UIFactory'
import {
  createPresentation, Presentation, Theme,
  drawRoundedCard, drawShadow, drawShadowCircle, drawSoftCircle,
  drawGameTile, drawSelectionRing, drawHighlight, bakeGraphics, hex, shade, mix,
} from '../../src/presentation'

// ── Layout constants ──────────────────────────────────────────────────────────
// Landscape 960x540. This prototype deliberately stays landscape — see
// docs/ai-rules.md: existing prototypes are not retrofitted to portrait.
//
// Every value below is unchanged from V3. Object positions, container positions
// and hit radii are gameplay-relevant and were not touched by the presentation
// upgrade — only what is drawn at those coordinates changed.
const W            = 960
const H            = 540
const MODE_BAR_H   = 64
const OBJ_AREA_X   = 60
const OBJ_AREA_Y   = 86
const OBJ_AREA_W   = 840
const OBJ_AREA_H   = 278          // object placement grid, bottom = 364
const HINT_Y       = 380
const CONT_CY      = 444
const CONT_W       = 150
const CONT_H       = 80
const HUD_Y        = H - 24
const SHADOW_DY    = 5

// Presentation-only: the three surfaces that give the screen a hierarchy —
// chrome (mode bar) / board (where you pick) / tray (where you drop).
const BOARD_CX     = OBJ_AREA_X + OBJ_AREA_W / 2
const BOARD_CY     = OBJ_AREA_Y + OBJ_AREA_H / 2 - 4
const BOARD_W      = OBJ_AREA_W + 42
const BOARD_H      = OBJ_AREA_H + 8
const TRAY_H       = CONT_H + 28

// ── Types ─────────────────────────────────────────────────────────────────────
type SortColor    = 'red' | 'blue' | 'green' | 'yellow'
type SortSize     = 'small' | 'medium' | 'large'
type SortShape    = 'circle' | 'square' | 'triangle'
type SortWeight   = 'light' | 'medium' | 'heavy'
type SortBehavior = 'follows' | 'avoids' | 'stays'
type SortMode     = 'COLOR' | 'SIZE' | 'SHAPE' | 'WEIGHT' | 'BEHAVIOR'

interface SortObject {
  id: number
  color: SortColor
  size: SortSize
  shape: SortShape
  weight: SortWeight
  behavior: SortBehavior
  x: number
  y: number
  origX: number
  origY: number
  settled: boolean
  selected: boolean
}

interface Container {
  category: string
  cx: number
  cy: number
  w: number
  h: number
}

interface ContainerVisual {
  data: Container
  shadow: Phaser.GameObjects.Image
  /** Holds the three baked state images; tweens and punches target this. */
  box: Phaser.GameObjects.Container
  /** [idle, eligible, hovered] — only one is visible at a time. */
  states: Phaser.GameObjects.Image[]
  label: Phaser.GameObjects.Text
  /** Per-slot accent. Deliberately NOT derived from the category's own colour —
   *  see buildContainerVisuals. */
  accent: number
  eligible: boolean
  hovered: boolean
}

// ── Visuals ───────────────────────────────────────────────────────────────────
const COLOR_HEX: Record<SortColor, number> = {
  red: 0xff4444, blue: 0x4488ff, green: 0x44cc88, yellow: 0xffcc44,
}
const SIZE_R: Record<SortSize, number> = { small: 16, medium: 26, large: 38 }
const MODES: SortMode[]                = ['COLOR', 'SIZE', 'SHAPE', 'WEIGHT', 'BEHAVIOR']

// ── Pure helpers ──────────────────────────────────────────────────────────────
function getCategories(mode: SortMode): string[] {
  switch (mode) {
    case 'COLOR':    return ['red', 'blue', 'green', 'yellow']
    case 'SIZE':     return ['small', 'medium', 'large']
    case 'SHAPE':    return ['circle', 'square', 'triangle']
    case 'WEIGHT':   return ['light', 'medium', 'heavy']
    case 'BEHAVIOR': return ['follows', 'avoids', 'stays']
  }
}

function getObjectCategory(obj: SortObject, mode: SortMode): string {
  switch (mode) {
    case 'COLOR':    return obj.color
    case 'SIZE':     return obj.size
    case 'SHAPE':    return obj.shape
    case 'WEIGHT':   return obj.weight
    case 'BEHAVIOR': return obj.behavior
  }
}

/**
 * Interaction radius. SHAPE mode deliberately uses SIZE_R even though it draws
 * at a fixed 26 — preserved exactly from the original so hit targets and the
 * selection ring are unchanged.
 */
function hitRadius(mode: SortMode, obj: SortObject): number {
  return mode === 'WEIGHT' ? 24 : mode === 'BEHAVIOR' ? 26 : SIZE_R[obj.size]
}

/** Drawn extent, used only for shadow sizing. */
function drawRadius(mode: SortMode, obj: SortObject): number {
  if (mode === 'WEIGHT')   return 24
  if (mode === 'BEHAVIOR') return 26
  if (mode === 'SHAPE')    return 26
  return SIZE_R[obj.size]
}

function shuffleArr<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = ((s >>> 0) % (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateObjects(mode: SortMode, round: number): SortObject[] {
  const colors:    SortColor[]    = ['red', 'blue', 'green', 'yellow']
  const sizes:     SortSize[]     = ['small', 'medium', 'large']
  const shapes:    SortShape[]    = ['circle', 'square', 'triangle']
  const weights:   SortWeight[]   = ['light', 'medium', 'heavy']
  const behaviors: SortBehavior[] = ['follows', 'avoids', 'stays']

  const cats  = getCategories(mode)
  const count = round === 0 ? 6 : 9

  // Build pool: every category represented cyclically
  type PartialObj = Partial<SortObject> & { id: number }
  const pool: PartialObj[] = []
  for (let i = 0; i < count; i++) {
    const cat  = cats[i % cats.length]
    const base: PartialObj = { id: i }
    switch (mode) {
      case 'COLOR':    base.color    = cat as SortColor;    break
      case 'SIZE':     base.size     = cat as SortSize;     break
      case 'SHAPE':    base.shape    = cat as SortShape;    break
      case 'WEIGHT':   base.weight   = cat as SortWeight;   break
      case 'BEHAVIOR': base.behavior = cat as SortBehavior; break
    }
    pool.push(base)
  }

  const shuffled = shuffleArr(pool, round * 1000 + mode.charCodeAt(0))

  // Fill missing properties with varied values (offset to break accidental correlation)
  return shuffled.map((base, idx) => ({
    id:       base.id,
    color:    base.color    ?? colors[(idx * 3 + 1) % colors.length],
    size:     base.size     ?? sizes[(idx * 2 + 1) % sizes.length],
    shape:    base.shape    ?? shapes[(idx * 2 + 2) % shapes.length],
    weight:   base.weight   ?? weights[(idx * 2 + 0) % weights.length],
    behavior: base.behavior ?? behaviors[(idx * 2 + 1) % behaviors.length],
    x: 0, y: 0, origX: 0, origY: 0,
    settled: false, selected: false,
  }))
}

// ── Draw helper: render one object shape ──────────────────────────────────────
// The per-mode *discriminators* are unchanged: WEIGHT objects stay uniformly
// grey and BEHAVIOR objects uniformly pale, because giving either a visual tell
// would destroy the inference mechanic those modes exist to test. Radii are
// unchanged too. What changed is only how each shape is rendered — soft circles
// and moulded tiles via presentation/Draw instead of flat fills with one
// hand-placed highlight dot.
function drawObjShape(
  gfx: Phaser.GameObjects.Graphics,
  mode: SortMode,
  obj: SortObject,
  theme: Theme,
  cx = 0,
  cy = 0,
): void {
  switch (mode) {
    case 'COLOR':
    case 'SIZE': {
      const color = COLOR_HEX[obj.color]
      const r     = SIZE_R[obj.size]
      drawSoftCircle(gfx, cx, cy, r, {
        fill: color,
        stroke: shade(color, -0.18),
        strokeWidth: theme.stroke.thin,
      }, theme)
      break
    }

    case 'SHAPE': {
      const color = COLOR_HEX[obj.color]
      const r     = 26  // fixed size so shape is the discriminator
      if (obj.shape === 'circle') {
        drawSoftCircle(gfx, cx, cy, r, {
          fill: color, stroke: shade(color, -0.18), strokeWidth: theme.stroke.thin,
        }, theme)
      } else if (obj.shape === 'square') {
        drawGameTile(gfx, cx, cy, r * 2, {
          fill: color, radius: theme.radius.sm,
          stroke: shade(color, -0.18), strokeWidth: theme.stroke.thin,
        }, theme)
      } else {
        // Triangle pointing up. Same vertices as V3 — Draw has no triangle
        // primitive, so the sheen is composited by hand: a lighter inner
        // triangle occupying the top two-thirds.
        gfx.fillStyle(color, 1)
        gfx.beginPath()
        gfx.moveTo(cx, cy - r)
        gfx.lineTo(cx + r * 0.866, cy + r * 0.5)
        gfx.lineTo(cx - r * 0.866, cy + r * 0.5)
        gfx.closePath()
        gfx.fillPath()

        gfx.fillStyle(theme.colors.highlight, theme.surfaceDepth.highlight * 1.6)
        gfx.beginPath()
        gfx.moveTo(cx, cy - r * 0.88)
        gfx.lineTo(cx + r * 0.52, cy + r * 0.02)
        gfx.lineTo(cx - r * 0.52, cy + r * 0.02)
        gfx.closePath()
        gfx.fillPath()

        gfx.lineStyle(theme.stroke.thin, shade(color, -0.18), 1)
        gfx.beginPath()
        gfx.moveTo(cx, cy - r)
        gfx.lineTo(cx + r * 0.866, cy + r * 0.5)
        gfx.lineTo(cx - r * 0.866, cy + r * 0.5)
        gfx.closePath()
        gfx.strokePath()
      }
      break
    }

    case 'WEIGHT': {
      // All look identical — grey tile — weight inferred by bounce
      const r = 24
      drawGameTile(gfx, cx, cy, r * 2, {
        fill: 0x778899, radius: theme.radius.sm,
        stroke: 0x5d6b7a, strokeWidth: theme.stroke.thin,
      }, theme)
      break
    }

    case 'BEHAVIOR': {
      // All look identical — pale circles
      const r = 26
      drawSoftCircle(gfx, cx, cy, r, {
        fill: 0xaabbcc, stroke: 0x8497aa, strokeWidth: theme.stroke.thin,
      }, theme)
      break
    }
  }
}

// ── Scene ─────────────────────────────────────────────────────────────────────
export class SortLabScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private p!: Presentation
  private theme!: Theme

  private mode: SortMode     = 'COLOR'
  private round              = 0
  private objects: SortObject[] = []
  // Baked Images rather than live Graphics: see bakeGraphics. Each piece costs
  // ~9 path fills to draw, and nine of them re-tessellating every frame was the
  // single largest cost in the upgraded scene.
  private objGfx             = new Map<number, Phaser.GameObjects.Image>()
  private objShadow          = new Map<number, Phaser.GameObjects.Image>()
  private containers: Container[] = []
  private containerVisuals: ContainerVisual[] = []
  private containerFill      = new Map<string, number>()
  private modeButtons: Array<{ handle: ButtonHandle; mode: SortMode }> = []
  private selectionRing?: Phaser.GameObjects.Graphics
  private panel?: PanelHandle
  private panelButtons: ButtonHandle[] = []
  private hintText?: Phaser.GameObjects.Text
  private hudText?: Phaser.GameObjects.Text
  private progress?: ProgressBarHandle
  private mistakeBadge?: BadgeHandle

  private selectedId  = -1
  private mistakes    = 0
  private startTime   = 0
  private roundDone   = false
  private _animating  = false
  private bouncingIds = new Set<number>()
  private bounceTweens = new Set<Phaser.Tweens.Tween>()
  private ptrX        = 0
  private ptrY        = 0
  // Last values pushed to the HUD. update() runs every frame, and both the
  // progress bar (which starts a tween) and the badge (which repaints its pill)
  // are expensive to drive unconditionally.
  private hudSettled  = -1
  private hudMistakes = -1

  constructor() { super({ key: 'SortLabScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    // One call replaces the V3 quartet of Layout + UIFactory + GameJuice +
    // createBackground, and scales the theme's geometry into this scene's
    // 960x540 landscape space. No AudioManager: the repo ships no audio assets,
    // so every juice sound is a silent no-op rather than a missing-key error.
    this.p = createPresentation(this, {
      theme: 'puzzle',
      background: { preset: 'softGradient', vignette: 0.26, patternSpacing: 64 },
    })
    this.theme = this.p.theme

    this.buildSurfaces()

    this.overlay = new DebugOverlay(this, '009-sort-lab')
    this.overlay.addWatch('Mode',     () => this.mode)
    this.overlay.addWatch('Round',    () => String(this.round + 1))
    this.overlay.addWatch('Left',     () => String(this.objects.filter(o => !o.settled).length))
    this.overlay.addWatch('Mistakes', () => String(this.mistakes))

    // Single scene-lifetime pointermove. Container hover is derived from these
    // coordinates in update() rather than by adding listeners per round, which
    // would accumulate on every mode switch.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.ptrX = p.x
      this.ptrY = p.y
    })

    this.buildModeBar()
    this.startMode('COLOR', 0)
    fadeIn(this)
  }

  update(_time: number, delta: number): void {
    this.overlay.update()
    if (this.mode === 'BEHAVIOR' && !this.roundDone) {
      this.updateBehaviors(delta)
    }
    this.updateContainerStates()
    this.updateHud()
  }

  // ── Static surfaces ─────────────────────────────────────────────────────────

  /**
   * Three stacked surfaces: chrome, board, tray. This is the single biggest
   * readability change in the upgrade — previously every element floated on one
   * flat background, so nothing said "pick here, drop there".
   */
  private buildSurfaces(): void {
    const t = this.theme
    const pad = 28

    bakeGraphics(this, BOARD_W + pad * 2, BOARD_H + pad * 2, (g, w, h) => {
      drawShadow(g, w / 2, h / 2, BOARD_W, BOARD_H,
        { radius: t.radius.lg, ...t.shadows.floating }, t)
      drawRoundedCard(g, w / 2, h / 2, BOARD_W, BOARD_H, {
        fill: mix(t.colors.background, t.colors.surface, 0.9),
        radius: t.radius.lg,
        stroke: t.colors.border,
        strokeWidth: t.stroke.thin,
        strokeAlpha: 0.85,
        highlight: 0.05,
        bevel: 0.12,
        inset: true,
      }, t)
    }).setPosition(BOARD_CX, BOARD_CY).setDepth(1)

    const trayW = W - 32
    bakeGraphics(this, trayW + pad * 2, TRAY_H + pad * 2, (g, w, h) => {
      drawRoundedCard(g, w / 2, h / 2, trayW, TRAY_H, {
        fill: shade(t.colors.background, -0.02),
        radius: t.radius.lg,
        stroke: t.colors.border,
        strokeWidth: t.stroke.thin,
        strokeAlpha: 0.45,
        highlight: 0,
        bevel: 0.16,
      }, t)
    }).setPosition(W / 2, CONT_CY).setDepth(1)
  }

  // ── Mode bar ────────────────────────────────────────────────────────────────

  private buildModeBar(): void {
    const t = this.theme
    const barH = MODE_BAR_H + 2
    bakeGraphics(this, W, barH, (g, w) => {
      g.fillStyle(shade(t.colors.background, -0.025), 1)
      g.fillRect(0, 0, w, MODE_BAR_H)
      drawHighlight(g, w / 2, MODE_BAR_H / 2, w, MODE_BAR_H, 0, 0.02, t)
      // A lit hairline above a dark one reads as a physical lip, not a divider.
      g.fillStyle(t.colors.border, 0.55)
      g.fillRect(0, MODE_BAR_H - 1, w, 1)
      g.fillStyle(0x000000, 0.35)
      g.fillRect(0, MODE_BAR_H, w, 2)
    }).setPosition(W / 2, barH / 2).setDepth(20)

    this.add.text(this.p.layout.safeLeft(20), MODE_BAR_H / 2, 'SORT LAB',
      this.p.text('caption', t.colors.muted))
      .setOrigin(0, 0.5).setDepth(21)
      .setLetterSpacing?.(2)

    // Segmented control, right-aligned within the bar
    const btnW = 138
    const gap  = 10
    const total = MODES.length * btnW + (MODES.length - 1) * gap
    const startX = W - this.p.layout.insets.right - 18 - total

    MODES.forEach((m, i) => {
      const handle = this.p.ui.createButton({
        x: startX + btnW / 2 + i * (btnW + gap),
        y: MODE_BAR_H / 2,
        text: m,
        width: btnW, height: 38,
        textScale: 'tiny', landscape: true,
        color: t.colors.surface,
        textColor: hex(t.colors.muted),
        selectedColor: t.colors.primary,
        selectedTextColor: hex(t.colors.text),
        radius: t.radius.sm,
        shadow: false,
        // Landscape prototype: the portrait-sized default (120) would extend the
        // hit zone past the mode bar and steal taps from the object area.
        minTouch: 0,
        onPress: () => this.switchMode(m),
      })
      handle.container.setDepth(21)
      this.modeButtons.push({ handle, mode: m })
    })
    this.updateModeBar()
  }

  private updateModeBar(): void {
    for (const { handle, mode } of this.modeButtons) {
      handle.setSelected(mode === this.mode)
    }
  }

  private switchMode(mode: SortMode): void {
    if (this._animating) return
    this.clearAll()
    this.startMode(mode, 0)
  }

  // ── Round management ────────────────────────────────────────────────────────

  private startMode(mode: SortMode, round: number): void {
    this.mode       = mode
    this.round      = round
    this.roundDone  = false
    this.selectedId = -1
    this.mistakes   = 0
    this.startTime  = this.time.now
    this._animating = false
    this.bouncingIds.clear()
    this.containerFill.clear()
    this.objects    = generateObjects(mode, round)

    this.placeObjects()
    this.buildContainerVisuals()
    this.buildObjectGraphics()
    this.buildSelectionRing()
    this.buildHint()
    this.buildHud()
    this.updateModeBar()
    this.setupInput()
  }

  private clearAll(): void {
    this.input.off('pointerdown')

    // Weight-bounce tweens drive a proxy and re-select on completion. Left
    // running across a mode switch they would select into the new round's
    // object list, so they are killed explicitly.
    for (const tw of this.bounceTweens) tw.remove()
    this.bounceTweens.clear()
    this.bouncingIds.clear()

    for (const gfx of this.objGfx.values()) {
      this.tweens.killTweensOf(gfx)
      gfx.destroy()
    }
    this.objGfx.clear()

    for (const sh of this.objShadow.values()) {
      this.tweens.killTweensOf(sh)
      sh.destroy()
    }
    this.objShadow.clear()

    if (this.selectionRing) {
      this.tweens.killTweensOf(this.selectionRing)
      this.selectionRing.destroy()
      this.selectionRing = undefined
    }

    for (const cv of this.containerVisuals) {
      this.tweens.killTweensOf(cv.box)
      this.tweens.killTweensOf(cv.shadow)
      cv.box.destroy()
      cv.shadow.destroy()
      cv.label.destroy()
    }
    this.containerVisuals = []
    this.containers       = []

    this.destroyPanel()

    if (this.hintText)     { this.hintText.destroy();     this.hintText = undefined }
    if (this.hudText)      { this.hudText.destroy();      this.hudText  = undefined }
    if (this.progress)     { this.progress.destroy();     this.progress = undefined }
    if (this.mistakeBadge) { this.mistakeBadge.destroy(); this.mistakeBadge = undefined }
  }

  private destroyPanel(): void {
    for (const b of this.panelButtons) b.destroy()
    this.panelButtons = []
    if (this.panel) { this.panel.destroy(); this.panel = undefined }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private placeObjects(): void {
    const count  = this.objects.length
    const cols   = 3
    const rows   = Math.ceil(count / cols)
    const cellW  = OBJ_AREA_W / cols
    const cellH  = OBJ_AREA_H / rows

    this.objects.forEach((obj, i) => {
      const col  = i % cols
      const row  = Math.floor(i / cols)
      const x    = OBJ_AREA_X + col * cellW + cellW / 2
      const y    = OBJ_AREA_Y + row * cellH + cellH / 2
      obj.x      = x
      obj.y      = y
      obj.origX  = x
      obj.origY  = y
    })
  }

  private buildContainerVisuals(): void {
    const t       = this.theme
    const cats    = getCategories(this.mode)
    const spacing = W / (cats.length + 1)

    // Slot accents cycle through a fixed neutral ramp rather than mapping a
    // category to its own colour. Tinting the RED bin red would make COLOR mode
    // measurably easier than the other four — and this prototype exists to
    // compare those five modes against each other.
    const ramp = [t.colors.primary, t.colors.secondary, t.colors.accent, t.colors.success]

    this.containers = cats.map((cat, i) => ({
      category: cat,
      cx: Math.round(spacing * (i + 1)),
      cy: CONT_CY,
      w:  CONT_W,
      h:  CONT_H,
    }))

    this.containers.forEach((c, i) => {
      const accent = ramp[i % ramp.length]

      const shPad = SHADOW_DY + t.shadows.card.spread * t.shadows.card.layers + 6
      const shadow = bakeGraphics(this, c.w + shPad * 2, c.h + shPad * 2, (g, w, h) => {
        drawShadow(g, w / 2, h / 2, c.w, c.h, { radius: t.radius.md, dy: SHADOW_DY }, t)
      }).setPosition(c.cx, c.cy).setDepth(4)

      // All three states are baked up front and toggled by visibility. They are
      // held in a Container positioned on the bin, so a punch or a hover lift
      // scales about the bin's centre regardless of which state is showing.
      const states = [0, 1, 2].map(i =>
        bakeGraphics(this, c.w + 8, c.h + 8, (g, w, h) => {
          this.drawContainerState(g, w / 2, h / 2, c, accent, i === 2, i >= 1)
        }).setVisible(i === 0),
      )
      const box = this.add.container(c.cx, c.cy, states).setDepth(5)

      const label = this.add.text(c.cx, c.cy + c.h / 2 - 15, c.category.toUpperCase(),
        this.p.text('caption', t.colors.muted))
        .setOrigin(0.5).setDepth(7)

      const cv: ContainerVisual = {
        data: c, shadow, box, states, label, accent, eligible: false, hovered: false,
      }
      this.drawContainer(cv)
      this.containerVisuals.push(cv)
    })
  }

  /**
   * Bins are recessed slots, not outlined boxes: a dark inner well inside a
   * raised rim. The affordance ("something goes in here") comes from the form,
   * so the eligible / hovered states only have to change colour temperature.
   */
  private drawContainerState(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    c: Container, accent: number,
    hovered: boolean, eligible: boolean,
  ): void {
    const t = this.theme
    const { w, h } = c

    const wellFill = hovered  ? mix(t.colors.surface, accent, 0.34)
                   : eligible ? mix(t.colors.surface, accent, 0.16)
                   : shade(t.colors.background, -0.015)

    const rim = hovered  ? accent
              : eligible ? mix(t.colors.border, accent, 0.55)
              : t.colors.border

    // Rim
    drawRoundedCard(g, cx, cy, w, h, {
      fill: t.colors.surface,
      radius: t.radius.md,
      stroke: rim,
      strokeWidth: hovered ? t.stroke.base : t.stroke.thin,
      strokeAlpha: eligible ? 1 : 0.7,
      bevel: 0,
    }, t)

    // Recessed well — inverted lighting (dark top, lit bottom) is what sells
    // "hole" instead of "button".
    const iw = w - 12
    const ih = h - 12
    g.fillStyle(wellFill, 1)
    g.fillRoundedRect(cx - iw / 2, cy - ih / 2, iw, ih, t.radius.sm)
    g.fillStyle(0x000000, 0.22)
    g.fillRoundedRect(cx - iw / 2, cy - ih / 2, iw, ih * 0.34, {
      tl: t.radius.sm, tr: t.radius.sm, bl: 0, br: 0,
    })
    g.fillStyle(t.colors.highlight, 0.05)
    g.fillRoundedRect(cx - iw / 2, cy + ih / 2 - ih * 0.2, iw, ih * 0.2, {
      tl: 0, tr: 0, bl: t.radius.sm, br: t.radius.sm,
    })
  }

  private drawContainer(cv: ContainerVisual): void {
    const t = this.theme
    const active = cv.hovered ? 2 : cv.eligible ? 1 : 0
    cv.states.forEach((img, i) => img.setVisible(i === active))
    cv.label.setColor(hex(
      cv.hovered ? t.colors.text : cv.eligible ? mix(t.colors.text, cv.accent, 0.4) : t.colors.muted,
    ))
  }

  /**
   * Containers brighten while an object is held, and brighten further under the
   * pointer. The hovered bin also lifts — a 3px rise plus a deeper shadow is a
   * stronger "drop it here" signal than any colour change on its own.
   */
  private updateContainerStates(): void {
    const eligible = this.selectedId >= 0 && !this.roundDone
    const hovered  = eligible ? this.hitTestContainer(this.ptrX, this.ptrY) : null

    for (const cv of this.containerVisuals) {
      const isHovered = hovered === cv.data
      if (cv.eligible !== eligible || cv.hovered !== isHovered) {
        const lift = cv.hovered !== isHovered
        cv.eligible = eligible
        cv.hovered  = isHovered
        this.drawContainer(cv)
        if (lift) {
          this.tweens.killTweensOf(cv.box)
          this.tweens.add({
            targets: cv.box,
            y: cv.data.cy + (isHovered ? -3 : 0),
            scaleX: isHovered ? 1.03 : 1,
            scaleY: isHovered ? 1.03 : 1,
            duration: this.theme.duration.fast,
            ease: this.theme.ease.out,
          })
        }
      }
    }
  }

  private buildHint(): void {
    const hintStr = this.mode === 'WEIGHT'
      ? 'Tap an object to feel its weight, then tap a bin  ·  Tap it again to change selection'
      : this.mode === 'BEHAVIOR'
        ? 'Move the cursor near objects to see how they react, then tap object → tap bin'
        : 'Tap an object, then tap a bin'

    this.hintText = this.add.text(W / 2, HINT_Y, hintStr,
      this.p.text('caption', mix(this.theme.colors.muted, this.theme.colors.background, 0.35)))
      .setOrigin(0.5).setDepth(6)
  }

  private buildHud(): void {
    const t = this.theme

    this.progress = this.p.ui.createProgressBar({
      x: this.p.layout.safeLeft(20) + 90, y: HUD_Y,
      width: 180, height: 10,
      bgColor: shade(t.colors.background, 0.04),
      fillColor: t.colors.success,
      value: 0,
      duration: t.duration.normal,
    })
    this.progress.container.setDepth(6)

    this.hudText = this.add.text(this.p.layout.safeLeft(20) + 192, HUD_Y, '',
      this.p.text('caption', t.colors.muted))
      .setOrigin(0, 0.5).setDepth(6)

    this.mistakeBadge = this.p.ui.createBadge({
      x: W - this.p.layout.insets.right - 60, y: HUD_Y,
      text: 'Mistakes 0',
      textScale: 'tiny', landscape: true,
      color: t.colors.surface,
      textColor: hex(t.colors.muted),
      paddingX: 14,
      height: 24,
    })
    this.mistakeBadge.container.setDepth(6)

    this.hudSettled  = -1
    this.hudMistakes = -1
    this.updateHud()
  }

  private updateHud(): void {
    let settled = 0
    for (const o of this.objects) if (o.settled) settled++

    if (settled !== this.hudSettled) {
      this.hudSettled = settled
      this.progress?.setValue(settled / Math.max(1, this.objects.length))
      this.hudText?.setText(`${settled}/${this.objects.length} sorted`)
    }

    if (this.mistakes !== this.hudMistakes && this.mistakeBadge) {
      this.hudMistakes = this.mistakes
      this.mistakeBadge.setText(`Mistakes ${this.mistakes}`)
      this.mistakeBadge.setColor(
        this.mistakes === 0
          ? this.theme.colors.surface
          : mix(this.theme.colors.surface, this.theme.colors.danger, 0.35),
      )
    }
  }

  // ── Object graphics ─────────────────────────────────────────────────────────

  private buildObjectGraphics(): void {
    const t = this.theme

    this.objects.forEach((obj, i) => {
      const r = drawRadius(this.mode, obj)

      // Shadow sits at the object's own position; the drop offset lives inside
      // the baked art, so syncObjVisuals only has to copy x/y.
      const boxy = this.mode === 'WEIGHT' || (this.mode === 'SHAPE' && obj.shape === 'square')
      const shPad = SHADOW_DY + t.shadows.card.spread * t.shadows.card.layers + 6
      const shSize = r * 2 + shPad * 2
      const shadow = bakeGraphics(this, shSize, shSize, (g, w, h) => {
        if (boxy) drawShadow(g, w / 2, h / 2, r * 2, r * 2, { radius: t.radius.sm, dy: SHADOW_DY }, t)
        else      drawShadowCircle(g, w / 2, h / 2, r, { dy: SHADOW_DY }, t)
      }).setPosition(obj.x, obj.y).setDepth(9)
      this.objShadow.set(obj.id, shadow)

      const size = r * 2 + 10
      const gfx = bakeGraphics(this, size, size, (g, w, h) => {
        drawObjShape(g, this.mode, obj, t, w / 2, h / 2)
      }).setPosition(obj.x, obj.y).setDepth(10)
      this.objGfx.set(obj.id, gfx)

      // Staggered entrance. A delayed tween rather than delayedCall, so a rapid
      // mode switch cannot fire a callback against a destroyed object.
      for (const go of [shadow, gfx]) {
        go.setAlpha(0).setScale(0.55)
        this.tweens.add({
          targets: go,
          alpha: go === shadow ? 0.999 : 1,
          scaleX: 1, scaleY: 1,
          duration: t.duration.normal,
          delay: i * 45,
          ease: t.ease.overshoot,
        })
      }
    })
  }

  private syncObjVisuals(obj: SortObject): void {
    const gfx = this.objGfx.get(obj.id)
    const sh  = this.objShadow.get(obj.id)
    if (gfx) gfx.setPosition(obj.x, obj.y)
    if (sh)  sh.setPosition(obj.x, obj.y)
  }

  // ── Selection ring ──────────────────────────────────────────────────────────

  private buildSelectionRing(): void {
    this.selectionRing = this.add.graphics().setDepth(11).setVisible(false)
  }

  private showSelectionRing(obj: SortObject): void {
    const ring = this.selectionRing
    if (!ring) return
    // Same radius expression as V3, so the indicator sits exactly where it used to.
    const r = hitRadius(this.mode, obj) + 7

    this.tweens.killTweensOf(ring)
    ring.clear()
    drawSelectionRing(ring, 0, 0, r, this.theme.colors.accent, this.theme)
    ring.setPosition(obj.x, obj.y).setScale(1).setAlpha(1).setVisible(true)

    this.tweens.add({
      targets: ring,
      scaleX: 1.07, scaleY: 1.07,
      duration: 620,
      yoyo: true, repeat: -1,
      ease: this.theme.ease.inOut,
    })
  }

  private hideSelectionRing(): void {
    const ring = this.selectionRing
    if (!ring) return
    this.tweens.killTweensOf(ring)
    ring.setVisible(false)
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this._animating || this.roundDone) return
      const px = p.x, py = p.y

      // Check if click hits an unsettled object
      const hitObj = this.hitTestObject(px, py)

      if (hitObj) {
        if (hitObj.id === this.selectedId) {
          // Tap selected object again → deselect
          hitObj.selected = false
          this.selectedId = -1
          this.hideSelectionRing()
        } else {
          // Deselect previous
          if (this.selectedId >= 0) {
            const prev = this.objects.find(o => o.id === this.selectedId)
            if (prev) prev.selected = false
          }

          if (this.mode === 'WEIGHT' && !this.bouncingIds.has(hitObj.id)) {
            this.doWeightBounce(hitObj)
          } else if (!this.bouncingIds.has(hitObj.id)) {
            this.selectObj(hitObj)
          }
        }
        return
      }

      // Check if click hits a container (only if object selected)
      if (this.selectedId >= 0) {
        const hitCont = this.hitTestContainer(px, py)
        if (hitCont) {
          const obj = this.objects.find(o => o.id === this.selectedId)
          if (obj) this.attemptPlace(obj, hitCont)
        }
      }
    })
  }

  private hitTestObject(px: number, py: number): SortObject | null {
    for (const obj of this.objects) {
      if (obj.settled) continue
      const dx  = px - obj.x
      const dy  = py - obj.y
      const tol = hitRadius(this.mode, obj) + 10
      if (Math.sqrt(dx * dx + dy * dy) < tol) return obj
    }
    return null
  }

  private hitTestContainer(px: number, py: number): Container | null {
    for (const c of this.containers) {
      if (px >= c.cx - c.w / 2 && px <= c.cx + c.w / 2 &&
          py >= c.cy - c.h / 2 && py <= c.cy + c.h / 2) return c
    }
    return null
  }

  private selectObj(obj: SortObject): void {
    obj.selected    = true
    this.selectedId = obj.id
    this.showSelectionRing(obj)
    const gfx = this.objGfx.get(obj.id)
    if (gfx) this.p.juice.select(gfx)
    // A ring at the tap point acknowledges the touch on the same frame, before
    // any of the selection state has finished animating.
    this.p.vfx.ring(obj.x, obj.y, hitRadius(this.mode, obj), {
      color: this.theme.colors.accent, duration: this.theme.duration.normal,
    })
  }

  // ── Placement ───────────────────────────────────────────────────────────────

  /** Small fan so multiple settled objects in one container stay readable. */
  private settleOffset(slot: number): number {
    return (slot - 1) * 30
  }

  private attemptPlace(obj: SortObject, container: Container): void {
    this._animating = true
    const correct   = getObjectCategory(obj, this.mode) === container.category
    const gfx       = this.objGfx.get(obj.id)
    if (!gfx) { this._animating = false; return }

    // Deselect visually
    obj.selected    = false
    this.selectedId = -1
    this.hideSelectionRing()

    const cv = this.containerVisuals.find(v => v.data === container)

    if (correct) {
      const slot = this.containerFill.get(container.category) ?? 0
      this.containerFill.set(container.category, slot + 1)
      const tx = container.cx + this.settleOffset(slot)
      const ty = container.cy - 6

      // Fly to container. Same 280ms as V3, but on an arc: the object lifts
      // before it drops in, which reads as thrown rather than dragged.
      const liftY = Math.min(obj.y, ty) - 46
      this.tweens.chain({
        targets: gfx,
        onComplete: () => {
          obj.x       = tx
          obj.y       = ty
          obj.settled = true
          this.syncObjVisuals(obj)
          const sh = this.objShadow.get(obj.id)
          if (sh) sh.setScale(0.5)
          this.p.juice.success(container.cx, container.cy - 10, {
            target: cv?.box,
            intensity: 'small',
            color: cv?.accent ?? this.theme.colors.success,
          })
          this._animating = false
          this.checkRoundDone()
        },
        tweens: [
          {
            x: (obj.x + tx) / 2, y: liftY,
            scaleX: 0.78, scaleY: 0.78,
            duration: 130, ease: this.theme.ease.out,
            onUpdate: () => { obj.x = gfx.x; obj.y = gfx.y; this.syncObjVisuals(obj) },
          },
          {
            x: tx, y: ty,
            scaleX: 0.5, scaleY: 0.5,
            duration: 150, ease: 'Quad.In',
            onUpdate: () => { obj.x = gfx.x; obj.y = gfx.y; this.syncObjVisuals(obj) },
          },
        ],
      })
    } else {
      this.mistakes++
      // Shake object in place, return to origin
      const origX = obj.x, origY = obj.y
      gfx.setPosition(container.cx, container.cy)
      obj.x = container.cx; obj.y = container.cy
      this.syncObjVisuals(obj)
      // Restrained: burst + bin wobble, no text. The HUD mistake count is the
      // durable signal.
      this.p.juice.fail(container.cx, container.cy, { intensity: 'small' })
      if (cv) this.p.anim.wobble(cv.box, 5)
      this.tweens.add({
        targets:  gfx,
        x:        origX,
        y:        origY,
        duration: 300,
        ease:     this.theme.ease.overshoot,
        onUpdate: () => { obj.x = gfx.x; obj.y = gfx.y; this.syncObjVisuals(obj) },
        onComplete: () => {
          obj.x = origX; obj.y = origY
          this.syncObjVisuals(obj)
          this._animating = false
        },
      })
    }
  }

  // ── Weight bounce ────────────────────────────────────────────────────────────

  private doWeightBounce(obj: SortObject): void {
    const gfx = this.objGfx.get(obj.id)
    if (!gfx) return
    this.bouncingIds.add(obj.id)

    // Heights and durations are the mechanic — unchanged.
    const bounceY = obj.weight === 'light' ? 20 : obj.weight === 'medium' ? 10 : 3
    const dur     = obj.weight === 'light' ? 180 : obj.weight === 'medium' ? 260 : 380
    const startY  = obj.y

    const proxy = { y: startY }
    const tween = this.tweens.add({
      targets:  proxy,
      y:        startY - bounceY,
      duration: dur / 2,
      ease:     'Quad.Out',
      yoyo:     true,
      onUpdate: () => { gfx.y = proxy.y; obj.y = proxy.y; this.syncObjVisuals(obj) },
      onComplete: () => {
        gfx.y  = startY
        obj.y  = startY
        this.syncObjVisuals(obj)
        // Landing puff, scaled to how hard it hit — the same information the
        // bounce already carries, in a second channel.
        this.p.vfx.spark(obj.x, obj.y + drawRadius(this.mode, obj), {
          color: this.theme.colors.muted,
          intensity: obj.weight === 'heavy' ? 'medium' : 'small',
          distance: 40,
          size: 14,
        })
        this.bouncingIds.delete(obj.id)
        this.bounceTweens.delete(tween)
        this.selectObj(obj)
      },
    })
    this.bounceTweens.add(tween)
  }

  // ── Behavior mode update ─────────────────────────────────────────────────────

  private updateBehaviors(delta: number): void {
    const dt = delta / 1000
    for (const obj of this.objects) {
      if (obj.settled || obj.selected) continue
      const gfx = this.objGfx.get(obj.id)
      if (!gfx) continue

      const dx   = this.ptrX - obj.x
      const dy   = this.ptrY - obj.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (obj.behavior === 'follows') {
        if (dist < 200 && dist > 1) {
          obj.x += (dx / dist) * 60 * dt
          obj.y += (dy / dist) * 60 * dt
        } else {
          // Drift back to origin slowly
          obj.x += (obj.origX - obj.x) * 0.8 * dt
          obj.y += (obj.origY - obj.y) * 0.8 * dt
        }
      } else if (obj.behavior === 'avoids') {
        if (dist < 180 && dist > 1) {
          obj.x -= (dx / dist) * 80 * dt
          obj.y -= (dy / dist) * 80 * dt
          // Clamp to object area
          obj.x = Phaser.Math.Clamp(obj.x, OBJ_AREA_X + 30, OBJ_AREA_X + OBJ_AREA_W - 30)
          obj.y = Phaser.Math.Clamp(obj.y, OBJ_AREA_Y + 20, OBJ_AREA_Y + OBJ_AREA_H - 20)
        } else {
          obj.x += (obj.origX - obj.x) * 0.5 * dt
          obj.y += (obj.origY - obj.y) * 0.5 * dt
        }
      }
      // 'stays': no movement

      this.syncObjVisuals(obj)
    }
  }

  // ── Round completion ─────────────────────────────────────────────────────────

  private checkRoundDone(): void {
    if (this.objects.every(o => o.settled)) {
      this.roundDone = true
      this.p.juice.levelComplete({
        targets: this.containerVisuals.map(cv => cv.box),
      })
      const elapsed  = Math.round((this.time.now - this.startTime) / 1000)
      this.time.delayedCall(400, () => this.showCompletionPanel(elapsed))
    }
  }

  private showCompletionPanel(elapsedSec: number): void {
    const t = this.theme
    const { x: cx, y: cy } = this.p.layout.center()
    const panelW = 400, panelH = 250

    this.panel = this.p.ui.createPanel({
      x: cx, y: cy,
      width: panelW, height: panelH,
      fill: t.colors.surface,
      stroke: t.colors.border,
      strokeWidth: t.stroke.thin,
      radius: t.radius.lg,
      shadow: true,
    })
    this.panel.container.setDepth(500)

    const title = this.add.text(0, -panelH / 2 + 42, 'SORT COMPLETE',
      this.p.text('subheading', t.colors.success)).setOrigin(0.5)
    this.panel.container.add(title)

    const rule = this.add.graphics()
    rule.fillStyle(t.colors.border, 0.7)
    rule.fillRect(-70, -panelH / 2 + 66, 140, 1)
    this.panel.container.add(rule)

    // Stats as a two-column read rather than one centred block: the numbers are
    // what the playtester is here for, so they get their own alignment.
    const rows: Array<[string, string]> = [
      ['Objects sorted', String(this.objects.length)],
      ['Mistakes',       String(this.mistakes)],
      ['Time',           `${elapsedSec}s`],
    ]
    rows.forEach(([label, value], i) => {
      const ry = -22 + i * 26
      this.panel!.container.add(
        this.add.text(-110, ry, label, this.p.text('caption', t.colors.muted)).setOrigin(0, 0.5),
      )
      this.panel!.container.add(
        this.add.text(110, ry, value,
          this.p.text('caption', i === 1 && this.mistakes > 0 ? t.colors.danger : t.colors.text),
        ).setOrigin(1, 0.5),
      )
    })

    const hasNext = this.round === 0
    const btnY    = cy + panelH / 2 - 46

    const tryAgain = this.p.ui.createButton({
      x: cx - (hasNext ? 86 : 0), y: btnY,
      text: 'Try Again',
      width: 156, height: 44,
      textScale: 'small', landscape: true,
      color: t.colors.surfaceAlt,
      radius: t.radius.sm,
      minTouch: 0,
      onPress: () => { this.clearAll(); this.startMode(this.mode, this.round) },
    })
    tryAgain.container.setDepth(501)
    this.panelButtons.push(tryAgain)

    if (hasNext) {
      const nextRound = this.p.ui.createButton({
        x: cx + 86, y: btnY,
        text: 'Next Round →',
        width: 156, height: 44,
        textScale: 'small', landscape: true,
        color: t.colors.primary,
        radius: t.radius.sm,
        minTouch: 0,
        onPress: () => { this.clearAll(); this.startMode(this.mode, 1) },
      })
      nextRound.container.setDepth(501)
      this.panelButtons.push(nextRound)
    }

    // Panel and buttons arrive together
    this.p.anim.pop(this.panel.container)
    for (const b of this.panelButtons) {
      b.container.setAlpha(0)
      this.tweens.add({
        targets: b.container,
        alpha: 1,
        duration: t.duration.fast,
        delay: t.duration.fast,
      })
    }
  }
}
