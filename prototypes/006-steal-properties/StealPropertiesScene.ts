import Phaser from 'phaser'
import { InputManager } from '../../src/systems/InputManager'
import { VFXManager } from '../../src/systems/VFXManager'
import { DebugOverlay } from '../../src/ui/DebugOverlay'

// ── Property types ────────────────────────────────────────────────────────────

enum PlayerProperty { None = 'none', Fire = 'fire', Ice = 'ice', Magnet = 'magnet' }

const PROP_COLOR: Record<PlayerProperty, number> = {
  [PlayerProperty.None]:   0x8888aa,
  [PlayerProperty.Fire]:   0xff4422,
  [PlayerProperty.Ice]:    0x44ccff,
  [PlayerProperty.Magnet]: 0xaa44ff,
}

const PROP_HEX: Record<PlayerProperty, string> = {
  [PlayerProperty.None]:   '#8888aa',
  [PlayerProperty.Fire]:   '#ff4422',
  [PlayerProperty.Ice]:    '#44ccff',
  [PlayerProperty.Magnet]: '#aa44ff',
}

const PROP_LABEL: Record<PlayerProperty, string> = {
  [PlayerProperty.None]:   'NONE',
  [PlayerProperty.Fire]:   'FIRE',
  [PlayerProperty.Ice]:    'ICE',
  [PlayerProperty.Magnet]: 'MAGNET',
}

// ── Layout constants ──────────────────────────────────────────────────────────

const W = 960
const H = 540

// Divider wall at x=480, gap from y=210 to y=308
const DIV_X       = 480
const GAP_TOP     = 210
const GAP_BOTTOM  = 308
const GAP_MID     = (GAP_TOP + GAP_BOTTOM) / 2   // 259
const GAP_HEIGHT  = GAP_BOTTOM - GAP_TOP           // 98

const PLAYER_START = { x: 140, y: 270 }

const FIRE_SRC   = { x: 200, y: 120 }
const ICE_SRC    = { x: 200, y: 420 }
const MAGNET_SRC = { x: 340, y: 420 }

const WOOD_POSITIONS = [{ x: 330, y: 120 }, { x: 370, y: 120 }]

const WATER_X    = DIV_X
const WATER_Y    = GAP_MID
const WATER_W    = 20
const WATER_H    = GAP_HEIGHT

const METAL_START = { x: 700, y: 400 }
const GOAL        = { x: 820, y: 270 }

const GRAB_DIST   = 55
const FREEZE_DIST = 65

// ── Scene ─────────────────────────────────────────────────────────────────────

export class StealPropertiesScene extends Phaser.Scene {
  private keys!: InputManager
  private overlay!: DebugOverlay
  private vfx!: VFXManager

  private property: PlayerProperty = PlayerProperty.None
  private won = false

  // Player
  private playerPhys!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
  private playerGfx!: Phaser.GameObjects.Graphics
  private propTagText!: Phaser.GameObjects.Text

  // HUD
  private propLabel!: Phaser.GameObjects.Text

  // Sources
  private sources: Array<{
    x: number; y: number; property: PlayerProperty
  }> = []

  // Interactables
  private woodBlocks: Phaser.GameObjects.Rectangle[] = []
  private woodGroup!: Phaser.Physics.Arcade.StaticGroup
  private waterSprite!: Phaser.GameObjects.Rectangle
  private waterBody!: Phaser.Physics.Arcade.StaticBody
  private waterFrozen = false
  private metalPhys!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
  private metalGfx!: Phaser.GameObjects.Rectangle

  // Walls
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup

  constructor() { super({ key: 'StealPropertiesScene' }) }

  create(): void {
    this.property     = PlayerProperty.None
    this.waterFrozen  = false
    this.won          = false

    this.vfx     = new VFXManager(this)
    this.keys    = new InputManager(this)
    this.overlay = new DebugOverlay(this, '006-steal-properties')
    this.overlay.addWatch('Property', () => this.property)
    this.overlay.addWatch('Player',   () => `(${Math.round(this.playerPhys.x)},${Math.round(this.playerPhys.y)})`)
    this.overlay.addWatch('Wood',     () => `${this.woodBlocks.filter(w => w.active).length} left`)
    this.overlay.addWatch('Water',    () => this.waterFrozen ? 'frozen' : 'liquid')

    this.physics.world.setBounds(0, 0, W, H)

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14)

    this.createPlayer()
    this.createWalls()
    this.createSources()
    this.createInteractables()
    this.createGoal()
    this.createHUD()
    this.createHints()

    // Colliders (player exists now)
    this.physics.add.collider(this.playerPhys, this.wallGroup)
    this.physics.add.collider(this.playerPhys, this.woodGroup)
    this.physics.add.collider(this.metalPhys,  this.wallGroup)

