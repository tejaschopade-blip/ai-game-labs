import Phaser from 'phaser'
import { VFXManager } from '../../src/systems/VFXManager'
import { DebugOverlay } from '../../src/ui/DebugOverlay'

// ── Layout constants ──────────────────────────────────────────────────────────
const W            = 960
const H            = 540
const MODE_BAR_H   = 58
const OBJ_AREA_X   = 50
const OBJ_AREA_Y   = MODE_BAR_H + 12
const OBJ_AREA_W   = W - 100
const OBJ_AREA_H   = 290          // object placement grid
const HINT_Y       = OBJ_AREA_Y + OBJ_AREA_H + 14
const CONT_CY      = HINT_Y + 16 + 40  // container center y ≈ 440
const CONT_W       = 132
const CONT_H       = 72

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
function drawObjShape(
  gfx: Phaser.GameObjects.Graphics,
  mode: SortMode,
  obj: SortObject,
  selected: boolean,
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

  // Selection ring
  if (selected) {
    const ringR = (mode === 'WEIGHT' ? 24 : mode === 'BEHAVIOR' ? 26 : SIZE_R[obj.size]) + 7
    gfx.lineStyle(3, 0xffffff, 1)
    gfx.strokeCircle(0, 0, ringR)
  }

  // Settled checkmark overlay
  if (obj.settled) {
    gfx.fillStyle(0x00ff88, 0.25)
    gfx.fillCircle(0, 0, 12)
  }
}

