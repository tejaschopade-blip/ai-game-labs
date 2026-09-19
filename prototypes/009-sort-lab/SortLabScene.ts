import Phaser from 'phaser'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { DesignTokens as T } from '../../src/core/DesignTokens'
import { Layout } from '../../src/systems/Layout'
import { GameJuice } from '../../src/systems/GameJuice'
import { addShadow } from '../../src/systems/Shadow'
import { createBackground, BackgroundHandle } from '../../src/systems/Background'
import { fadeIn } from '../../src/systems/Transitions'
import { UIFactory, ButtonHandle, PanelHandle } from '../../src/ui/UIFactory'

// ── Layout constants ──────────────────────────────────────────────────────────
// Landscape 960x540. This prototype deliberately stays landscape — see
// docs/ai-rules.md: existing prototypes are not retrofitted to portrait.
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
const HUD_Y        = H - 26
const SHADOW_DY    = 5

// Palette — tertiary background recedes, containers read as surfaces
const BG_TOP       = 0x0b0b16
const BG_BOTTOM    = 0x15152a
const BAR_FILL     = 0x13132a
const BAR_BORDER   = 0x26264a

const CONT_FILL             = 0x1b1b34
const CONT_FILL_ELIGIBLE    = 0x22224a
const CONT_FILL_HOVER       = 0x2b2b60
const CONT_STROKE           = 0x2e2e55
const CONT_STROKE_ELIGIBLE  = 0x4a6fd0
const CONT_STROKE_HOVER     = 0x7fa8ff

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
  shadow: Phaser.GameObjects.Graphics
  box: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
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
// Per-mode discriminators are unchanged from V2. WEIGHT objects stay uniformly
// grey and BEHAVIOR objects uniformly pale — giving either a visual tell would
// destroy the inference mechanic those modes exist to test.
function drawObjShape(
  gfx: Phaser.GameObjects.Graphics,
  mode: SortMode,
  obj: SortObject,
): void {
  gfx.clear()

  let color: number
  let r: number

  switch (mode) {
    case 'COLOR':
      color = COLOR_HEX[obj.color]
      r     = SIZE_R[obj.size]
      gfx.fillStyle(color, 1)
      gfx.fillCircle(0, 0, r)
      gfx.fillStyle(0xffffff, 0.15)
      gfx.fillCircle(-r * 0.25, -r * 0.3, r * 0.35)
      break

    case 'SIZE':
      color = COLOR_HEX[obj.color]
      r     = SIZE_R[obj.size]
      gfx.fillStyle(color, 1)
      gfx.fillCircle(0, 0, r)
      gfx.fillStyle(0xffffff, 0.15)
      gfx.fillCircle(-r * 0.25, -r * 0.3, r * 0.35)
      break

    case 'SHAPE': {
      color = COLOR_HEX[obj.color]
      r     = 26  // fixed size so shape is the discriminator
      gfx.fillStyle(color, 1)
      if (obj.shape === 'circle') {
        gfx.fillCircle(0, 0, r)
      } else if (obj.shape === 'square') {
        gfx.fillRect(-r, -r, r * 2, r * 2)
      } else {
        // triangle pointing up
        gfx.beginPath()
        gfx.moveTo(0, -r)
        gfx.lineTo(r * 0.866, r * 0.5)
        gfx.lineTo(-r * 0.866, r * 0.5)
        gfx.closePath()
        gfx.fillPath()
      }
      break
    }

    case 'WEIGHT':
      // All look identical — grey square — weight inferred by bounce
      r = 24
      gfx.fillStyle(0x778899, 1)
      gfx.fillRect(-r, -r, r * 2, r * 2)
      gfx.fillStyle(0xffffff, 0.08)
      gfx.fillRect(-r, -r, r * 2, 6)
      break

    case 'BEHAVIOR':
      // All look identical — white/light circles
      r = 26
      gfx.fillStyle(0xaabbcc, 1)
      gfx.fillCircle(0, 0, r)
      gfx.fillStyle(0xffffff, 0.2)
      gfx.fillCircle(-6, -8, 10)
      break
  }
}

