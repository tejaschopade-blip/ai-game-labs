import Phaser from 'phaser'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { VFXManager } from '../../src/systems/VFXManager'

// ── Types ────────────────────────────────────────────────────────────────────

enum Dir { Right = 0, Down = 1, Left = 2, Up = 3 }
enum Mirror { Slash = 0, Backslash = 1 }  // Slash = /   Backslash = \

interface Cell { col: number; row: number }

interface LaserLevel {
  emitter: Cell & { dir: Dir }
  target: Cell
  walls: Cell[]
  mirrors: Array<Cell & { startType: Mirror }>
}

// ── Reflection table ─────────────────────────────────────────────────────────
// Slash (/)      R→U  D→L  L→D  U→R
// Backslash (\)  R→D  D→R  L→U  U→L
const REFLECT: Record<Mirror, Record<Dir, Dir>> = {
  [Mirror.Slash]:     { [Dir.Right]: Dir.Up,   [Dir.Down]: Dir.Left,  [Dir.Left]: Dir.Down, [Dir.Up]: Dir.Right },
  [Mirror.Backslash]: { [Dir.Right]: Dir.Down, [Dir.Down]: Dir.Right, [Dir.Left]: Dir.Up,   [Dir.Up]: Dir.Left  },
}

const DIR_DELTA: Record<Dir, Cell> = {
  [Dir.Right]: { col: 1,  row: 0  },
  [Dir.Down]:  { col: 0,  row: 1  },
  [Dir.Left]:  { col: -1, row: 0  },
  [Dir.Up]:    { col: 0,  row: -1 },
}

// ── Level data ───────────────────────────────────────────────────────────────

const LEVELS: LaserLevel[] = [
  // Level 1 — one mirror, learn deflection (start: \, need: /)
  {
    emitter: { col: 0, row: 4, dir: Dir.Right },
    target:  { col: 4, row: 0 },
    walls:   [],
    mirrors: [{ col: 4, row: 4, startType: Mirror.Backslash }],
  },
  // Level 2 — two mirrors, both need rotating
  {
    emitter: { col: 0, row: 1, dir: Dir.Right },
    target:  { col: 7, row: 5 },
    walls:   [],
    mirrors: [
      { col: 2, row: 1, startType: Mirror.Slash },
      { col: 2, row: 5, startType: Mirror.Slash },
    ],
  },
  // Level 3 — walls block naive path
  {
    emitter: { col: 0, row: 4, dir: Dir.Right },
    target:  { col: 7, row: 2 },
    walls:   [{ col: 5, row: 4 }, { col: 3, row: 0 }],
    mirrors: [
      { col: 3, row: 4, startType: Mirror.Backslash },
      { col: 3, row: 2, startType: Mirror.Backslash },
    ],
  },
  // Level 4 — four mirrors, S-shaped path
  {
    emitter: { col: 0, row: 3, dir: Dir.Right },
    target:  { col: 7, row: 1 },
    walls:   [],
    mirrors: [
      { col: 2, row: 3, startType: Mirror.Slash },
      { col: 2, row: 6, startType: Mirror.Slash },
      { col: 5, row: 6, startType: Mirror.Backslash },
      { col: 5, row: 1, startType: Mirror.Backslash },
    ],
  },
  // Level 5 — combined: two mirrors start correct, two need rotating
  {
    emitter: { col: 0, row: 6, dir: Dir.Right },
    target:  { col: 7, row: 7 },
    walls:   [{ col: 4, row: 6 }, { col: 2, row: 0 }],
    mirrors: [
      { col: 2, row: 6, startType: Mirror.Slash },      // already correct
      { col: 2, row: 3, startType: Mirror.Backslash },  // needs → Slash
      { col: 6, row: 3, startType: Mirror.Slash },      // needs → Backslash
      { col: 6, row: 7, startType: Mirror.Backslash },  // already correct
    ],
  },
]

