import Phaser from 'phaser'
import { InputManager } from '../../src/systems/InputManager'
import { AudioManager } from '../../src/systems/AudioManager'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { PROTOTYPE_NAME } from '../../src/core/Constants'

const SPEED = 200
const PLAYER_SIZE = 24
const GOAL_SIZE = 48

export class FoundationTestScene extends Phaser.Scene {
  private keys!: InputManager
  private audio!: AudioManager
  private debug!: DebugOverlay
  private player!: Phaser.Physics.Arcade.Image
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private goalZone!: Phaser.Physics.Arcade.Image
  private pointerTarget: Phaser.Math.Vector2 | null = null
  private goalReached = false

  constructor() { super({ key: 'FoundationTestScene' }) }

  create(): void {
    this.goalReached = false
    this.pointerTarget = null

    this.keys = new InputManager(this)
    this.audio = new AudioManager(this)
    this.debug = new DebugOverlay(this, PROTOTYPE_NAME)

    if (!this.textures.exists('pixel')) {
      const g = this.add.graphics()
      g.fillStyle(0xffffff)
      g.fillRect(0, 0, 1, 1)
      g.generateTexture('pixel', 1, 1)
      g.destroy()
    }

    this.obstacles = this.physics.add.staticGroup()
    const obstacleData = [
      { x: 300, y: 140, w: 80, h: 120 },
      { x: 480, y: 300, w: 140, h: 60 },
      { x: 200, y: 390, w: 60, h: 110 },
      { x: 660, y: 170, w: 100, h: 80 },
      { x: 760, y: 410, w: 80, h: 100 },
    ]
    for (const o of obstacleData) {
      const img = this.physics.add.staticImage(o.x, o.y, 'pixel')
        .setDisplaySize(o.w, o.h)
        .setTint(0x666666)
      img.refreshBody()
      this.obstacles.add(img)
    }

    this.goalZone = this.physics.add.staticImage(880, 270, 'pixel')
      .setDisplaySize(GOAL_SIZE, GOAL_SIZE)
      .setTint(0x00ff88)
    this.goalZone.refreshBody()
    this.add.text(880, 270, '★', { color: '#003322', fontSize: '24px' }).setOrigin(0.5)

    this.player = this.physics.add.image(80, 270, 'pixel')
      .setDisplaySize(PLAYER_SIZE, PLAYER_SIZE)
      .setTint(0x4488ff)
    this.player.setCollideWorldBounds(true)

    this.physics.add.collider(this.player, this.obstacles)
    this.physics.add.overlap(this.player, this.goalZone, this.onGoal, undefined, this)

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.goalReached) this.pointerTarget = new Phaser.Math.Vector2(p.worldX, p.worldY)
    })

    this.add.text(80, 244, 'YOU', { color: '#aaccff', fontSize: '10px' }).setOrigin(0.5)
    this.add.text(8, this.scale.height - 22,
      'WASD / Arrows to move  ·  Click to set target  ·  R = restart',
      { color: '#555555', fontSize: '11px' }
    ).setScrollFactor(0)
  }

  private onGoal(): void {
    if (this.goalReached) return
    this.goalReached = true
    void this.audio
    ;(this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0)
    this.add.text(this.scale.width / 2, this.scale.height / 2 - 40, 'GOAL REACHED!', {
      color: '#00ff88', fontSize: '48px', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0)
    this.add.text(this.scale.width / 2, this.scale.height / 2 + 20, 'restarting in 2s…', {
      color: '#888888', fontSize: '16px',
    }).setOrigin(0.5).setScrollFactor(0)
    this.time.delayedCall(2000, () => this.scene.restart())
  }

  update(): void {
    this.debug.update()
    if (this.goalReached) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    let vx = 0
    let vy = 0

    if (this.keys.left) { vx = -SPEED; this.pointerTarget = null }
    else if (this.keys.right) { vx = SPEED; this.pointerTarget = null }
    if (this.keys.up) { vy = -SPEED; this.pointerTarget = null }
    else if (this.keys.down) { vy = SPEED; this.pointerTarget = null }

    if (this.pointerTarget !== null) {
      const dx = this.pointerTarget.x - this.player.x
      const dy = this.pointerTarget.y - this.player.y
      const dist = Math.hypot(dx, dy)
      if (dist > 5) {
        vx = (dx / dist) * SPEED
        vy = (dy / dist) * SPEED
      } else {
        this.pointerTarget = null
      }
    }

    body.setVelocity(vx, vy)
  }
}