// ── Scene ─────────────────────────────────────────────────────────────────────
export class SortLabScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private juice!: GameJuice
  private ui!: UIFactory
  private layout!: Layout
  private background?: BackgroundHandle

  private mode: SortMode     = 'COLOR'
  private round              = 0
  private objects: SortObject[] = []
  private objGfx             = new Map<number, Phaser.GameObjects.Graphics>()
  private objShadow          = new Map<number, Phaser.GameObjects.Graphics>()
  private containers: Container[] = []
  private containerVisuals: ContainerVisual[] = []
  private containerFill      = new Map<string, number>()
  private modeButtons: Array<{ handle: ButtonHandle; mode: SortMode }> = []
  private selectionRing?: Phaser.GameObjects.Graphics
  private panel?: PanelHandle
  private panelButtons: ButtonHandle[] = []
  private hintText?: Phaser.GameObjects.Text
  private hudText?: Phaser.GameObjects.Text

  private selectedId  = -1
  private mistakes    = 0
  private startTime   = 0
  private roundDone   = false
  private _animating  = false
  private bouncingIds = new Set<number>()
  private bounceTweens = new Set<Phaser.Tweens.Tween>()
  private ptrX        = 0
  private ptrY        = 0

  constructor() { super({ key: 'SortLabScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    this.layout = new Layout(this)
    this.ui     = new UIFactory(this)
    // No AudioManager: the repo ships no audio assets, so every juice call
    // silently plays nothing rather than referencing a key that doesn't exist.
    this.juice  = new GameJuice(this)

    this.background = createBackground(this, {
      color: BG_TOP,
      gradientTo: BG_BOTTOM,
      pattern: 'dots',
      patternAlpha: 0.025,
      patternSpacing: 72,
      particles: 0,          // must not compete with the sortable objects
    })

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.background?.destroy()
      this.background = undefined
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

  // ── Mode bar ────────────────────────────────────────────────────────────────

  private buildModeBar(): void {
    const bar = this.add.graphics().setDepth(20)
    bar.fillStyle(BAR_FILL, 1)
    bar.fillRect(0, 0, W, MODE_BAR_H)
    bar.lineStyle(1, BAR_BORDER, 1)
    bar.lineBetween(0, MODE_BAR_H, W, MODE_BAR_H)

    this.ui.createLabel({
      x: this.layout.safeLeft(18), y: MODE_BAR_H / 2,
      text: 'SORT LAB',
      textScale: 'small', landscape: true,
      color: '#9aa4d4', originX: 0, originY: 0.5,
    }).setDepth(21)

    // Segmented control, right-aligned within the bar
    const btnW = 138
    const gap  = 10
    const total = MODES.length * btnW + (MODES.length - 1) * gap
    const startX = W - this.layout.insets.right - 18 - total

    MODES.forEach((m, i) => {
      const handle = this.ui.createButton({
        x: startX + btnW / 2 + i * (btnW + gap),
        y: MODE_BAR_H / 2,
        text: m,
        width: btnW, height: 38,
        textScale: 'tiny', landscape: true,
        color: 0x1c1c3a,
        textColor: '#7b85b8',
        radius: T.radius.sm,
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
      cv.box.destroy()
      cv.shadow.destroy()
      cv.label.destroy()
    }
    this.containerVisuals = []
    this.containers       = []

    this.destroyPanel()

    if (this.hintText) { this.hintText.destroy(); this.hintText = undefined }
    if (this.hudText)  { this.hudText.destroy();  this.hudText  = undefined }
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
    const cats    = getCategories(this.mode)
    const spacing = W / (cats.length + 1)

    this.containers = cats.map((cat, i) => ({
      category: cat,
      cx: Math.round(spacing * (i + 1)),
      cy: CONT_CY,
      w:  CONT_W,
      h:  CONT_H,
    }))

    for (const c of this.containers) {
      const shadow = addShadow(this, { x: c.cx, y: c.cy, width: c.w, height: c.h }, {
        radius: T.radius.md,
        offsetY: SHADOW_DY,
        alpha: 0.35,
      }).setDepth(4)

      // Drawn around local origin so scalePunch on receipt scales about centre.
      const box = this.add.graphics().setPosition(c.cx, c.cy).setDepth(5)

      const label = this.add.text(c.cx, c.cy + c.h / 2 - 15, c.category.toUpperCase(), {
        fontSize: '12px', color: '#6b7aa8', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(7)

      const cv: ContainerVisual = { data: c, shadow, box, label, eligible: false, hovered: false }
      this.drawContainer(cv)
      this.containerVisuals.push(cv)
    }
  }

  private drawContainer(cv: ContainerVisual): void {
    const { w, h } = cv.data
    const fill   = cv.hovered ? CONT_FILL_HOVER
                 : cv.eligible ? CONT_FILL_ELIGIBLE
                 : CONT_FILL
    const stroke = cv.hovered ? CONT_STROKE_HOVER
                 : cv.eligible ? CONT_STROKE_ELIGIBLE
                 : CONT_STROKE
    const strokeW = cv.eligible ? 2 : 1

    cv.box.clear()
    cv.box.fillStyle(fill, 1)
    cv.box.fillRoundedRect(-w / 2, -h / 2, w, h, T.radius.md)
    cv.box.lineStyle(strokeW, stroke, 1)
    cv.box.strokeRoundedRect(-w / 2, -h / 2, w, h, T.radius.md)

    cv.label.setColor(cv.hovered ? '#dce6ff' : cv.eligible ? '#a8bcf0' : '#6b7aa8')
  }

  /**
   * Containers brighten while an object is held, and brighten further under the
   * pointer — the drop-target affordance the V2 layout lacked. Derived from the
   * cached pointer position; redraws only on an actual state change.
   */
  private updateContainerStates(): void {
    const eligible = this.selectedId >= 0 && !this.roundDone
    const hovered  = eligible ? this.hitTestContainer(this.ptrX, this.ptrY) : null

    for (const cv of this.containerVisuals) {
      const isHovered = hovered === cv.data
      if (cv.eligible !== eligible || cv.hovered !== isHovered) {
        cv.eligible = eligible
        cv.hovered  = isHovered
        this.drawContainer(cv)
      }
    }
  }

  private buildHint(): void {
    const hintStr = this.mode === 'WEIGHT'
      ? 'Tap object to feel its weight, then tap container  ·  Tap again to change selection'
      : this.mode === 'BEHAVIOR'
        ? 'Move cursor near objects to see behavior, then tap object → tap container'
        : 'Tap object → tap container'

    this.hintText = this.ui.createLabel({
      x: W / 2, y: HINT_Y,
      text: hintStr,
      textScale: 'tiny', landscape: true,
      color: '#3f3f63',
      align: 'center',
    }).setDepth(6)
  }

  private buildHud(): void {
    this.hudText = this.ui.createLabel({
      x: W - this.layout.insets.right - 20, y: HUD_Y,
      text: '',
      textScale: 'tiny', landscape: true,
      color: '#4d4d70',
      originX: 1, originY: 0.5,
    }).setDepth(6)
    this.updateHud()
  }

  private updateHud(): void {
    if (!this.hudText) return
    const settled = this.objects.filter(o => o.settled).length
    this.hudText.setText(`Sorted ${settled}/${this.objects.length}   ·   Mistakes ${this.mistakes}`)
  }

  // ── Object graphics ─────────────────────────────────────────────────────────

  private buildObjectGraphics(): void {
    this.objects.forEach((obj, i) => {
      const r = drawRadius(this.mode, obj)

      const shadow = this.mode === 'WEIGHT'
        ? addShadow(this, { x: obj.x, y: obj.y, width: r * 2, height: r * 2 }, {
            radius: T.radius.sm, offsetY: SHADOW_DY, alpha: 0.3,
          }).setDepth(9)
        : addShadow(this, { x: obj.x, y: obj.y }, {
            radius: r, offsetY: SHADOW_DY, alpha: 0.3,
          }).setDepth(9)
      this.objShadow.set(obj.id, shadow)

      const gfx = this.add.graphics().setPosition(obj.x, obj.y).setDepth(10)
      drawObjShape(gfx, this.mode, obj)
      this.objGfx.set(obj.id, gfx)

      // Staggered pop-in. Uses a delayed tween rather than delayedCall so a
      // rapid mode switch cannot fire a callback against a destroyed object.
      for (const go of [shadow, gfx]) {
        go.setAlpha(0).setScale(0.6)
        this.tweens.add({
          targets: go,
          alpha: go === shadow ? 0.999 : 1,
          scaleX: 1, scaleY: 1,
          duration: T.duration.normal,
          delay: i * 45,
          ease: 'Back.Out',
        })
      }
    })
  }

  private redrawObject(obj: SortObject): void {
    const gfx = this.objGfx.get(obj.id)
    if (!gfx) return
    drawObjShape(gfx, this.mode, obj)
  }

  private syncObjVisuals(obj: SortObject): void {
    const gfx = this.objGfx.get(obj.id)
    const sh  = this.objShadow.get(obj.id)
    if (gfx) gfx.setPosition(obj.x, obj.y)
    if (sh)  sh.setPosition(obj.x, obj.y + SHADOW_DY)
  }

  // ── Selection ring ──────────────────────────────────────────────────────────

  private buildSelectionRing(): void {
    this.selectionRing = this.add.graphics().setDepth(11).setVisible(false)
  }

  private showSelectionRing(obj: SortObject): void {
    const ring = this.selectionRing
    if (!ring) return
    // Same radius expression as V2's inline ring, so the indicator sits exactly
    // where it used to.
    const r = hitRadius(this.mode, obj) + 7

    this.tweens.killTweensOf(ring)
    ring.clear()
    ring.lineStyle(2, 0xffffff, 0.9)
    ring.strokeCircle(0, 0, r)
    ring.lineStyle(4, 0xffffff, 0.18)
    ring.strokeCircle(0, 0, r + 3)
    ring.setPosition(obj.x, obj.y).setScale(1).setVisible(true)

    this.tweens.add({
      targets: ring,
      scaleX: 1.07, scaleY: 1.07,
      duration: 620,
      yoyo: true, repeat: -1,
      ease: 'Sine.InOut',
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
          this.redrawObject(hitObj)
          this.hideSelectionRing()
        } else {
          // Deselect previous
          if (this.selectedId >= 0) {
            const prev = this.objects.find(o => o.id === this.selectedId)
            if (prev) { prev.selected = false; this.redrawObject(prev) }
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
    this.redrawObject(obj)
    this.showSelectionRing(obj)
    const gfx = this.objGfx.get(obj.id)
    if (gfx) this.juice.select(gfx)
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
    this.redrawObject(obj)
    this.hideSelectionRing()

    const cv = this.containerVisuals.find(v => v.data === container)

    if (correct) {
      const slot = this.containerFill.get(container.category) ?? 0
      this.containerFill.set(container.category, slot + 1)
      const tx = container.cx + this.settleOffset(slot)
      const ty = container.cy - 6

      // Fly to container
      this.tweens.add({
        targets:  gfx,
        x:        tx,
        y:        ty,
        scaleX:   0.5,
        scaleY:   0.5,
        duration: 280,
        ease:     'Quad.Out',
        onUpdate: () => { obj.x = gfx.x; obj.y = gfx.y; this.syncObjVisuals(obj) },
        onComplete: () => {
          obj.x       = tx
          obj.y       = ty
          obj.settled = true
          this.redrawObject(obj)
          this.syncObjVisuals(obj)
          const sh = this.objShadow.get(obj.id)
          if (sh) sh.setScale(0.5)
          this.juice.success(container.cx, container.cy - 10, cv?.box, '✓')
          this._animating = false
          this.checkRoundDone()
        },
      })
    } else {
      this.mistakes++
      // Shake object in place, return to origin
      const origX = obj.x, origY = obj.y
      gfx.setPosition(container.cx, container.cy)
      obj.x = container.cx; obj.y = container.cy
      this.syncObjVisuals(obj)
      // Restrained: burst + gentle shake, no text. The HUD mistake count is the
      // durable signal.
      this.juice.fail(container.cx, container.cy)
      this.tweens.add({
        targets:  gfx,
        x:        origX,
        y:        origY,
        duration: 300,
        ease:     'Back.Out',
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
      this.juice.levelComplete()
      const elapsed  = Math.round((this.time.now - this.startTime) / 1000)
      this.time.delayedCall(400, () => this.showCompletionPanel(elapsed))
    }
  }

  private showCompletionPanel(elapsedSec: number): void {
    const { x: cx, y: cy } = this.layout.center()
    const panelW = 380, panelH = 240

    this.panel = this.ui.createPanel({
      x: cx, y: cy,
      width: panelW, height: panelH,
      fill: 0x14142c,
      stroke: 0x3a3a6e,
      radius: T.radius.lg,
      shadow: true,
    })
    this.panel.container.setDepth(500)

    const title = this.ui.createLabel({
      x: 0, y: -panelH / 2 + 38,
      text: 'SORT COMPLETE',
      textScale: 'heading', landscape: true,
      color: T.color.success,
      align: 'center',
    })
    this.panel.container.add(title)

    const stats = this.ui.createLabel({
      x: 0, y: -14,
      text: `Objects sorted: ${this.objects.length}\nMistakes: ${this.mistakes}\nTime: ${elapsedSec}s`,
      textScale: 'small', landscape: true,
      color: '#9aa4d4',
      align: 'center',
    })
    stats.setLineSpacing(6)
    this.panel.container.add(stats)

    const hasNext = this.round === 0
    const btnY    = cy + panelH / 2 - 44

    const tryAgain = this.ui.createButton({
      x: cx - (hasNext ? 82 : 0), y: btnY,
      text: 'Try Again',
      width: 150, height: 42,
      textScale: 'small', landscape: true,
      color: 0x2a2a52,
      radius: T.radius.sm,
      minTouch: 0,
      onPress: () => { this.clearAll(); this.startMode(this.mode, this.round) },
    })
    tryAgain.container.setDepth(501)
    this.panelButtons.push(tryAgain)

    if (hasNext) {
      const nextRound = this.ui.createButton({
        x: cx + 82, y: btnY,
        text: 'Next Round →',
        width: 150, height: 42,
        textScale: 'small', landscape: true,
        color: 0x2f5bb7,
        radius: T.radius.sm,
        minTouch: 0,
        onPress: () => { this.clearAll(); this.startMode(this.mode, 1) },
      })
      nextRound.container.setDepth(501)
      this.panelButtons.push(nextRound)
    }

    // Panel and buttons arrive together
    this.panel.container.setAlpha(0).setScale(0.85)
    this.tweens.add({
      targets: this.panel.container,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: T.duration.normal, ease: 'Back.Out',
    })
    for (const b of this.panelButtons) {
      b.container.setAlpha(0)
      this.tweens.add({
        targets: b.container,
        alpha: 1,
        duration: T.duration.fast,
        delay: T.duration.fast,
      })
    }
  }
}