// ── Laser path calculation ────────────────────────────────────────────────────

function calcPath(
  level: LaserLevel,
  mirrorTypes: Mirror[],
  gridSize: number,
): Array<Cell & { isTarget: boolean }> {
  const path: Array<Cell & { isTarget: boolean }> = []
  const visited = new Set<string>()

  let { col, row, dir } = level.emitter
  const startDelta = DIR_DELTA[dir]
  col += startDelta.col
  row += startDelta.row

  while (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
    const key = `${col},${row},${dir}`
    if (visited.has(key)) break  // loop guard
    visited.add(key)

    const isTarget = col === level.target.col && row === level.target.row
    path.push({ col, row, isTarget })
    if (isTarget) break
    if (level.walls.some(w => w.col === col && w.row === row)) break

    const mIdx = level.mirrors.findIndex(m => m.col === col && m.row === row)
    if (mIdx >= 0) dir = REFLECT[mirrorTypes[mIdx]][dir]

    const d = DIR_DELTA[dir]
    col += d.col
    row += d.row
  }

  return path
}

// ── Scene ────────────────────────────────────────────────────────────────────

const GRID = 8
const PROTO_NAME = '003-laser-mirrors'

export class LaserMirrorScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager
  private gfx!: Phaser.GameObjects.Graphics
  private levelIndex = 0
  private mirrorTypes: Mirror[] = []
  private won = false
  private cellSize = 0
  private originX = 0
  private originY = 0

  constructor() { super({ key: 'LaserMirrorScene' }) }

  create(): void {
    this.won = false
    this.overlay = new DebugOverlay(this, PROTO_NAME)
    this.vfx = new VFXManager(this)
    this.gfx = this.add.graphics()

    this.overlay.addWatch('Level',   () => `${this.levelIndex + 1} / ${LEVELS.length}`)
    this.overlay.addWatch('Status',  () => this.won ? 'solved ✓' : 'active')
    this.overlay.addWatch('Mirrors', () =>
      this.mirrorTypes.map(m => m === Mirror.Slash ? '/' : '\\').join(' ')
    )

    this.setupLayout()
    this.loadLevel()
    this.scale.on('resize', () => { this.setupLayout(); this.redraw() })
  }

  private setupLayout(): void {
    const padding = 80
    const available = Math.min(this.scale.width, this.scale.height) - padding * 2
    this.cellSize = Math.floor(available / GRID)
    this.originX = Math.floor((this.scale.width  - this.cellSize * GRID) / 2)
    this.originY = Math.floor((this.scale.height - this.cellSize * GRID) / 2)
  }

  private loadLevel(): void {
    this.won = false
    this.mirrorTypes = LEVELS[this.levelIndex].mirrors.map(m => m.startType)
    this.children.list.filter(c => (c as Phaser.GameObjects.GameObject & { getData: (k: string) => unknown }).getData('ui')).forEach(c => c.destroy())
    this.addUI()
    this.redraw()
    this.vfx.fadeTransition(300)
  }

  private addUI(): void {
    const tag = (obj: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject => {
      (obj as Phaser.GameObjects.GameObject & { setData: (k: string, v: unknown) => void }).setData('ui', true)
      return obj
    }

    tag(this.add.text(this.scale.width / 2, 18, 'Laser Lab', {
      fontSize: '18px', color: '#aaaacc', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100))

    tag(this.add.text(this.scale.width / 2, 40, `Level ${this.levelIndex + 1} / ${LEVELS.length}`, {
      fontSize: '13px', color: '#666688',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100))

    tag(this.add.text(8, this.scale.height - 20, 'Click mirror to rotate  ·  R = restart level', {
      fontSize: '11px', color: '#444466',
    }).setScrollFactor(0).setDepth(100))

    const level = LEVELS[this.levelIndex]
    level.mirrors.forEach((_m, i) => {
      const { px, py } = this.cellToPixel(level.mirrors[i].col, level.mirrors[i].row)
      const zone = this.add.zone(px, py, this.cellSize, this.cellSize)
        .setInteractive()
        .setDepth(50)
      ;(zone as Phaser.GameObjects.Zone & { setData: (k: string, v: unknown) => void }).setData('ui', true)
      zone.on('pointerdown', () => this.onMirrorClick(i))
    })
  }

  private onMirrorClick(index: number): void {
    if (this.won) return
    this.mirrorTypes[index] = this.mirrorTypes[index] === Mirror.Slash ? Mirror.Backslash : Mirror.Slash
    this.redraw()

    const level = LEVELS[this.levelIndex]
    const { px, py } = this.cellToPixel(level.mirrors[index].col, level.mirrors[index].row)
    this.vfx.floatingText(px, py - this.cellSize / 2,
      this.mirrorTypes[index] === Mirror.Slash ? '/' : '\\', '#aaaaff', '16px')
  }

  private redraw(): void {
    this.gfx.clear()
    const level = LEVELS[this.levelIndex]

    this.drawGrid()
    this.drawWalls(level)
    this.drawEmitter(level)
    this.drawTarget(level, false)
    this.drawMirrors(level)

    const path = calcPath(level, this.mirrorTypes, GRID)
    this.drawLaser(path)

    if (path.some(c => c.isTarget) && !this.won) this.onWin()
  }

  private drawGrid(): void {
    const g = this.gfx
    g.lineStyle(1, 0x222233, 1)
    for (let r = 0; r <= GRID; r++) {
      const y = this.originY + r * this.cellSize
      g.lineBetween(this.originX, y, this.originX + GRID * this.cellSize, y)
    }
    for (let c = 0; c <= GRID; c++) {
      const x = this.originX + c * this.cellSize
      g.lineBetween(x, this.originY, x, this.originY + GRID * this.cellSize)
    }
    g.lineStyle(2, 0x333355, 1)
    g.strokeRect(this.originX, this.originY, GRID * this.cellSize, GRID * this.cellSize)
  }

  private drawWalls(level: LaserLevel): void {
    const g = this.gfx
    g.fillStyle(0x555566, 1)
    for (const w of level.walls) {
      const { px, py } = this.cellToPixel(w.col, w.row)
      const pad = 2
      g.fillRect(px - this.cellSize / 2 + pad, py - this.cellSize / 2 + pad,
        this.cellSize - pad * 2, this.cellSize - pad * 2)
    }
  }

  private drawEmitter(level: LaserLevel): void {
    const g = this.gfx
    const { px, py } = this.cellToPixel(level.emitter.col, level.emitter.row)
    const r = this.cellSize * 0.3
    g.fillStyle(0xffaa00, 1)
    g.fillCircle(px, py, r)
    g.lineStyle(2, 0xffdd88, 1)
    g.strokeCircle(px, py, r)
    const d = DIR_DELTA[level.emitter.dir]
    g.lineBetween(px, py, px + d.col * r * 1.5, py + d.row * r * 1.5)
  }

  private drawTarget(level: LaserLevel, hit: boolean): void {
    const g = this.gfx
    const { px, py } = this.cellToPixel(level.target.col, level.target.row)
    const r = this.cellSize * 0.3
    g.fillStyle(hit ? 0x00ff88 : 0x224433, 1)
    g.fillCircle(px, py, r)
    g.lineStyle(3, hit ? 0x00ff88 : 0x336655, 1)
    g.strokeCircle(px, py, r)
    g.fillStyle(hit ? 0xffffff : 0x00cc66, 1)
    g.fillCircle(px, py, r * 0.35)
  }

  private drawMirrors(level: LaserLevel): void {
    const g = this.gfx
    const half = this.cellSize / 2
    const pad  = this.cellSize * 0.15
    level.mirrors.forEach((m, i) => {
      const { px, py } = this.cellToPixel(m.col, m.row)
      const type = this.mirrorTypes[i]
      g.fillStyle(0x1a1a3a, 0.8)
      g.fillRect(px - half + 2, py - half + 2, this.cellSize - 4, this.cellSize - 4)
      g.lineStyle(3, 0x88aaff, 1)
      if (type === Mirror.Slash) {
        g.lineBetween(px - half + pad, py + half - pad, px + half - pad, py - half + pad)
      } else {
        g.lineBetween(px - half + pad, py - half + pad, px + half - pad, py + half - pad)
      }
      g.fillStyle(0x4455aa, 1)
      g.fillCircle(px + half - 5, py - half + 5, 3)
    })
  }

  private drawLaser(path: Array<Cell & { isTarget: boolean }>): void {
    if (path.length === 0) return
    const g = this.gfx
    const level = LEVELS[this.levelIndex]
    const { px: sx, py: sy } = this.cellToPixel(level.emitter.col, level.emitter.row)
    const pts = [{ x: sx, y: sy }, ...path.map(c => this.cellToPixel(c.col, c.row)).map(p => ({ x: p.px, y: p.py }))]

    g.lineStyle(8, 0xff4400, 0.15)
    for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y)
    g.lineStyle(2, 0xff6600, 1)
    for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y)
    g.lineStyle(1, 0xffddaa, 0.8)
    for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y)
  }

  private onWin(): void {
    this.won = true
    const level = LEVELS[this.levelIndex]
    const { px, py } = this.cellToPixel(level.target.col, level.target.row)
    this.vfx.burst(px, py, 0x00ff88, 16)
    this.vfx.screenShake(6, 300)

    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const isLast = this.levelIndex >= LEVELS.length - 1

    const tag = (obj: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject => {
      (obj as Phaser.GameObjects.GameObject & { setData: (k: string, v: unknown) => void }).setData('ui', true)
      return obj
    }

    tag(this.add.rectangle(cx, cy, 320, 200, 0x111122, 0.95)
      .setStrokeStyle(2, 0x333366).setDepth(500).setScrollFactor(0))

    tag(this.add.text(cx, cy - 60, 'LEVEL COMPLETE', {
      fontSize: '26px', color: '#00ff88', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0))

    if (!isLast) {
      const nextBtn = this.add.text(cx, cy + 10, '> Next Level', {
        fontSize: '18px', color: '#ffffff', backgroundColor: '#224488',
        padding: { x: 20, y: 10 },
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setInteractive({ useHandCursor: true })
      tag(nextBtn)
      nextBtn.on('pointerdown', () => {
        this.levelIndex++
        this.children.list
          .filter(c => (c as Phaser.GameObjects.GameObject & { getData: (k: string) => unknown }).getData('ui'))
          .forEach(c => c.destroy())
        this.loadLevel()
      })
      nextBtn.on('pointerover', () => nextBtn.setAlpha(0.8))
      nextBtn.on('pointerout',  () => nextBtn.setAlpha(1))
    } else {
      tag(this.add.text(cx, cy + 10, '** All levels complete! **', {
        fontSize: '18px', color: '#ffaa00',
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0))
    }

    const restartBtn = this.add.text(cx, cy + 60, 'Restart Level', {
      fontSize: '14px', color: '#888888',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setInteractive({ useHandCursor: true })
    tag(restartBtn)
    restartBtn.on('pointerdown', () => {
      this.children.list
        .filter(c => (c as Phaser.GameObjects.GameObject & { getData: (k: string) => unknown }).getData('ui'))
        .forEach(c => c.destroy())
      this.loadLevel()
    })
  }

  private cellToPixel(col: number, row: number): { px: number; py: number } {
    return {
      px: this.originX + col * this.cellSize + this.cellSize / 2,
      py: this.originY + row * this.cellSize + this.cellSize / 2,
    }
  }

  update(): void {
    this.overlay.update()
  }
}
