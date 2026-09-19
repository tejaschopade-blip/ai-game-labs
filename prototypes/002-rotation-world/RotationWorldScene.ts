import Phaser from 'phaser'
import { InputManager } from '../../src/systems/InputManager'
import { DebugOverlay } from '../../src/ui/DebugOverlay'

const CELL = 60
const GRID = 7
const PROTO = '002-rotation-world'

// 0 = empty, 1 = wall
const LAYOUT = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
]
const PLAYER_START = { row: 1, col: 1 }
const GOAL = { row: 1, col: 5 }

// Maps screen direction → [dcol, drow] at each world rotation (0, 90, 180, 270 CW)
const DIR: Record<number, Record<string, [number, number]>> = {
  0:   { right: [1, 0],  left: [-1, 0], up: [0, -1], down: [0, 1]  },
  90:  { right: [0, -1], left: [0, 1],  up: [-1, 0], down: [1, 0]  },
  180: { right: [-1, 0], left: [1, 0],  up: [0, 1],  down: [0, -1] },
  270: { right: [0, 1],  left: [0, -1], up: [1, 0],  down: [-1, 0] },
}

export class RotationWorldScene extends Phaser.Scene {
  private keys!: InputManager
  private debug!: DebugOverlay
  private world!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Rectangle
  private playerRow = PLAYER_START.row
  private playerCol = PLAYER_START.col
  private worldAngle = 0   // logical: 0 | 90 | 180 | 270
  private tweenAngle = 0   // cumulative for tween targets
  private animating = false
  private won = false

  constructor() { super({ key: 'RotationWorldScene' }) }

  create(): void {
    this.won = false
    this.animating = false
    this.worldAngle = 0
    this.tweenAngle = 0
    this.playerRow = PLAYER_START.row
    this.playerCol = PLAYER_START.col

    this.keys = new InputManager(this)
    this.debug = new DebugOverlay(this, PROTO)
    this.debug.addWatch('Rotation', () => `${this.worldAngle}°`)
    this.debug.addWatch('Player',   () => `(${this.playerCol}, ${this.playerRow})`)
    this.debug.addWatch('Status',   () => this.won ? 'won ✓' : this.animating ? 'rotating…' : 'ready')

    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const half = (GRID * CELL) / 2

    this.world = this.add.container(cx, cy)

    // Background board
    const board = this.add.rectangle(0, 0, GRID * CELL, GRID * CELL, 0x1a1a2e)
    this.world.add(board)

    // Tiles
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const lx = -half + col * CELL + CELL / 2
        const ly = -half + row * CELL + CELL / 2
        const wall = LAYOUT[row][col] === 1
        const tile = this.add.rectangle(lx, ly, CELL - 2, CELL - 2, wall ? 0x555566 : 0x111122)
        if (!wall) tile.setStrokeStyle(1, 0x2a2a3a)
        this.world.add(tile)
      }
    }

    // Goal
    const glx = -half + GOAL.col * CELL + CELL / 2
    const gly = -half + GOAL.row * CELL + CELL / 2
    const goalRect = this.add.rectangle(glx, gly, CELL - 8, CELL - 8, 0x00cc77)
    const goalStar = this.add.text(glx, gly, '★', { fontSize: '22px', color: '#003322' }).setOrigin(0.5)
    this.world.add(goalRect)
    this.world.add(goalStar)

    // Player
    const plx = -half + this.playerCol * CELL + CELL / 2
    const ply = -half + this.playerRow * CELL + CELL / 2
    this.playerSprite = this.add.rectangle(plx, ply, CELL - 14, CELL - 14, 0x4488ff)
    this.world.add(this.playerSprite)

    // UI hints
    this.add.text(cx, this.scale.height - 24,
      'WASD / Arrows to move  ·  each move rotates the world  ·  R = restart',
      { fontSize: '11px', color: '#444466' }
    ).setOrigin(0.5).setScrollFactor(0)

    this.add.text(this.scale.width - 12, 8, '↻', {
      fontSize: '18px', color: '#334455',
    }).setOrigin(1, 0).setScrollFactor(0)
  }

  private cellLocal(row: number, col: number): [number, number] {
    const half = (GRID * CELL) / 2
    return [-half + col * CELL + CELL / 2, -half + row * CELL + CELL / 2]
  }

  private tryMove(dcol: number, drow: number): void {
    if (this.animating || this.won) return
    const nr = this.playerRow + drow
    const nc = this.playerCol + dcol
    if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return
    if (LAYOUT[nr][nc] === 1) return

    this.animating = true
    this.playerRow = nr
    this.playerCol = nc
    this.tweenAngle += 90
    this.worldAngle = (this.worldAngle + 90) % 360

    const [px, py] = this.cellLocal(nr, nc)

    this.tweens.add({
      targets: this.playerSprite,
      x: px, y: py,
      duration: 200,
      ease: 'Quad.Out',
    })

    this.tweens.add({
      targets: this.world,
      angle: this.tweenAngle,
      duration: 480,
      ease: 'Cubic.InOut',
      onComplete: () => {
        this.animating = false
        if (this.playerRow === GOAL.row && this.playerCol === GOAL.col) this.onWin()
      },
    })
  }

  private onWin(): void {
    this.won = true
    this.add.text(this.scale.width / 2, this.scale.height / 2 - 40, 'YOU DID IT!', {
      fontSize: '52px', color: '#00ff88', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0)
    this.add.text(this.scale.width / 2, this.scale.height / 2 + 24, 'restarting in 2.5s…', {
      fontSize: '16px', color: '#888888',
    }).setOrigin(0.5).setScrollFactor(0)
    this.time.delayedCall(2500, () => this.scene.restart())
  }

  update(): void {
    this.debug.update()
    if (this.animating || this.won) return
    const d = DIR[this.worldAngle]
    if (this.keys.right) this.tryMove(...d.right)
    else if (this.keys.left) this.tryMove(...d.left)
    else if (this.keys.up) this.tryMove(...d.up)
    else if (this.keys.down) this.tryMove(...d.down)
  }
}
