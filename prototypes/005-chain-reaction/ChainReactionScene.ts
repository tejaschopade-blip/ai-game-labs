import Phaser from 'phaser'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { VFXManager } from '../../src/systems/VFXManager'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Obj {
  id: number
  x: number
  y: number
  radius: number
  reactionRadius: number
  activated: boolean
  sprite: Phaser.GameObjects.Arc
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTO = '005-chain-reaction'
const CHAIN_DELAY = 180  // ms between activation waves

// ── Scene ─────────────────────────────────────────────────────────────────────

export class ChainReactionScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager

  private objects: Obj[] = []
  private scenarioIndex = 0
  private chainCount = 0
  private score = 0
  private chainActive = false
  private activationsPending = 0

  private chainLabel!: Phaser.GameObjects.Text
  private scoreLabel!: Phaser.GameObjects.Text
  private scenarioLabel!: Phaser.GameObjects.Text

  constructor() { super({ key: 'ChainReactionScene' }) }

  create(): void {
    this.vfx = new VFXManager(this)

    this.overlay = new DebugOverlay(this, PROTO)
    this.overlay.addWatch('Scenario', () => String(this.scenarioIndex + 1))
    this.overlay.addWatch('Chain',    () => String(this.chainCount))
    this.overlay.addWatch('Score',    () => String(this.score))
    this.overlay.addWatch('Pending',  () => String(this.activationsPending))

    this.addStaticUI()
    this.loadScenario()

    // `this.scale` is the GLOBAL ScaleManager, shared by every scene, so a
    // listener registered here outlives this scene unless it is removed. Since
    // per-prototype design sizes landed, entering a prototype with a different
    // design space fires setGameSize -> 'resize' on every stale listener, which
    // then runs this scene's layout code against a destroyed scene.
    const onResize = (): void => { this.loadScenario() }
    this.scale.on('resize', onResize)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize))
  }

  // ── Static UI (persists across scenarios) ────────────────────────────────────

  private addStaticUI(): void {
    const cx = this.scale.width / 2

    this.add.text(cx, 18, 'CHAIN REACTION', {
      fontSize: '20px', color: '#aaaacc', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.scenarioLabel = this.add.text(cx, 42, '', {
      fontSize: '13px', color: '#666688',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.chainLabel = this.add.text(40, 18, 'CHAIN: 0', {
      fontSize: '13px', color: '#ff8844',
    }).setScrollFactor(0).setDepth(100)

    this.scoreLabel = this.add.text(40, 36, 'SCORE: 0', {
      fontSize: '12px', color: '#8888aa',
    }).setScrollFactor(0).setDepth(100)

    this.add.text(this.scale.width - 8, this.scale.height - 16,
      'Tap a circle  ·  R = restart', {
        fontSize: '11px', color: '#333355',
      }).setOrigin(1).setScrollFactor(0).setDepth(100)
  }

  // ── Scenario loading ──────────────────────────────────────────────────────────

  private loadScenario(): void {
    this.tweens.killAll()
    this.time.removeAllEvents()

    this.chainCount = 0
    this.score = 0
    this.chainActive = false
    this.activationsPending = 0

    for (const o of this.objects) o.sprite.destroy()
    this.objects = []

    this.clearUI()

    const defs = this.buildScenario(this.scenarioIndex)
    this.spawnObjects(defs)
    this.updateUI()
    this.vfx.fadeTransition(300)
  }

  // ── Scenario definitions ──────────────────────────────────────────────────────

  private buildScenario(index: number): Omit<Obj, 'sprite'>[] {
    const cx = this.scale.width  / 2
    const cy = this.scale.height / 2
    const objs: Omit<Obj, 'sprite'>[] = []
    let id = 0
    const add = (x: number, y: number, r: number, rr: number) =>
      objs.push({ id: id++, x, y, radius: r, reactionRadius: rr, activated: false })

    if (index === 0) {
      // Scenario 1 — Tight rings: any tap chains everything
      add(cx, cy, 14, 95)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        add(cx + Math.cos(a) * 65, cy + Math.sin(a) * 65, 14, 95)
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        add(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130, 14, 95)
      }

    } else if (index === 1) {
      // Scenario 2 — Grid with jitter: choose your starting point
      const cols = 5, rows = 4, sx = 100, sy = 80
      const jitter = [17,-12,8,-19,14,-7,22,-5,11,-16,9,-20,15,-8,18,-3,21,-14,6,-10]
      let j = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = cx + (c - (cols - 1) / 2) * sx + jitter[j++ % jitter.length]
          const by = cy + (r - (rows - 1) / 2) * sy + jitter[j++ % jitter.length]
          add(bx, by, 14, 72)
        }
      }
      add(cx - 240, cy - 30, 14, 72)
      add(cx + 240, cy + 30, 14, 72)

    } else if (index === 2) {
      // Scenario 3 — Two clusters: pick one side
      const gap = 270
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        add(cx - gap / 2 + Math.cos(a) * 65, cy + Math.sin(a) * 55, 14, 75)
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        add(cx + gap / 2 + Math.cos(a) * 65, cy + Math.sin(a) * 55, 14, 75)
      }

    } else if (index === 3) {
      // Scenario 4 — Precision: center of diagonal spine chains everything
      const spineCount = 8
      for (let i = 0; i < spineCount; i++) {
        const t = i / (spineCount - 1) - 0.5
        add(cx + t * 420, cy + t * 200, 14, 68)
      }
      // Left clump (connected to spine start)
      const lx = cx - 210, ly = cy - 100
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        add(lx + Math.cos(a) * 55, ly + Math.sin(a) * 55, 14, 68)
      }
      // Right clump (connected to spine end)
      const rx = cx + 210, ry = cy + 100
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        add(rx + Math.cos(a) * 55, ry + Math.sin(a) * 55, 14, 68)
      }

    } else {
      // Scenario 5 — Big: 50 objects in hex-like grid
      const hexW = 70, hexH = 65, cols = 9, rows = 6
      const offsets = [5,-8,12,-3,9,-15,7,-11,4,-6,13,-2,8,-10,3,-7,11,-4,6,-9,14,-1,10,-5,7,-12]
      let oi = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Skip 4 corners to land at 50 objects
          if ((r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)) continue
          const ox = offsets[oi++ % offsets.length]
          const oy = offsets[oi++ % offsets.length]
          const hx = cx + (c - (cols - 1) / 2) * hexW + (r % 2) * (hexW / 2) + ox
          const hy = cy + (r - (rows - 1) / 2) * hexH + oy
          add(hx, hy, 12, 62)
        }
      }
    }

    return objs
  }

  // ── Object spawning ───────────────────────────────────────────────────────────

  private spawnObjects(defs: Omit<Obj, 'sprite'>[]): void {
    for (const d of defs) {
      const sprite = this.add.arc(d.x, d.y, d.radius, 0, 360, false, 0x334455)
        .setStrokeStyle(2, 0x557799)
        .setDepth(10)
        .setInteractive(new Phaser.Geom.Circle(0, 0, d.radius + 6), Phaser.Geom.Circle.Contains)

      const obj: Obj = { ...d, sprite }

      sprite.on('pointerover', () => {
        if (!obj.activated) sprite.setFillStyle(0x445566)
      })
      sprite.on('pointerout', () => {
        if (!obj.activated) sprite.setFillStyle(0x334455)
      })
      sprite.on('pointerdown', () => {
        if (this.chainActive || obj.activated) return
        this.chainActive = true
        this.chainCount = 0
        this.score = 0
        this.updateUI()
        this.clearUI()
        this.scheduleActivation(obj, 0)
      })

      this.objects.push(obj)
    }
  }

  // ── Chain propagation ─────────────────────────────────────────────────────────

  private scheduleActivation(obj: Obj, delay: number): void {
    this.activationsPending++
    this.time.delayedCall(delay, () => {
      this.activationsPending--
      this.activateObject(obj)
      if (this.activationsPending === 0 && this.chainActive) {
        this.time.delayedCall(250, () => {
          if (this.activationsPending === 0 && this.chainActive) this.onChainEnd()
        })
      }
    })
  }

  private activateObject(obj: Obj): void {
    if (obj.activated) return
    obj.activated = true
    this.chainCount++
    this.score += 10
    this.updateUI()

    // Color: orange flash → settle to light
    obj.sprite.setFillStyle(0xff8844)
    this.time.delayedCall(220, () => {
      if (obj.sprite.active) obj.sprite.setFillStyle(0xffcc88)
    })

    // Scale punch
    this.tweens.add({
      targets: obj.sprite,
      scaleX: 1.6, scaleY: 1.6,
      duration: 100, yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => { if (obj.sprite.active) obj.sprite.setScale(1) },
    })

    // Burst particles
    this.vfx.burst(obj.x, obj.y, 0xff8844, 6)

    // Expanding ring
    this.emitRing(obj)

    // Milestone effects
    if (this.chainCount === 5)  this.vfx.screenShake(3, 200)
    if (this.chainCount === 10) this.vfx.screenShake(5, 300)
    if (this.chainCount === 20) this.vfx.screenShake(8, 400)
    if (this.chainCount % 5 === 0) {
      this.vfx.floatingText(obj.x, obj.y - 30, `×${this.chainCount}`, '#ffcc44', '16px')
    }

    // Propagate to neighbors
    for (const other of this.objects) {
      if (other.activated) continue
      const dx = other.x - obj.x
      const dy = other.y - obj.y
      if (Math.sqrt(dx * dx + dy * dy) <= obj.reactionRadius) {
        this.scheduleActivation(other, CHAIN_DELAY)
      }
    }
  }

  private emitRing(obj: Obj): void {
    // Use a Graphics object so we can animate radius reliably
    const g = this.add.graphics().setDepth(5)
    const targetR = obj.reactionRadius
    let currentR = obj.radius
    let alpha = 0.8

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Math.round(CHAIN_DELAY * 1.4),
      ease: 'Quad.Out',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0
        currentR = obj.radius + (targetR - obj.radius) * t
        alpha = 0.8 * (1 - t)
        g.clear()
        g.lineStyle(2, 0x88ccff, alpha)
        g.strokeCircle(obj.x, obj.y, currentR)
      },
      onComplete: () => g.destroy(),
    })
  }

  // ── Chain end ─────────────────────────────────────────────────────────────────

  private onChainEnd(): void {
    if (!this.chainActive) return
    this.chainActive = false

    this.updateUI()

    if (this.chainCount >= 10) {
      this.vfx.screenShake(10, 500)
      this.vfx.floatingText(
        this.scale.width / 2, this.scale.height / 2 - 70,
        `CHAIN: ${this.chainCount}`, '#ffcc44', '32px',
      )
    }

    this.time.delayedCall(this.chainCount >= 10 ? 700 : 300, () => this.showResultPanel())
  }

  // ── Result panel ──────────────────────────────────────────────────────────────

  private showResultPanel(): void {
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const isLast = this.scenarioIndex >= 4

    const panel = this.add.rectangle(cx, cy, 320, 220, 0x111122, 0.92)
      .setStrokeStyle(2, 0x334466).setDepth(200).setScrollFactor(0)
    panel.setData('ui', true)

    const labelComplete = this.add.text(cx, cy - 70, 'CHAIN COMPLETE', {
      fontSize: '16px', color: '#888899',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0)
    labelComplete.setData('ui', true)

    const labelCount = this.add.text(cx, cy - 35, String(this.chainCount), {
      fontSize: '52px', color: this.chainCount >= 10 ? '#ffcc44' : '#ff8844', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0)
    labelCount.setData('ui', true)

    const labelScore = this.add.text(cx, cy + 15, `SCORE: ${this.score}`, {
      fontSize: '16px', color: '#aaaacc',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0)
    labelScore.setData('ui', true)

    if (!isLast) {
      const nextBtn = this.add.text(cx, cy + 55, 'Next Scenario →', {
        fontSize: '15px', color: '#ffffff', backgroundColor: '#224488',
        padding: { x: 18, y: 8 },
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0).setInteractive({ useHandCursor: true })
      nextBtn.setData('ui', true)
      nextBtn.on('pointerdown', () => { this.scenarioIndex++; this.loadScenario() })
      nextBtn.on('pointerover',  () => nextBtn.setAlpha(0.8))
      nextBtn.on('pointerout',   () => nextBtn.setAlpha(1))
    } else {
      const labelDone = this.add.text(cx, cy + 55, 'All scenarios complete!', {
        fontSize: '14px', color: '#ffaa00',
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0)
      labelDone.setData('ui', true)
    }

    const retryOffsetX = isLast ? 0 : 70
    const retryBtn = this.add.text(cx + retryOffsetX, cy + 90, 'Retry', {
      fontSize: '13px', color: '#778899',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0).setInteractive({ useHandCursor: true })
    retryBtn.setData('ui', true)
    retryBtn.on('pointerdown', () => this.loadScenario())
    retryBtn.on('pointerover',  () => retryBtn.setAlpha(0.8))
    retryBtn.on('pointerout',   () => retryBtn.setAlpha(1))

    if (!isLast) {
      const restartBtn = this.add.text(cx - 70, cy + 90, 'Restart', {
        fontSize: '13px', color: '#556677',
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0).setInteractive({ useHandCursor: true })
      restartBtn.setData('ui', true)
      restartBtn.on('pointerdown', () => { this.scenarioIndex = 0; this.loadScenario() })
      restartBtn.on('pointerover',  () => restartBtn.setAlpha(0.8))
      restartBtn.on('pointerout',   () => restartBtn.setAlpha(1))
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────

  private clearUI(): void {
    this.children.list.slice()
      .filter(c => (c as { getData?: (k: string) => unknown }).getData?.('ui'))
      .forEach(c => (c as Phaser.GameObjects.GameObject).destroy())
  }

  private updateUI(): void {
    this.chainLabel?.setText(`CHAIN: ${this.chainCount}`)
    this.scoreLabel?.setText(`SCORE: ${this.score}`)
    this.scenarioLabel?.setText(`Scenario ${this.scenarioIndex + 1} / 5`)
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  update(): void {
    this.overlay.update()
  }
}