// ── Scene ─────────────────────────────────────────────────────────────────────
export class SortLabScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager

  private mode: SortMode     = 'COLOR'
  private round              = 0
  private objects: SortObject[] = []
  private objGfx             = new Map<number, Phaser.GameObjects.Graphics>()
  private containers: Container[] = []
  private containerLayer: Phaser.GameObjects.GameObject[] = []
  private modeButtons: Array<{ btn: Phaser.GameObjects.Text; mode: SortMode }> = []
  private panelObjects: Phaser.GameObjects.GameObject[] = []
  private hintText?: Phaser.GameObjects.Text

  private selectedId  = -1
  private mistakes    = 0
  private startTime   = 0
  private roundDone   = false
  private _animating  = false
  private bouncingIds = new Set<number>()
  private ptrX        = 0
  private ptrY        = 0

  constructor() { super({ key: 'SortLabScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14)

    this.vfx     = new VFXManager(this)
    this.overlay = new DebugOverlay(this, '009-sort-lab')
    this.overlay.addWatch('Mode',     () => this.mode)
    this.overlay.addWatch('Round',    () => String(this.round + 1))
    this.overlay.addWatch('Left',     () => String(this.objects.filter(o => !o.settled).length))
    this.overlay.addWatch('Mistakes', () => String(this.mistakes))

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.ptrX = p.x
      this.ptrY = p.y
    })

    this.buildModeBar()
    this.startMode('COLOR', 0)
    this.vfx.fadeTransition(300)
  }

  update(_time: number, delta: number): void {
    this.overlay.update()
    if (this.mode === 'BEHAVIOR' && !this.roundDone) {
      this.updateBehaviors(delta)
    }
  }

  // ── Mode bar ────────────────────────────────────────────────────────────────

  private buildModeBar(): void {
    this.add.rectangle(W / 2, MODE_BAR_H / 2, W, MODE_BAR_H, 0x0d0d1a)
    this.add.text(14, MODE_BAR_H / 2, 'SORT LAB', {
      fontSize: '16px', color: '#aaaacc', fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    const btnSpacing = 156
    const startX     = 220
    MODES.forEach((m, i) => {
      const x   = startX + i * btnSpacing
      const btn = this.add.text(x, MODE_BAR_H / 2, m, {
        fontSize: '12px', color: '#555577',
        backgroundColor: '#111133',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })

      btn.on('pointerdown', () => this.switchMode(m))
      btn.on('pointerover', () => { if (this.mode !== m) btn.setColor('#8888aa') })
      btn.on('pointerout',  () => { if (this.mode !== m) btn.setColor('#555577') })
      this.modeButtons.push({ btn, mode: m })
    })
    this.updateModeBar()
  }

  private updateModeBar(): void {
    for (const { btn, mode } of this.modeButtons) {
      if (mode === this.mode) {
        btn.setColor('#ffffff').setBackgroundColor('#223366')
      } else {
        btn.setColor('#555577').setBackgroundColor('#111133')
      }
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
    this.objects    = generateObjects(mode, round)

    this.placeObjects()
    this.buildContainerVisuals()
    this.buildObjectGraphics()
    this.buildHint()
    this.updateModeBar()
    this.setupInput()
  }

  private clearAll(): void {
    this.input.off('pointerdown')
    for (const gfx of this.objGfx.values()) gfx.destroy()
    this.objGfx.clear()
    for (const go of this.containerLayer) (go as { destroy(): void }).destroy()
    this.containerLayer = []
    this.containers     = []
    for (const go of this.panelObjects) (go as { destroy(): void }).destroy()
    this.panelObjects   = []
    if (this.hintText) { this.hintText.destroy(); this.hintText = undefined }
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

    const gfx = this.add.graphics().setDepth(5)
    this.containerLayer.push(gfx)

    for (const c of this.containers) {
      gfx.fillStyle(0x111133, 1)
      gfx.fillRoundedRect(c.cx - c.w / 2, c.cy - c.h / 2, c.w, c.h, 8)
      gfx.lineStyle(1, 0x2233aa, 1)
      gfx.strokeRoundedRect(c.cx - c.w / 2, c.cy - c.h / 2, c.w, c.h, 8)

      const label = this.add.text(c.cx, c.cy, c.category.toUpperCase(), {
        fontSize: '13px', color: '#5566aa', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6)
      this.containerLayer.push(label)
    }
  }

  private buildHint(): void {
    const hintStr = this.mode === 'WEIGHT'
      ? 'Tap object to feel its weight, then tap container  ·  Tap again to change selection'
      : this.mode === 'BEHAVIOR'
        ? 'Move cursor near objects to see behavior, then tap object → tap container'
        : 'Tap object → tap container'

    this.hintText = this.add.text(W / 2, HINT_Y, hintStr, {
      fontSize: '11px', color: '#333355',
    }).setOrigin(0.5).setDepth(6)
  }

  // ── Object graphics ─────────────────────────────────────────────────────────

  private buildObjectGraphics(): void {
    for (const obj of this.objects) {
      const gfx = this.add.graphics().setPosition(obj.x, obj.y).setDepth(10)
      drawObjShape(gfx, this.mode, obj, false)
      this.objGfx.set(obj.id, gfx)
    }
  }

  private redrawObject(obj: SortObject): void {
    const gfx = this.objGfx.get(obj.id)
    if (!gfx) return
    drawObjShape(gfx, this.mode, obj, obj.selected)
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
      const tol = (this.mode === 'WEIGHT' ? 24 : this.mode === 'BEHAVIOR' ? 26 : SIZE_R[obj.size]) + 10
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
    obj.selected   = true
    this.selectedId = obj.id
    this.redrawObject(obj)
  }

  // ── Placement ───────────────────────────────────────────────────────────────

  private attemptPlace(obj: SortObject, container: Container): void {
    this._animating = true
    const correct   = getObjectCategory(obj, this.mode) === container.category
    const gfx       = this.objGfx.get(obj.id)
    if (!gfx) { this._animating = false; return }

    // Deselect visually
    obj.selected    = false
    this.selectedId = -1
    this.redrawObject(obj)

    if (correct) {
      // Fly to container
      this.tweens.add({
        targets:  gfx,
        x:        container.cx,
        y:        container.cy,
        duration: 280,
        ease:     'Quad.Out',
        onUpdate: () => { obj.x = gfx.x; obj.y = gfx.y },
        onComplete: () => {
          obj.x       = container.cx
          obj.y       = container.cy
          obj.settled = true
          this.redrawObject(obj)
          this.vfx.burst(container.cx, container.cy, 0x44ff88, 8)
          this.vfx.floatingText(container.cx, container.cy - 50, '✓', '#44ff88', '22px')
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
      this.cameras.main.shake(120, 0.004)
      this.tweens.add({
        targets:  gfx,
        x:        origX,
        y:        origY,
        duration: 300,
        ease:     'Back.Out',
        onUpdate: () => { obj.x = gfx.x; obj.y = gfx.y },
        onComplete: () => {
          obj.x = origX; obj.y = origY
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
    this.tweens.add({
      targets:  proxy,
      y:        startY - bounceY,
      duration: dur / 2,
      ease:     'Quad.Out',
      yoyo:     true,
      onUpdate: () => { gfx.y = proxy.y; obj.y = proxy.y },
      onComplete: () => {
        gfx.y  = startY
        obj.y  = startY
        this.bouncingIds.delete(obj.id)
        this.selectObj(obj)
      },
    })
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

      gfx.setPosition(obj.x, obj.y)
    }
  }

  // ── Round completion ─────────────────────────────────────────────────────────

  private checkRoundDone(): void {
    if (this.objects.every(o => o.settled)) {
      this.roundDone = true
      const elapsed  = Math.round((this.time.now - this.startTime) / 1000)
      this.time.delayedCall(400, () => this.showCompletionPanel(elapsed))
    }
  }

  private showCompletionPanel(elapsedSec: number): void {
    const cx = W / 2, cy = H / 2
    const bg = this.add.rectangle(cx, cy, 340, 220, 0x111122, 0.96)
      .setStrokeStyle(2, 0x333366).setDepth(500)
    this.panelObjects.push(bg)

    const title = this.add.text(cx, cy - 78, 'SORT COMPLETE', {
      fontSize: '22px', color: '#44ff88', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501)
    this.panelObjects.push(title)

    const stats = this.add.text(cx, cy - 28,
      `Objects sorted: ${this.objects.length}\nMistakes: ${this.mistakes}\nTime: ${elapsedSec}s`, {
        fontSize: '15px', color: '#aaaacc', align: 'center',
      }).setOrigin(0.5).setDepth(501)
    this.panelObjects.push(stats)

    // Try Again button
    const tryAgain = this.add.text(cx - (this.round === 0 ? 70 : 0), cy + 62, 'Try Again', {
      fontSize: '15px', color: '#ffffff', backgroundColor: '#222244',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(501).setInteractive({ useHandCursor: true })
    tryAgain.on('pointerdown', () => { this.clearAll(); this.startMode(this.mode, this.round) })
    tryAgain.on('pointerover', () => tryAgain.setAlpha(0.8))
    tryAgain.on('pointerout',  () => tryAgain.setAlpha(1))
    this.panelObjects.push(tryAgain)

    // Next Round button (only on round 0)
    if (this.round === 0) {
      const nextRound = this.add.text(cx + 70, cy + 62, 'Next Round →', {
        fontSize: '15px', color: '#ffffff', backgroundColor: '#224488',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5).setDepth(501).setInteractive({ useHandCursor: true })
      nextRound.on('pointerdown', () => { this.clearAll(); this.startMode(this.mode, 1) })
      nextRound.on('pointerover', () => nextRound.setAlpha(0.8))
      nextRound.on('pointerout',  () => nextRound.setAlpha(1))
      this.panelObjects.push(nextRound)
    }
  }
}
