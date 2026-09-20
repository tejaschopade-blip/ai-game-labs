import Phaser from 'phaser'
import { VFXManager } from '../../src/systems/VFXManager'
import { DebugOverlay } from '../../src/ui/DebugOverlay'

// ── Pure data types & functions (no Phaser) ───────────────────────────────────

type Cell = { x: number; y: number }

interface ShapeDef {
  cells: Cell[]
  color: number
  name: string
}

const SHAPES: ShapeDef[] = [
  { name: 'Single', color: 0x4488ff, cells: [{ x: 0, y: 0 }] },
  { name: '2H',     color: 0x44ccaa, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  { name: '2V',     color: 0xaa44ff, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }] },
  { name: '3H',     color: 0xff8844, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
  { name: 'L',      color: 0xff4488, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { name: 'Square', color: 0xffcc44, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
]

const GRID = 8

type Board = number[][]

function emptyBoard(): Board {
  return Array.from({ length: GRID }, () => new Array<number>(GRID).fill(0))
}

function canPlace(board: Board, shape: ShapeDef, col: number, row: number): boolean {
  return shape.cells.every(c => {
    const gc = col + c.x, gr = row + c.y
    return gc >= 0 && gc < GRID && gr >= 0 && gr < GRID && board[gr][gc] === 0
  })
}

function placeShape(board: Board, shape: ShapeDef, col: number, row: number): Board {
  const next = board.map(r => [...r])
  shape.cells.forEach(c => { next[row + c.y][col + c.x] = shape.color })
  return next
}

function findCompleteLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = []
  const cols: number[] = []
  for (let r = 0; r < GRID; r++) {
    if (board[r].every(v => v !== 0)) rows.push(r)
  }
  for (let c = 0; c < GRID; c++) {
    if (board.every(r => r[c] !== 0)) cols.push(c)
  }
  return { rows, cols }
}

function clearLines(board: Board, rows: number[], cols: number[]): Board {
  const next = board.map(r => [...r])
  rows.forEach(r => { for (let c = 0; c < GRID; c++) next[r][c] = 0 })
  cols.forEach(c => { for (let r = 0; r < GRID; r++) next[r][c] = 0 })
  return next
}

function lineScore(lineCount: number): number {
  if (lineCount === 0) return 0
  if (lineCount === 1) return 10
  if (lineCount === 2) return 25
  if (lineCount === 3) return 45
  return 70
}

function shapeFitsAnywhere(board: Board, shape: ShapeDef): boolean {
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (canPlace(board, shape, c, r)) return true
  return false
}

const SHAPE_POOL_SEQUENCE: number[][] = [
  [5, 0, 3],
  [3, 2, 5],
  [4, 3, 1],
  [1, 4, 0],
  [2, 5, 3],
]

function pickShapes(round: number): ShapeDef[] {
  const seq = SHAPE_POOL_SEQUENCE[round % SHAPE_POOL_SEQUENCE.length]
  return seq.map(i => SHAPES[i])
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export class BlockPlacementScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager
  private boardGfx!: Phaser.GameObjects.Graphics
  private previewGfx!: Phaser.GameObjects.Graphics
  private trayGfx!: Phaser.GameObjects.Graphics

  private board: Board = emptyBoard()
  private tray: (ShapeDef | null)[] = [null, null, null]
  private selectedSlot = -1
  private round = 0
  private score = 0
  private combo = 0
  private gameOver = false

  private cellSize = 0
  private originX = 0
  private originY = 0
  private trayY = 0

  private scoreLabel!: Phaser.GameObjects.Text
  private comboLabel!: Phaser.GameObjects.Text

  constructor() { super({ key: 'BlockPlacementScene' }) }

  create(): void {
    this.board = emptyBoard()
    this.round = 0
    this.score = 0
    this.combo = 0
    this.gameOver = false
    this.selectedSlot = -1

    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x0a0a14)

    this.vfx = new VFXManager(this)
    this.overlay = new DebugOverlay(this, '008-block-placement')
    this.overlay.addWatch('Score',    () => String(this.score))
    this.overlay.addWatch('Round',    () => String(this.round))
    this.overlay.addWatch('Combo',    () => String(this.combo))
    this.overlay.addWatch('Selected', () => this.selectedSlot >= 0 ? (this.tray[this.selectedSlot]?.name ?? 'none') : 'none')

    this.boardGfx   = this.add.graphics().setDepth(10)
    this.previewGfx = this.add.graphics().setDepth(20)
    this.trayGfx    = this.add.graphics().setDepth(10)

    this.setupLayout()
    this.createHUD()
    this.dealNewTray()
    this.setupInput()

    // `this.scale` is the GLOBAL ScaleManager, shared by every scene, so a
    // listener registered here outlives this scene unless it is removed. Since
    // per-prototype design sizes landed, entering a prototype with a different
    // design space fires setGameSize -> 'resize' on every stale listener, which
    // then runs this scene's layout code against a destroyed scene.
    const onResize = (): void => { this.setupLayout(); this.renderAll() }
    this.scale.on('resize', onResize)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize))
    this.vfx.fadeTransition(300)
  }

  private setupLayout(): void {
    const W = this.scale.width, H = this.scale.height
    this.cellSize = Math.floor(Math.min(W * 0.88, H * 0.68) / GRID)
    this.originX  = Math.floor((W - GRID * this.cellSize) / 2)
    this.originY  = 52
    this.trayY    = this.originY + GRID * this.cellSize + 18
  }

  // ── Tray management ──────────────────────────────────────────────────────────

  private dealNewTray(): void {
    const shapes = pickShapes(this.round)
    this.tray = [shapes[0], shapes[1], shapes[2]]
    this.round++
    this.selectedSlot = -1
    this.renderAll()
  }

  private allTrayEmpty(): boolean { return this.tray.every(s => s === null) }

  // ── Input ─────────────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.selectedSlot < 0 || this.gameOver) {
        this.previewGfx.clear()
        return
      }
      const gc = this.pixelToGrid(p.x, p.y)
      this.renderPreview(gc.col, gc.row)
    })

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return
      const traySlot = this.hitTestTray(p.x, p.y)
      if (traySlot >= 0 && this.tray[traySlot]) {
        this.selectedSlot = traySlot
        this.renderTray()
        return
      }
      if (this.selectedSlot >= 0) {
        const shape = this.tray[this.selectedSlot]
        if (!shape) return
        const gc = this.pixelToGrid(p.x, p.y)
        if (canPlace(this.board, shape, gc.col, gc.row)) {
          this.doPlace(shape, gc.col, gc.row)
        } else {
          this.cameras.main.shake(80, 0.004)
        }
      }
    })
  }

  private pixelToGrid(px: number, py: number): { col: number; row: number } {
    return {
      col: Math.floor((px - this.originX) / this.cellSize),
      row: Math.floor((py - this.originY) / this.cellSize),
    }
  }

  private hitTestTray(px: number, py: number): number {
    const W = this.scale.width
    const slotW = Math.min(120, W / 4)
    const spacing = slotW + 16
    for (let i = 0; i < 3; i++) {
      const cx = W / 2 + (i - 1) * spacing
      const cy = this.trayY + 40
      if (Math.abs(px - cx) < slotW / 2 && Math.abs(py - cy) < 55) return i
    }
    return -1
  }

  // ── Place logic ───────────────────────────────────────────────────────────────

  private doPlace(shape: ShapeDef, col: number, row: number): void {
    this.board = placeShape(this.board, shape, col, row)
    this.tray[this.selectedSlot] = null
    this.selectedSlot = -1
    this.score += 1
    this.previewGfx.clear()

    shape.cells.forEach(c => {
      const px = this.originX + (col + c.x) * this.cellSize + this.cellSize / 2
      const py = this.originY + (row + c.y) * this.cellSize + this.cellSize / 2
      this.vfx.burst(px, py, shape.color, 3)
    })

    const { rows, cols } = findCompleteLines(this.board)
    const lineCount = rows.length + cols.length

    if (lineCount > 0) {
      this.combo++
      const pts = lineScore(lineCount) * (this.combo > 1 ? this.combo : 1)
      this.score += pts
      this.animateClear(rows, cols, pts)
    } else {
      this.combo = 0
      this.renderBoard()
    }

    this.updateHUD()

    if (this.allTrayEmpty()) {
      this.time.delayedCall(lineCount > 0 ? 500 : 100, () => this.dealNewTray())
    } else {
      this.renderTray()
    }

    this.time.delayedCall(lineCount > 0 ? 600 : 200, () => this.checkGameOver())
  }

  // ── Line clear animation ──────────────────────────────────────────────────────

  private animateClear(rows: number[], cols: number[], pts: number): void {
    const lineCount = rows.length + cols.length
    const flashGfx = this.add.graphics().setDepth(30)

    const drawFlash = (alpha: number) => {
      flashGfx.clear()
      flashGfx.fillStyle(0xffffff, alpha)
      rows.forEach(r => {
        for (let c = 0; c < GRID; c++) {
          flashGfx.fillRect(
            this.originX + c * this.cellSize + 2,
            this.originY + r * this.cellSize + 2,
            this.cellSize - 4, this.cellSize - 4,
          )
        }
      })
      cols.forEach(col => {
        for (let r = 0; r < GRID; r++) {
          flashGfx.fillRect(
            this.originX + col * this.cellSize + 2,
            this.originY + r * this.cellSize + 2,
            this.cellSize - 4, this.cellSize - 4,
          )
        }
      })
    }

    drawFlash(0.9)

    rows.forEach(r => {
      const py = this.originY + r * this.cellSize + this.cellSize / 2
      this.vfx.burst(this.scale.width / 2, py, 0xffffff, lineCount > 2 ? 10 : 6)
    })
    cols.forEach(c => {
      const px = this.originX + c * this.cellSize + this.cellSize / 2
      this.vfx.burst(px, this.scale.height / 2, 0xffffff, lineCount > 2 ? 10 : 6)
    })

    if (lineCount >= 3) this.vfx.screenShake(6, 300)
    else if (lineCount >= 2) this.vfx.screenShake(3, 200)

    this.vfx.floatingText(
      this.scale.width / 2,
      this.originY + GRID * this.cellSize / 2,
      `+${pts}`,
      lineCount >= 3 ? '#ffcc44' : '#ffffff',
      lineCount >= 3 ? '24px' : '18px',
    )

    if (this.combo > 1) {
      this.vfx.floatingText(
        this.scale.width / 2,
        this.originY + GRID * this.cellSize / 2 + 30,
        `COMBO ×${this.combo}`,
        '#ff8844',
        '16px',
      )
    }

    const tweenTarget = { v: 0.9 }
    this.tweens.add({
      targets: tweenTarget,
      v: 0,
      duration: 320,
      ease: 'Quad.In',
      onUpdate: () => {
        drawFlash(tweenTarget.v)
      },
      onComplete: () => {
        flashGfx.destroy()
        this.board = clearLines(this.board, rows, cols)
        this.renderBoard()
      },
    })
  }

  // ── Game over ─────────────────────────────────────────────────────────────────

  private checkGameOver(): void {
    const available = this.tray.filter((s): s is ShapeDef => s !== null)
    if (available.length === 0) return
    const anyFit = available.some(s => shapeFitsAnywhere(this.board, s))
    if (!anyFit) this.showGameOver()
  }

  private showGameOver(): void {
    if (this.gameOver) return
    this.gameOver = true
    this.vfx.screenShake(10, 500)

    const cx = this.scale.width / 2, cy = this.scale.height / 2

    this.add.rectangle(cx, cy, 300, 200, 0x111122, 0.95)
      .setStrokeStyle(2, 0x333366).setDepth(500).setScrollFactor(0)

    this.add.text(cx, cy - 60, 'GAME OVER', {
      fontSize: '26px', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    this.add.text(cx, cy - 22, `Score: ${this.score}`, {
      fontSize: '20px', color: '#aaaacc',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)

    const btn = this.add.text(cx, cy + 30, 'Play Again', {
      fontSize: '17px', color: '#ffffff', backgroundColor: '#224488',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.scene.restart())
    btn.on('pointerover', () => btn.setAlpha(0.8))
    btn.on('pointerout',  () => btn.setAlpha(1))
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────

  private renderAll(): void {
    this.renderBoard()
    this.renderTray()
  }

  private renderBoard(): void {
    const g = this.boardGfx
    g.clear()
    const cs = this.cellSize, ox = this.originX, oy = this.originY

    g.fillStyle(0x0d0d1a, 1)
    g.fillRect(ox - 2, oy - 2, GRID * cs + 4, GRID * cs + 4)

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = ox + c * cs, y = oy + r * cs
        const val = this.board[r][c]

        if (val !== 0) {
          g.fillStyle(val, 1)
          g.fillRect(x + 2, y + 2, cs - 4, cs - 4)
          g.fillStyle(0xffffff, 0.12)
          g.fillRect(x + 2, y + 2, cs - 4, 4)
        } else {
          g.fillStyle(0x111128, 1)
          g.fillRect(x + 1, y + 1, cs - 2, cs - 2)
          g.fillStyle(0x222244, 1)
          g.fillCircle(x + cs / 2, y + cs / 2, 2)
        }
      }
    }

    g.lineStyle(2, 0x222244, 1)
    g.strokeRect(ox - 2, oy - 2, GRID * cs + 4, GRID * cs + 4)
  }

  private renderPreview(col: number, row: number): void {
    this.previewGfx.clear()
    const shape = this.tray[this.selectedSlot]
    if (!shape) return
    const valid = canPlace(this.board, shape, col, row)
    const cs = this.cellSize, ox = this.originX, oy = this.originY

    shape.cells.forEach(c => {
      const gc = col + c.x, gr = row + c.y
      if (gc < 0 || gc >= GRID || gr < 0 || gr >= GRID) return
      const x = ox + gc * cs, y = oy + gr * cs
      if (valid) {
        this.previewGfx.fillStyle(shape.color, 0.5)
        this.previewGfx.fillRect(x + 2, y + 2, cs - 4, cs - 4)
        this.previewGfx.lineStyle(2, shape.color, 0.9)
        this.previewGfx.strokeRect(x + 2, y + 2, cs - 4, cs - 4)
      } else {
        this.previewGfx.fillStyle(0xff3333, 0.3)
        this.previewGfx.fillRect(x + 2, y + 2, cs - 4, cs - 4)
      }
    })
  }

  private renderTray(): void {
    const g = this.trayGfx
    g.clear()
    const W = this.scale.width
    const slotW = Math.min(110, W / 4)
    const spacing = slotW + 20
    const miniCell = Math.min(18, Math.floor(slotW / 4))

    for (let i = 0; i < 3; i++) {
      const cx = W / 2 + (i - 1) * spacing
      const cy = this.trayY + 40
      const shape = this.tray[i]
      const isSelected = i === this.selectedSlot

      g.fillStyle(isSelected ? 0x1a2040 : 0x111122, 1)
      g.fillRoundedRect(cx - slotW / 2, cy - 48, slotW, 90, 8)
      g.lineStyle(isSelected ? 2 : 1, isSelected ? 0x4488ff : 0x222244, 1)
      g.strokeRoundedRect(cx - slotW / 2, cy - 48, slotW, 90, 8)

      if (!shape) continue

      const maxX = Math.max(...shape.cells.map(c => c.x))
      const maxY = Math.max(...shape.cells.map(c => c.y))
      const shapeW = (maxX + 1) * miniCell
      const shapeH = (maxY + 1) * miniCell
      const startX = cx - shapeW / 2
      const startY = cy - shapeH / 2 + 4

      shape.cells.forEach(c => {
        const x = startX + c.x * miniCell
        const y = startY + c.y * miniCell
        g.fillStyle(shape.color, 1)
        g.fillRect(x + 1, y + 1, miniCell - 2, miniCell - 2)
        g.fillStyle(0xffffff, 0.15)
        g.fillRect(x + 1, y + 1, miniCell - 2, 3)
      })
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────

  private createHUD(): void {
    const W = this.scale.width, H = this.scale.height

    this.add.text(W / 2, 18, 'BLOCK PLACEMENT', {
      fontSize: '16px', color: '#888899', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.scoreLabel = this.add.text(20, 14, 'SCORE: 0', {
      fontSize: '14px', color: '#aaaacc',
    }).setScrollFactor(0).setDepth(100)

    this.comboLabel = this.add.text(20, 32, '', {
      fontSize: '12px', color: '#ff8844',
    }).setScrollFactor(0).setDepth(100)

    this.add.text(W / 2, H - 8, 'Click shape → click board to place  ·  R=restart  ·  ESC=menu', {
      fontSize: '10px', color: '#333355',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100)
  }

  private updateHUD(): void {
    this.scoreLabel?.setText(`SCORE: ${this.score}`)
    this.comboLabel?.setText(this.combo > 1 ? `COMBO ×${this.combo}` : '')
  }

  update(): void {
    this.overlay.update()
  }
}
