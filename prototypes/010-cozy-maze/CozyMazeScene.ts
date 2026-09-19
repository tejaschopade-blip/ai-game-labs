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
  stone:       0x9aa08f,
  stoneDark:   0x777d6e,
  amber:       0xf0a93c,
  amberLight:  0xfff3b0,
  vine:        0x4f9b6a,
  vineDark:    0x3a7550,
  gem:         0xe0a33c,
  gemLight:    0xf7d98a,
  bloomPink:   0xf2c6e0,
  bloomCream:  0xfff2b0,
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

  private switchOn = false
  private rgateLocked = true
  private hasTreasure = false
  private hiddenFound = false
  private tookShortRoute = false

  private keyPos: GridPos | null = null
  private gatePos: GridPos | null = null
  private exitPos: GridPos | null = null
  private switchPos: GridPos | null = null
  private rgatePos: GridPos | null = null
  private treasurePos: GridPos | null = null
  private hiddenPos: GridPos | null = null

  private playerC!: Phaser.GameObjects.Container
  private eyeL!: Phaser.GameObjects.Arc
  private eyeR!: Phaser.GameObjects.Arc
  private keyC: Phaser.GameObjects.Container | null = null
  private gateC: Phaser.GameObjects.Container | null = null
  private switchG: Phaser.GameObjects.Graphics | null = null
  private rgateC: Phaser.GameObjects.Container | null = null
  private treasureC: Phaser.GameObjects.Container | null = null
  private hiddenC: Phaser.GameObjects.Container | null = null
  private hudKeyG!: Phaser.GameObjects.Graphics
  private hudGemG!: Phaser.GameObjects.Graphics

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
    this.switchOn = false
    this.rgateLocked = true
    this.hasTreasure = false
    this.hiddenFound = false
    this.tookShortRoute = false

    for (const o of this.level.objects) {
      if (o.kind === 'key')        this.keyPos      = o.pos
      if (o.kind === 'gate')       this.gatePos     = o.pos
      if (o.kind === 'exit')       this.exitPos     = o.pos
      if (o.kind === 'switch')     this.switchPos   = o.pos
      if (o.kind === 'remoteGate') this.rgatePos    = o.pos
      if (o.kind === 'treasure')   this.treasurePos = o.pos
      if (o.kind === 'hidden')     this.hiddenPos   = o.pos
    }

    this.tile = Math.floor(Math.min((W - 48) / this.level.width, (H - 108) / this.level.height))
    this.originX = Math.floor((W - this.level.width * this.tile) / 2)
    this.originY = 64 + Math.floor((H - 64 - 28 - this.level.height * this.tile) / 2)

    this.vfx = new VFXManager(this)
    this.keys = new InputManager(this)

    this.add.rectangle(W / 2, H / 2, W, H, C.bg).setDepth(0)
    this.buildMaze()
    this.buildExit()
    this.buildSwitch()
    this.buildRemoteGate()
    this.buildTreasure()
    this.buildHidden()
    this.buildGate()
    this.buildKey()
    this.buildPlayer()
    this.buildHud()
    this.bindSwipe()

    this.overlay = new DebugOverlay(this, '010-cozy-maze')
    this.overlay.addWatch('Tile',     () => `(${this.col}, ${this.row})`)
    this.overlay.addWatch('Dir',      () => this.dir ?? '-')
    this.overlay.addWatch('Key',      () => (this.hasKey ? 'yes' : 'no'))
    this.overlay.addWatch('Switch',   () => (this.switchOn ? 'on' : 'off'))
    this.overlay.addWatch('Treasure', () => (this.hasTreasure ? 'yes' : 'no'))
    this.overlay.addWatch('Time',     () => `${this.elapsed.toFixed(1)}s`)

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
    if (this.gateLocked  && this.gatePos  && k === posKey(this.gatePos))  return false
    if (this.rgateLocked && this.rgatePos && k === posKey(this.rgatePos)) return false
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

        this.drawHedge(g, x, y, c, r, leafR)
      }
    }
  }

  // Shared so the hidden tile is pixel-identical to a real hedge.
  private drawHedge(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    c: number, r: number,
    leafR: number,
  ): void {
    const T = this.tile
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

  private buildSwitch(): void {
    if (!this.switchPos) return
    const { x, y } = this.tileCenter(this.switchPos.col, this.switchPos.row)

    this.switchG = this.add.graphics().setDepth(4)
    this.switchG.setPosition(x, y)
    this.drawSwitch(false)
  }

  private drawSwitch(on: boolean): void {
    const g = this.switchG
    if (!g) return
    const T = this.tile
    g.clear()
    // Sunken stone ring stays put; the plate inside is what moves.
    g.fillStyle(C.stoneDark, 1)
    g.fillCircle(0, 0, T * 0.34)
    g.fillStyle(on ? C.amber : C.stone, 1)
    g.fillCircle(0, on ? T * 0.04 : 0, T * 0.26)
    g.fillStyle(on ? C.amberLight : 0xb6bcab, 1)
    g.fillCircle(0, on ? T * 0.02 : -T * 0.03, T * 0.15)
  }

  private buildRemoteGate(): void {
    if (!this.rgatePos) return
    const T = this.tile
    const { x, y } = this.tileCenter(this.rgatePos.col, this.rgatePos.row)

    // Vines, not wood — visually distinct from the key gate so the player
    // does not expect the key to open it.
    const g = this.add.graphics()
    for (let i = 0; i < 3; i++) {
      const vx = -T * 0.30 + i * T * 0.30
      g.fillStyle(C.vine, 1)
      g.fillRoundedRect(vx - T * 0.055, -T * 0.42, T * 0.11, T * 0.84, T * 0.055)
      g.fillStyle(C.vineDark, 1)
      g.fillCircle(vx, -T * 0.22 + i * T * 0.06, T * 0.085)
      g.fillCircle(vx, T * 0.16 - i * T * 0.05, T * 0.075)
    }
    this.rgateC = this.add.container(x, y, [g]).setDepth(5)
  }

  private buildTreasure(): void {
    if (!this.treasurePos) return
    const T = this.tile
    const { x, y } = this.tileCenter(this.treasurePos.col, this.treasurePos.row)

    const g = this.add.graphics()
    g.fillStyle(C.gem, 1)
    g.fillTriangle(0, -T * 0.24, -T * 0.21, -T * 0.02, T * 0.21, -T * 0.02)
    g.fillTriangle(-T * 0.21, -T * 0.02, T * 0.21, -T * 0.02, 0, T * 0.26)
    g.fillStyle(C.gemLight, 1)
    g.fillTriangle(0, -T * 0.24, -T * 0.21, -T * 0.02, 0, -T * 0.02)

    this.treasureC = this.add.container(x, y, [g]).setDepth(6)
    this.tweens.add({
      targets: this.treasureC,
      y: y - T * 0.12,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
  }

  private buildHidden(): void {
    if (!this.hiddenPos) return
    const T = this.tile
    const col = this.hiddenPos.col
    const row = this.hiddenPos.row
    const x = this.originX + col * T
    const y = this.originY + row * T

    // parseLevel already removed this tile from walls, so the base layer drew
    // path here. Overlay a real hedge plus a clue the player can notice.
    const g = this.add.graphics()
    this.drawHedge(g, 0, 0, col, row, Math.max(1, T * 0.055))

    g.fillStyle(C.bloomPink, 1)
    g.fillCircle(T * 0.30, T * 0.34, T * 0.065)
    g.fillCircle(T * 0.62, T * 0.58, T * 0.055)
    g.fillStyle(C.bloomCream, 1)
    g.fillCircle(T * 0.46, T * 0.24, T * 0.05)
    g.fillCircle(T * 0.70, T * 0.36, T * 0.042)

    const sparkle = this.add.circle(T * 0.5, T * 0.5, T * 0.07, C.bloomCream, 0.55)
    this.tweens.add({
      targets: sparkle,
      alpha: 0.12, scaleX: 1.5, scaleY: 1.5,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    this.hiddenC = this.add.container(x, y, [g, sparkle]).setDepth(3)
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
    this.hudKeyG.setPosition(W - 186, 25)
    this.drawHudKey(false)

    this.add.text(W - 150, 25, 'KEY', {
      fontSize: '12px', color: C.ink,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100)

    this.hudGemG = this.add.graphics().setDepth(100).setScrollFactor(0)
    this.hudGemG.setPosition(W - 92, 25)
    this.drawHudGem(false)

    this.add.text(W - 74, 25, 'GEM', {
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

  private drawHudGem(held: boolean): void {
    const g = this.hudGemG
    g.clear()
    g.fillStyle(held ? C.gem : C.faint, 1)
    g.fillTriangle(0, -9, -8, -1, 8, -1)
    g.fillTriangle(-8, -1, 8, -1, 0, 10)
    if (held) {
      g.fillStyle(C.gemLight, 1)
      g.fillTriangle(0, -9, -8, -1, 0, -1)
    }
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
    if (!this.hiddenFound && this.hiddenPos && k === posKey(this.hiddenPos)) this.revealHidden()
    if (!this.switchOn && this.switchPos && k === posKey(this.switchPos)) this.activateSwitch()
    if (!this.hasTreasure && this.treasurePos && k === posKey(this.treasurePos)) this.collectTreasure()
    // Actual traversal, not switch use — a player can flip the switch and still go north.
    if (this.rgatePos && k === posKey(this.rgatePos)) this.tookShortRoute = true
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

  private revealHidden(): void {
    if (!this.hiddenPos || !this.hiddenC) return
    this.hiddenFound = true
    const { x, y } = this.tileCenter(this.hiddenPos.col, this.hiddenPos.row)

    this.vfx.burst(x, y, C.bloomPink, 10)
    this.vfx.floatingText(x, y, 'A hidden path!', '#c98fb0', '16px')

    const hedge = this.hiddenC
    this.hiddenC = null
    this.tweens.add({
      targets: hedge,
      alpha: 0,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => hedge.destroy(),
    })
  }

  private collectTreasure(): void {
    if (!this.treasurePos) return
    this.hasTreasure = true
    const { x, y } = this.tileCenter(this.treasurePos.col, this.treasurePos.row)

    this.vfx.burst(x, y, C.gem, 14)
    this.vfx.floatingText(x, y, 'Treasure!', '#e0a33c', '18px')
    this.vfx.screenShake(3, 180)
    this.treasureC?.destroy()
    this.treasureC = null
    this.drawHudGem(true)
  }

  // switch -> burst -> travelling pulse -> remote gate opens -> falling leaves.
  // The whole maze is on screen, so the player sees the distant effect happen.
  private activateSwitch(): void {
    if (!this.switchPos) return
    this.switchOn = true
    const from = this.tileCenter(this.switchPos.col, this.switchPos.row)

    this.drawSwitch(true)
    if (this.switchG) this.vfx.scalePunch(this.switchG, 1.35, 220)
    this.vfx.burst(from.x, from.y, C.amber, 10)

    if (!this.rgatePos) return
    const to = this.tileCenter(this.rgatePos.col, this.rgatePos.row)
    this.travellingPulse(from, to, () => this.openRemoteGate())
  }

  private travellingPulse(
    from: { x: number; y: number },
    to: { x: number; y: number },
    onArrive: () => void,
  ): void {
    const T = this.tile
    const halo = this.add.circle(from.x, from.y, T * 0.30, C.amber, 0.45).setDepth(59)
    const dot  = this.add.circle(from.x, from.y, T * 0.15, C.amberLight, 1).setDepth(60)

    this.tweens.add({
      targets: [halo, dot],
      x: to.x, y: to.y,
      duration: 520, ease: 'Sine.InOut',
      onComplete: () => { halo.destroy(); dot.destroy(); onArrive() },
    })
    this.tweens.add({
      targets: halo,
      scaleX: 1.7, scaleY: 1.7, alpha: 0,
      duration: 520, ease: 'Quad.Out',
    })
  }

  private openRemoteGate(): void {
    if (!this.rgatePos || !this.rgateC) return
    // Unblock as the animation starts so the opening never eats an input.
    this.rgateLocked = false

    const { x, y } = this.tileCenter(this.rgatePos.col, this.rgatePos.row)
    this.vfx.burst(x, y, C.vine, 10)
    this.fallingLeaves(x, y)

    const gate = this.rgateC
    this.rgateC = null
    this.tweens.add({
      targets: gate,
      scaleY: 0.05, alpha: 0,
      duration: 400, ease: 'Back.In',
      onComplete: () => gate.destroy(),
    })
  }

  private fallingLeaves(x: number, y: number, count = 5): void {
    const T = this.tile
    const tints = [0x8fc46a, 0xc9d97a, 0xe8c46a, 0x74b562, 0x9fd17e]
    for (let i = 0; i < count; i++) {
      const lx = x + (i - (count - 1) / 2) * T * 0.26
      const leaf = this.add
        .ellipse(lx, y - T * 0.35, T * 0.17, T * 0.10, tints[i % tints.length])
        .setDepth(58)
      leaf.setAngle(i * 37)
      this.tweens.add({
        targets: leaf,
        x: lx + (i % 2 === 0 ? 1 : -1) * T * 0.38,
        y: y + T * 1.05,
        angle: leaf.angle + 220,
        alpha: 0,
        duration: 880 + i * 90, ease: 'Sine.In',
        onComplete: () => leaf.destroy(),
      })
    }
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

    this.add.rectangle(W / 2, H / 2, 330, 234, 0xfffdf5, 0.97)
      .setStrokeStyle(2, C.mint).setDepth(500).setScrollFactor(0)

    this.add.text(W / 2, H / 2 - 74, 'GARDEN REACHED', {
      fontSize: '24px', color: '#4a7a5e', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    this.add.text(W / 2, H / 2 - 38, `${this.elapsed.toFixed(1)} seconds`, {
      fontSize: '16px', color: C.ink,
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    this.add.text(W / 2, H / 2 - 10,
      `Route: ${this.tookShortRoute ? 'short' : 'safe'}`, {
        fontSize: '14px', color: this.tookShortRoute ? '#c07a2a' : '#5a8a6a',
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    this.add.text(W / 2, H / 2 + 12,
      `Treasure: ${this.hasTreasure ? 'found' : 'missed'}`, {
        fontSize: '14px', color: this.hasTreasure ? '#c07a2a' : '#9aa88c',
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    const btn = this.add.text(W / 2, H / 2 + 60, 'Play Again', {
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
