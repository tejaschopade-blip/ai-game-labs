import Phaser from 'phaser'
import { InputManager } from '../../src/systems/InputManager'
import { VFXManager } from '../../src/systems/VFXManager'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { GARDEN_SHORTCUT, parseLevel, posKey, opposite, DIR_VEC } from './levelData'
import type { Dir, GridPos, ParsedLevel } from './levelData'

const C = {
  bg:          0xeef3e2,
  path:        0xe3dcc4,
  hedge:       0x5a9d4a,
  hedgeTop:    0x74b562,
  hedgeLeaf:   0x47803a,
  player:      0xff9a5c,
  playerLine:  0x4a3728,
  gold:        0xffd24a,
  wood:        0x9c6b3f,
  woodDark:    0x7d5430,
  mint:        0x7ad4a0,
  mintDark:    0x4a7a5e,
  ink:         '#6b7a5e',
  faint:       0xc3cbb4,
}

const TILES_PER_SEC = 3.6
const SWIPE_MIN = 24

export class CozyMazeScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager
  private keys!: InputManager

  private level!: ParsedLevel
  private tile = 0
  private originX = 0
  private originY = 0

  private col = 0
  private row = 0
  private dir: Dir | null = null
  private nextDir: Dir | null = null
  private t = 0

  private hasKey = false
  private gateLocked = true
  private completed = false
  private startTime = 0
  private elapsed = 0

  private keyPos: GridPos | null = null
  private gatePos: GridPos | null = null
  private exitPos: GridPos | null = null

  private playerC!: Phaser.GameObjects.Container
  private eyeL!: Phaser.GameObjects.Arc
  private eyeR!: Phaser.GameObjects.Arc
  private keyC: Phaser.GameObjects.Container | null = null
  private gateC: Phaser.GameObjects.Container | null = null
  private hudKeyG!: Phaser.GameObjects.Graphics

  private swipeStart: { x: number; y: number } | null = null

  constructor() { super({ key: 'CozyMazeScene' }) }

  create(): void {
    const W = this.scale.width
    const H = this.scale.height

    this.level = parseLevel(GARDEN_SHORTCUT)
    this.col = this.level.playerStart.col
    this.row = this.level.playerStart.row
    this.dir = null
    this.nextDir = null
    this.t = 0
    this.hasKey = false
    this.gateLocked = true
    this.completed = false
    this.elapsed = 0
    this.startTime = this.time.now

    for (const o of this.level.objects) {
      if (o.kind === 'key')  this.keyPos  = o.pos
      if (o.kind === 'gate') this.gatePos = o.pos
      if (o.kind === 'exit') this.exitPos = o.pos
    }

    this.tile = Math.floor(Math.min((W - 48) / this.level.width, (H - 108) / this.level.height))
    this.originX = Math.floor((W - this.level.width * this.tile) / 2)
    this.originY = 64 + Math.floor((H - 64 - 28 - this.level.height * this.tile) / 2)

    this.vfx = new VFXManager(this)
    this.keys = new InputManager(this)

    this.add.rectangle(W / 2, H / 2, W, H, C.bg).setDepth(0)
    this.buildMaze()
    this.buildExit()
    this.buildGate()
    this.buildKey()
    this.buildPlayer()
    this.buildHud()
    this.bindSwipe()

    this.overlay = new DebugOverlay(this, '010-cozy-maze')
    this.overlay.addWatch('Tile', () => `(${this.col}, ${this.row})`)
    this.overlay.addWatch('Dir',  () => this.dir ?? '-')
    this.overlay.addWatch('Key',  () => (this.hasKey ? 'yes' : 'no'))
    this.overlay.addWatch('Time', () => `${this.elapsed.toFixed(1)}s`)

    this.renderPlayer()
    this.vfx.fadeTransition(300)
  }

  // ── geometry ───────────────────────────────────────────────────────────────

  private tileCenter(col: number, row: number): { x: number; y: number } {
    return {
      x: this.originX + col * this.tile + this.tile / 2,
      y: this.originY + row * this.tile + this.tile / 2,
    }
  }

  private canEnter(col: number, row: number): boolean {
    if (col < 0 || col >= this.level.width)  return false
    if (row < 0 || row >= this.level.height) return false
    const k = posKey({ col, row })
    if (this.level.walls.has(k)) return false
    if (this.gateLocked && this.gatePos && k === posKey(this.gatePos)) return false
    return true
  }

  // ── build ──────────────────────────────────────────────────────────────────

  private buildMaze(): void {
    const T = this.tile
    const w = this.level.width * T
    const h = this.level.height * T

    const shadow = this.add.graphics().setDepth(1)
    shadow.fillStyle(0x3b4a33, 0.10)
    shadow.fillRoundedRect(this.originX - 5, this.originY - 3, w + 10, h + 14, 12)

    const g = this.add.graphics().setDepth(2)
    const leafR = Math.max(1, T * 0.055)

    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        const x = this.originX + c * T
        const y = this.originY + r * T

        if (!this.level.walls.has(posKey({ col: c, row: r }))) {
          g.fillStyle(C.path, 1)
          g.fillRect(x, y, T, T)
          continue
        }

        g.fillStyle(C.hedge, 1)
        g.fillRoundedRect(x + 1, y + 1, T - 2, T - 2, Math.max(3, T * 0.26))
        g.fillStyle(C.hedgeTop, 1)
        g.fillRoundedRect(x + 3, y + 3, T - 6, Math.max(3, T * 0.28), Math.max(2, T * 0.13))

        // Deterministic speckles — derived from grid pos so they never flicker.
        const seed = c * 7 + r * 13
        g.fillStyle(C.hedgeLeaf, 1)
        const span = Math.max(1, T - 10)
        for (let i = 0; i < 3; i++) {
          const sx = x + 5 + ((seed * (i + 3) * 17) % span)
          const sy = y + 6 + ((seed * (i + 5) * 11) % Math.max(1, span - 2))
          g.fillCircle(sx, sy, leafR)
        }
      }
    }
  }

  private buildExit(): void {
    if (!this.exitPos) return
    const T = this.tile
    const { x, y } = this.tileCenter(this.exitPos.col, this.exitPos.row)

    const glow = this.add.circle(x, y, T * 0.52, C.mint, 0.30).setDepth(3)
    this.tweens.add({
      targets: glow,
      scaleX: 1.2, scaleY: 1.2, alpha: 0.12,
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    const g = this.add.graphics().setDepth(4)
    g.fillStyle(C.mint, 1)
    g.fillRoundedRect(x - T * 0.34, y - T * 0.38, T * 0.68, T * 0.76, {
      tl: T * 0.34, tr: T * 0.34, bl: 3, br: 3,
    })
    g.fillStyle(C.bg, 1)
    g.fillRoundedRect(x - T * 0.20, y - T * 0.18, T * 0.40, T * 0.56, {
      tl: T * 0.20, tr: T * 0.20, bl: 2, br: 2,
    })
  }

  private buildGate(): void {
    if (!this.gatePos) return
    const T = this.tile
    const { x, y } = this.tileCenter(this.gatePos.col, this.gatePos.row)

    const g = this.add.graphics()
    const slatW = T * 0.17
    for (let i = 0; i < 3; i++) {
      g.fillStyle(C.wood, 1)
      g.fillRoundedRect(-T * 0.38 + i * T * 0.28, -T * 0.40, slatW, T * 0.80, 2)
    }
    g.fillStyle(C.woodDark, 1)
    g.fillRect(-T * 0.40, -T * 0.20, T * 0.80, T * 0.09)
    g.fillRect(-T * 0.40, T * 0.10, T * 0.80, T * 0.09)

    this.gateC = this.add.container(x, y, [g]).setDepth(5)
  }

  private buildKey(): void {
    if (!this.keyPos) return
    const T = this.tile
    const { x, y } = this.tileCenter(this.keyPos.col, this.keyPos.row)

    const g = this.add.graphics()
    g.fillStyle(C.gold, 1)
    g.fillCircle(-T * 0.14, 0, T * 0.14)
    g.fillStyle(C.path, 1)
    g.fillCircle(-T * 0.14, 0, T * 0.06)
    g.fillStyle(C.gold, 1)
    g.fillRect(-T * 0.05, -T * 0.05, T * 0.34, T * 0.10)
    g.fillRect(T * 0.14, 0, T * 0.06, T * 0.14)
    g.fillRect(T * 0.23, 0, T * 0.06, T * 0.10)

    this.keyC = this.add.container(x, y, [g]).setDepth(6)
    this.tweens.add({
      targets: this.keyC,
      scaleX: 1.18, scaleY: 1.18,
      duration: 750, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
  }

  private buildPlayer(): void {
    const T = this.tile
    const body = this.add.circle(0, 0, T * 0.31, C.player)
      .setStrokeStyle(Math.max(2, T * 0.05), C.playerLine)
    const eyeR = Math.max(1.5, T * 0.055)
    this.eyeL = this.add.circle(-T * 0.11, -T * 0.06, eyeR, C.playerLine)
    this.eyeR = this.add.circle(T * 0.11, -T * 0.06, eyeR, C.playerLine)
    this.playerC = this.add.container(0, 0, [body, this.eyeL, this.eyeR]).setDepth(10)
  }

  private buildHud(): void {
    const W = this.scale.width
    const H = this.scale.height

    this.add.text(W / 2, 24, this.level.name, {
      fontSize: '17px', color: C.ink, fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.hudKeyG = this.add.graphics().setDepth(100).setScrollFactor(0)
    this.hudKeyG.setPosition(W - 96, 25)
    this.drawHudKey(false)

    this.add.text(W - 60, 25, 'KEY', {
      fontSize: '12px', color: C.ink,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100)

    this.add.text(W / 2, H - 14, 'WASD / arrows / swipe to move  ·  R = restart  ·  ESC = menu', {
      fontSize: '11px', color: '#9aa88c',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100)
  }

  private drawHudKey(held: boolean): void {
    const g = this.hudKeyG
    const col = held ? C.gold : C.faint
    g.clear()
    g.fillStyle(col, 1)
    g.fillCircle(0, 0, 7)
    g.fillStyle(C.bg, 1)
    g.fillCircle(0, 0, 3)
    g.fillStyle(col, 1)
    g.fillRect(5, -2.5, 16, 5)
    g.fillRect(15, 2, 3, 6)
    g.fillRect(20, 2, 3, 5)
  }

  // ── input ──────────────────────────────────────────────────────────────────

  private bindSwipe(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeStart = { x: p.x, y: p.y }
    })
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart) return
      const dx = p.x - this.swipeStart.x
      const dy = p.y - this.swipeStart.y
      this.swipeStart = null
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return
      if (Math.abs(dx) > Math.abs(dy)) this.nextDir = dx > 0 ? 'right' : 'left'
      else this.nextDir = dy > 0 ? 'down' : 'up'
    })
  }

  private pollKeys(): void {
    if (this.keys.up) this.nextDir = 'up'
    else if (this.keys.down) this.nextDir = 'down'
    else if (this.keys.left) this.nextDir = 'left'
    else if (this.keys.right) this.nextDir = 'right'
  }

  // ── movement ───────────────────────────────────────────────────────────────

  private stepMovement(dt: number): void {
    let dir = this.dir

    if (dir === null) {
      const want = this.nextDir
      if (want !== null) {
        const v = DIR_VEC[want]
        if (this.canEnter(this.col + v.dc, this.row + v.dr)) {
          this.dir = want
          this.nextDir = null
          this.t = 0
        }
      }
      return
    }

    // Mid-tile reversal: anchor flips to the tile ahead and progress mirrors,
    // so turning back is instant instead of waiting for the next tile centre.
    const buffered = this.nextDir
    if (buffered !== null && buffered === opposite(dir)) {
      const v = DIR_VEC[dir]
      this.col += v.dc
      this.row += v.dr
      this.t = 1 - this.t
      dir = buffered
      this.nextDir = null
    }

    this.t += TILES_PER_SEC * dt

    while (this.t >= 1 && dir !== null) {
      const v = DIR_VEC[dir]
      this.col += v.dc
      this.row += v.dr
      this.t -= 1

      this.onEnterTile(this.col, this.row)
      if (this.completed) {
        this.dir = null
        this.t = 0
        return
      }

      const buf = this.nextDir
      if (buf !== null) {
        const bv = DIR_VEC[buf]
        if (this.canEnter(this.col + bv.dc, this.row + bv.dr)) {
          dir = buf
          this.nextDir = null
        }
      }

      const cv = DIR_VEC[dir]
      if (!this.canEnter(this.col + cv.dc, this.row + cv.dr)) {
        dir = null
        this.t = 0
      }
    }

    this.dir = dir
  }

  private onEnterTile(col: number, row: number): void {
    const k = posKey({ col, row })
    if (!this.hasKey && this.keyPos && k === posKey(this.keyPos)) this.collectKey()
    if (this.exitPos && k === posKey(this.exitPos) && this.level.mission.requireExit) {
      this.completeLevel()
    }
  }

  private renderPlayer(): void {
    const c = this.tileCenter(this.col, this.row)
    let x = c.x
    let y = c.y
    if (this.dir !== null) {
      const v = DIR_VEC[this.dir]
      x += v.dc * this.tile * this.t
      y += v.dr * this.tile * this.t
    }
    this.playerC.setPosition(x, y)

    // Eyes lean the way we're travelling.
    const T = this.tile
    const v = this.dir ? DIR_VEC[this.dir] : { dc: 0, dr: 0 }
    const ox = v.dc * T * 0.05
    const oy = v.dr * T * 0.05
    this.eyeL.setPosition(-T * 0.11 + ox, -T * 0.06 + oy)
    this.eyeR.setPosition(T * 0.11 + ox, -T * 0.06 + oy)
  }

  // ── events ─────────────────────────────────────────────────────────────────

  private collectKey(): void {
    if (!this.keyPos) return
    this.hasKey = true
    const { x, y } = this.tileCenter(this.keyPos.col, this.keyPos.row)

    this.vfx.burst(x, y, C.gold, 10)
    this.vfx.floatingText(x, y, 'KEY!', '#c9a227', '18px')
    this.keyC?.destroy()
    this.keyC = null
    this.drawHudKey(true)
    this.openGate()
  }

  private openGate(): void {
    if (!this.gatePos || !this.gateC) return
    // Unblock immediately so the opening animation never eats an input.
    this.gateLocked = false

    const { x, y } = this.tileCenter(this.gatePos.col, this.gatePos.row)
    this.vfx.burst(x, y, C.wood, 8)
    this.vfx.floatingText(x, y - this.tile * 0.3, 'The gate opens', '#7d5430', '14px')

    const gate = this.gateC
    this.gateC = null
    this.tweens.add({
      targets: gate,
      scaleX: 0.08, alpha: 0,
      duration: 420, ease: 'Back.In',
      onComplete: () => gate.destroy(),
    })
  }

  private completeLevel(): void {
    if (this.completed) return
    this.completed = true
    this.dir = null
    this.nextDir = null

    const W = this.scale.width
    const H = this.scale.height
    const pos = this.exitPos ? this.tileCenter(this.exitPos.col, this.exitPos.row) : { x: W / 2, y: H / 2 }

    this.vfx.burst(pos.x, pos.y, C.mint, 16)
    this.vfx.screenShake(4, 250)

    this.add.rectangle(W / 2, H / 2, 330, 190, 0xfffdf5, 0.97)
      .setStrokeStyle(2, C.mint).setDepth(500).setScrollFactor(0)

    this.add.text(W / 2, H / 2 - 52, 'GARDEN REACHED', {
      fontSize: '24px', color: '#4a7a5e', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    this.add.text(W / 2, H / 2 - 14, `${this.elapsed.toFixed(1)} seconds`, {
      fontSize: '16px', color: C.ink,
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    const btn = this.add.text(W / 2, H / 2 + 42, 'Play Again', {
      fontSize: '16px', color: '#ffffff', backgroundColor: '#5a9d4a',
      padding: { x: 22, y: 10 },
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => btn.setAlpha(0.85))
    btn.on('pointerout',  () => btn.setAlpha(1))
    btn.on('pointerup',   () => this.scene.restart())
  }

  // ── loop ───────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this.overlay.update()
    if (this.completed) return

    this.elapsed = (this.time.now - this.startTime) / 1000
    // Cap dt so a backgrounded tab cannot warp the player across the maze.
    const dt = Math.min(delta / 1000, 0.05)

    this.pollKeys()
    this.stepMovement(dt)
    this.renderPlayer()
  }
}