    this.vfx.fadeTransition(400)
  }

  // ── Creation helpers ─────────────────────────────────────────────────────────

  private createPlayer(): void {
    // Invisible physics image — body drives collision
    this.playerPhys = this.physics.add.image(PLAYER_START.x, PLAYER_START.y, '__DEFAULT')
    this.playerPhys.setVisible(false)
    this.playerPhys.setCircle(16, 0, 0)
    this.playerPhys.setCollideWorldBounds(true)
    this.playerPhys.setMaxVelocity(200, 200)
    this.playerPhys.setDrag(800, 800)

    // Visual graphics (synced each frame)
    this.playerGfx = this.add.graphics().setDepth(10)

    // Property tag floating above player
    this.propTagText = this.add.text(0, 0, '', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11)
  }

  private createWalls(): void {
    this.wallGroup = this.physics.add.staticGroup()

    const addWall = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x, y, w, h, 0x333344).setDepth(2)
      this.wallGroup.add(r)
      this.physics.add.existing(r, true)
    }

    const T = 16
    // Border walls
    addWall(W / 2, T / 2,     W, T)   // top
    addWall(W / 2, H - T / 2, W, T)   // bottom
    addWall(T / 2, H / 2,     T, H)   // left
    addWall(W - T / 2, H / 2, T, H)   // right

    // Inner vertical divider — top segment (y=16 → y=GAP_TOP)
    const topSegH = GAP_TOP - T
    addWall(DIV_X, T + topSegH / 2, T, topSegH)

    // Inner vertical divider — bottom segment (y=GAP_BOTTOM → y=H-T)
    const botSegH = (H - T) - GAP_BOTTOM
    addWall(DIV_X, GAP_BOTTOM + botSegH / 2, T, botSegH)

    this.wallGroup.refresh()
  }

  private createSources(): void {
    const defs: Array<{ x: number; y: number; prop: PlayerProperty; label: string; color: number }> = [
      { x: FIRE_SRC.x,   y: FIRE_SRC.y,   prop: PlayerProperty.Fire,   label: 'FIRE',   color: PROP_COLOR[PlayerProperty.Fire]   },
      { x: ICE_SRC.x,    y: ICE_SRC.y,    prop: PlayerProperty.Ice,    label: 'ICE',    color: PROP_COLOR[PlayerProperty.Ice]    },
      { x: MAGNET_SRC.x, y: MAGNET_SRC.y, prop: PlayerProperty.Magnet, label: 'MAGNET', color: PROP_COLOR[PlayerProperty.Magnet] },
    ]

    for (const d of defs) {
      const arc = this.add.arc(d.x, d.y, 22, 0, 360, false, d.color).setDepth(8)
      arc.setStrokeStyle(2, 0xffffff, 0.3)

      // Pulsing glow
      this.tweens.add({
        targets: arc,
        scaleX: 1.15, scaleY: 1.15,
        alpha: 0.8,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })

      const hexCol = PROP_HEX[d.prop]
      this.add.text(d.x, d.y - 30, d.label, {
        fontSize: '11px', color: hexCol, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(9)

      this.sources.push({ x: d.x, y: d.y, property: d.prop })
    }
  }

  private createInteractables(): void {
    // Wood blocks (static) — near fire source in top lane
    this.woodGroup = this.physics.add.staticGroup()
    for (const pos of WOOD_POSITIONS) {
      const r = this.add.rectangle(pos.x, pos.y, 30, 30, 0x774422).setDepth(8)
      r.setStrokeStyle(2, 0xaa6633)
      this.physics.add.existing(r, true)
      this.woodGroup.add(r)
      this.woodBlocks.push(r)
    }
    this.add.text(350, 95, 'WOOD', { fontSize: '10px', color: '#774422' }).setOrigin(0.5).setDepth(9)

    // Water patch — fills the gap in the divider wall
    this.waterSprite = this.add.rectangle(WATER_X, WATER_Y, WATER_W, WATER_H, 0x2244cc, 0.75).setDepth(8)
    this.physics.add.existing(this.waterSprite, true)
    this.waterBody = this.waterSprite.body as Phaser.Physics.Arcade.StaticBody
    this.physics.add.collider(this.playerPhys, this.waterSprite)
    this.add.text(WATER_X - 30, WATER_Y - WATER_H / 2 - 12, 'WATER', {
      fontSize: '10px', color: '#4488cc',
    }).setOrigin(0.5).setDepth(9)

    // Metal block (dynamic physics, invisible image + visible rect)
    this.metalPhys = this.physics.add.image(METAL_START.x, METAL_START.y, '__DEFAULT')
    this.metalPhys.setVisible(false)
    this.metalPhys.setSize(28, 28)
    this.metalPhys.setCollideWorldBounds(true)
    this.metalPhys.setDrag(200, 200)

    this.metalGfx = this.add.rectangle(METAL_START.x, METAL_START.y, 28, 28, 0x8899aa).setDepth(8)
    this.metalGfx.setStrokeStyle(2, 0xaabbcc)
    this.add.text(METAL_START.x, METAL_START.y - 22, 'METAL', {
      fontSize: '10px', color: '#8899aa',
    }).setOrigin(0.5).setDepth(9)
  }

  private createGoal(): void {
    const goalArc = this.add.arc(GOAL.x, GOAL.y, 22, 0, 360, false, 0x00cc77).setDepth(8)
    goalArc.setStrokeStyle(3, 0x00ff88, 1)
    this.tweens.add({
      targets: goalArc,
      scaleX: 1.12, scaleY: 1.12,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
    this.add.text(GOAL.x, GOAL.y, '★', { fontSize: '20px', color: '#003322' }).setOrigin(0.5).setDepth(9)
    this.add.text(GOAL.x, GOAL.y - 32, 'GOAL', { fontSize: '12px', color: '#00ff88' }).setOrigin(0.5).setDepth(9)
  }

  private createHUD(): void {
    this.add.text(20, 20, 'PROPERTY', {
      fontSize: '11px', color: '#444466',
    }).setScrollFactor(0).setDepth(200)

    this.propLabel = this.add.text(20, 34, 'NONE', {
      fontSize: '20px', color: PROP_HEX[PlayerProperty.None], fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(200)
  }

  private createHints(): void {
    this.add.text(FIRE_SRC.x, FIRE_SRC.y + 32, 'touch for FIRE', {
      fontSize: '10px', color: '#ff6644',
    }).setOrigin(0.5).setDepth(9)
    this.add.text(ICE_SRC.x, ICE_SRC.y + 32, 'touch for ICE', {
      fontSize: '10px', color: '#44aaff',
    }).setOrigin(0.5).setDepth(9)
    this.add.text(MAGNET_SRC.x, MAGNET_SRC.y + 32, 'touch for MAGNET', {
      fontSize: '10px', color: '#9944ff',
    }).setOrigin(0.5).setDepth(9)
    this.add.text(W / 2, H - 10,
      'WASD / Arrows: move  ·  walk into sources to steal property  ·  R=restart  ESC=menu', {
        fontSize: '11px', color: '#222244',
      }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(200)
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  update(): void {
    this.overlay.update()
    if (this.won) return

    this.handleMovement()
    this.syncVisuals()
    this.checkPropertyAcquisition()
    this.checkPropertyInteractions()
    this.checkGoal()
  }

  private handleMovement(): void {
    const speed = 180
    let vx = 0, vy = 0
    if (this.keys.left)  vx -= speed
    if (this.keys.right) vx += speed
    if (this.keys.up)    vy -= speed
    if (this.keys.down)  vy += speed

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2
      vx *= inv
      vy *= inv
    }

    this.playerPhys.setVelocity(vx, vy)
  }

  private syncVisuals(): void {
    const px = this.playerPhys.x
    const py = this.playerPhys.y

    // Player graphics (circle with colored ring)
    this.playerGfx.clear()
    this.playerGfx.fillStyle(0xdde0ee, 1)
    this.playerGfx.fillCircle(px, py, 14)
    this.playerGfx.lineStyle(3, PROP_COLOR[this.property], 1)
    this.playerGfx.strokeCircle(px, py, 18)

    // Property tag above player
    this.propTagText.setPosition(px, py - 30)
    this.propTagText.setText(this.property === PlayerProperty.None ? '' : PROP_LABEL[this.property])
    this.propTagText.setColor(PROP_HEX[this.property])

    // Metal graphic follows physics body
    this.metalGfx.setPosition(this.metalPhys.x, this.metalPhys.y)
  }

  // ── Property acquisition ─────────────────────────────────────────────────────

  private checkPropertyAcquisition(): void {
    const px = this.playerPhys.x
    const py = this.playerPhys.y

    for (const src of this.sources) {
      const dx = src.x - px
      const dy = src.y - py
      if (Math.sqrt(dx * dx + dy * dy) < GRAB_DIST) {
        if (this.property !== src.property) {
          this.acquireProperty(src.property, src.x, src.y)
        }
        break
      }
    }
  }

  private acquireProperty(prop: PlayerProperty, srcX: number, srcY: number): void {
    this.property = prop

    this.vfx.burst(srcX, srcY, PROP_COLOR[prop], 10)

    // Scale punch on player graphics region (fake target via a temp obj)
    this.tweens.add({
      targets: this.playerGfx,
      scaleX: 1.35, scaleY: 1.35,
      duration: 120,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => { this.playerGfx.setScale(1) },
    })

    this.vfx.floatingText(this.playerPhys.x, this.playerPhys.y - 20,
      PROP_LABEL[prop], PROP_HEX[prop], '14px')

    this.propLabel.setText(PROP_LABEL[prop]).setColor(PROP_HEX[prop])
  }

  // ── Property interactions ────────────────────────────────────────────────────

  private checkPropertyInteractions(): void {
    const px = this.playerPhys.x
    const py = this.playerPhys.y

    if (this.property === PlayerProperty.Fire) {
      for (const wood of this.woodBlocks) {
        if (!wood.active) continue
        const dx = wood.x - px
        const dy = wood.y - py
        if (Math.sqrt(dx * dx + dy * dy) < 48) {
          this.burnWood(wood)
        }
      }
    }

    if (this.property === PlayerProperty.Ice && !this.waterFrozen) {
      const dx = WATER_X - px
      const dy = WATER_Y - py
      if (Math.sqrt(dx * dx + dy * dy) < FREEZE_DIST) {
        this.freezeWater()
      }
    }

    if (this.property === PlayerProperty.Magnet) {
      const dx = px - this.metalPhys.x
      const dy = py - this.metalPhys.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 30 && dist < 350) {
        const spd = 130
        this.metalPhys.setVelocity((dx / dist) * spd, (dy / dist) * spd)
      } else if (dist <= 30) {
        this.metalPhys.setVelocity(0, 0)
      }
    } else {
      // Slow metal to stop when no magnet
      if (this.metalPhys.body.speed > 5) {
        this.metalPhys.setDrag(300, 300)
      }
    }
  }

  private burnWood(wood: Phaser.GameObjects.Rectangle): void {
    this.woodBlocks = this.woodBlocks.filter(w => w !== wood)
    this.vfx.burst(wood.x, wood.y, 0xff6600, 12)
    this.vfx.floatingText(wood.x, wood.y - 10, 'BURNED', '#ff8800', '12px')
    const body = wood.body as Phaser.Physics.Arcade.StaticBody
    body.enable = false
    this.tweens.add({
      targets: wood,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 350,
      ease: 'Quad.Out',
      onComplete: () => wood.destroy(),
    })
  }

  private freezeWater(): void {
    this.waterFrozen = true
    this.waterBody.enable = false

    // Replace water sprite with ice look
    this.waterSprite.setFillStyle(0x88ddff, 0.85)
    this.waterSprite.setStrokeStyle(2, 0xaaeeff, 1)

    this.vfx.burst(WATER_X, WATER_Y, 0x88eeff, 10)
    this.vfx.floatingText(WATER_X - 40, WATER_Y - 20, 'FROZEN', '#88eeff', '13px')
    this.add.text(WATER_X - 30, WATER_Y - WATER_H / 2 - 12, 'ICE', {
      fontSize: '10px', color: '#88ccff',
    }).setOrigin(0.5).setDepth(9)
  }

  // ── Win ───────────────────────────────────────────────────────────────────────

  private checkGoal(): void {
    const dx = GOAL.x - this.playerPhys.x
    const dy = GOAL.y - this.playerPhys.y
    if (Math.sqrt(dx * dx + dy * dy) < 38) {
      this.onWin()
    }
  }

  private onWin(): void {
    if (this.won) return
    this.won = true

    this.playerPhys.setVelocity(0, 0)
    this.vfx.burst(GOAL.x, GOAL.y, 0x00ff88, 20)
    this.vfx.screenShake(8, 400)

    const cx = W / 2, cy = H / 2

    this.add.rectangle(cx, cy, 320, 190, 0x111122, 0.95)
      .setStrokeStyle(2, 0x333366).setDepth(500).setScrollFactor(0)

    this.add.text(cx, cy - 50, 'LEVEL COMPLETE', {
      fontSize: '24px', color: '#00ff88', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    this.add.text(cx, cy - 12, 'You stole the right property.', {
      fontSize: '13px', color: '#666688',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    const btn = this.add.text(cx, cy + 40, 'Play Again', {
      fontSize: '16px', color: '#ffffff',
      backgroundColor: '#224488',
      padding: { x: 18, y: 9 },
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })

    btn.on('pointerdown', () => this.scene.restart())
    btn.on('pointerover',  () => btn.setAlpha(0.8))
    btn.on('pointerout',   () => btn.setAlpha(1))
  }
}
