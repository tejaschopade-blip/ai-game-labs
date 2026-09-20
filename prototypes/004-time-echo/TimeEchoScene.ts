import Phaser from 'phaser'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { VFXManager } from '../../src/systems/VFXManager'

// ── Types ─────────────────────────────────────────────────────────────────────

type Dir = 'up' | 'down' | 'left' | 'right'

interface GridPos { col: number; row: number }
interface RecordedMove { dir: Dir; elapsedMs: number }

interface DoorDef {
  pos: GridPos
  plates: number[]  // indices into level.plates; opens when ALL listed plates latched
}

interface TimeEchoLevel {
  playerStart: GridPos
  walls: GridPos[]
  plates: GridPos[]
  doors: DoorDef[]
  goal: GridPos
  hint?: string
}

type Phase = 'recording' | 'replay' | 'won'

// ── Direction helpers ─────────────────────────────────────────────────────────

const DELTA: Record<Dir, GridPos> = {
  up:    { col: 0,  row: -1 },
  down:  { col: 0,  row:  1 },
  left:  { col: -1, row:  0 },
  right: { col:  1, row:  0 },
}

// ── Level data ────────────────────────────────────────────────────────────────

const GRID = 8

const LEVELS: TimeEchoLevel[] = [
  // Level 1 — Echo intro. No plate, no door. Learn recording + ghost.
  {
    playerStart: { col: 1, row: 4 },
    walls: [{ col: 3, row: 2 }, { col: 4, row: 2 }, { col: 3, row: 5 }, { col: 4, row: 5 }],
    plates: [],
    doors: [],
    goal: { col: 6, row: 4 },
    hint: 'Record moves, then reach the star during replay',
  },
  // Level 2 — One plate + door. Ghost must stand on plate → door opens.
  {
    playerStart: { col: 1, row: 4 },
    walls: [
      { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 },
      { col: 5, row: 2 }, { col: 6, row: 2 },
    ],
    plates: [{ col: 1, row: 6 }],
    doors: [{ pos: { col: 4, row: 2 }, plates: [0] }],
    goal: { col: 6, row: 1 },
    hint: 'Record: go to the plate. Then reach the star through the door',
  },
  // Level 3 — Walls + plate. Plan recording path to reach the plate.
  {
    playerStart: { col: 1, row: 4 },
    walls: [
      { col: 3, row: 2 }, { col: 3, row: 3 }, { col: 3, row: 4 }, { col: 3, row: 5 },
      { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
      { col: 4, row: 1 }, { col: 6, row: 1 },
    ],
    plates: [{ col: 5, row: 4 }],
    doors: [{ pos: { col: 5, row: 1 }, plates: [0] }],
    goal: { col: 6, row: 3 },
    hint: 'Plan carefully — your ghost must reach the plate',
  },
  // Level 4 — Two plates. Ghost latches plate 0, player latches plate 1.
  {
    playerStart: { col: 1, row: 4 },
    walls: [
      { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 },
      { col: 5, row: 2 }, { col: 6, row: 2 },
    ],
    plates: [
      { col: 1, row: 6 },
      { col: 6, row: 6 },
    ],
    doors: [{ pos: { col: 4, row: 2 }, plates: [0, 1] }],
    goal: { col: 4, row: 1 },
    hint: 'Both plates must be activated — one by you, one by your echo',
  },
  // Level 5 — Combined corridors, two plates, one door.
  {
    playerStart: { col: 1, row: 6 },
    walls: [
      { col: 1, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 },
      { col: 5, row: 3 }, { col: 6, row: 3 },
      { col: 3, row: 4 }, { col: 3, row: 5 }, { col: 3, row: 6 },
      { col: 5, row: 1 }, { col: 5, row: 2 },
    ],
    plates: [
      { col: 1, row: 1 },
      { col: 6, row: 6 },
    ],
    doors: [{ pos: { col: 4, row: 3 }, plates: [0, 1] }],
    goal: { col: 6, row: 1 },
    hint: 'Plan your echo to reach top-left. You take the bottom-right.',
  },
]

// ── Scene ─────────────────────────────────────────────────────────────────────

const PROTO = '004-time-echo'
const RECORD_DURATION = 10000
const MOVE_TWEEN_MS   = 180

export class TimeEchoScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager
  private gfx!: Phaser.GameObjects.Graphics

  private levelIndex = 0
  private phase: Phase = 'recording'

  private playerPos!: GridPos
  private playerSprite!: Phaser.GameObjects.Rectangle
  private playerMoving = false

  private ghostPos!: GridPos
  private ghostSprite!: Phaser.GameObjects.Rectangle
  private ghostVisible = false

  private recordingStart = 0
  private recordedMoves: RecordedMove[] = []

  private latchedPlates: Set<number> = new Set()
  private openDoors: Set<number> = new Set()

  private phaseLabel!: Phaser.GameObjects.Text
  private timerLabel!: Phaser.GameObjects.Text
  private hintLabel!: Phaser.GameObjects.Text

  private cellSize = 0
  private originX = 0
  private originY = 0

  constructor() { super({ key: 'TimeEchoScene' }) }

  create(): void {
    this.vfx = new VFXManager(this)
    this.gfx = this.add.graphics()

    this.overlay = new DebugOverlay(this, PROTO)
    this.overlay.addWatch('Phase',  () => this.phase)
    this.overlay.addWatch('Player', () => `(${this.playerPos?.col},${this.playerPos?.row})`)
    this.overlay.addWatch('Ghost',  () => this.ghostVisible ? `(${this.ghostPos.col},${this.ghostPos.row})` : 'hidden')
    this.overlay.addWatch('Steps',  () => String(this.recordedMoves.length))

    const kb = this.input.keyboard!
    const addKey = (code: number, dir: Dir) => kb.addKey(code).on('down', () => this.handleInput(dir))
    addKey(Phaser.Input.Keyboard.KeyCodes.UP,    'up')
    addKey(Phaser.Input.Keyboard.KeyCodes.DOWN,  'down')
    addKey(Phaser.Input.Keyboard.KeyCodes.LEFT,  'left')
    addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, 'right')
    addKey(Phaser.Input.Keyboard.KeyCodes.W, 'up')
    addKey(Phaser.Input.Keyboard.KeyCodes.S, 'down')
    addKey(Phaser.Input.Keyboard.KeyCodes.A, 'left')
    addKey(Phaser.Input.Keyboard.KeyCodes.D, 'right')

    this.setupLayout()
    this.loadLevel()
    // `this.scale` is the GLOBAL ScaleManager, shared by every scene, so a
    // listener registered here outlives this scene unless it is removed. Since
    // per-prototype design sizes landed, entering a prototype with a different
    // design space fires setGameSize -> 'resize' on every stale listener, which
    // then runs this scene's layout code against a destroyed scene.
    const onResize = (): void => { this.setupLayout(); this.redraw() }
    this.scale.on('resize', onResize)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize))
  }

  private setupLayout(): void {
    const pad  = 100
    const avail = Math.min(this.scale.width, this.scale.height) - pad * 2
    this.cellSize = Math.floor(avail / GRID)
    this.originX  = Math.floor((this.scale.width  - this.cellSize * GRID) / 2)
    this.originY  = Math.floor((this.scale.height - this.cellSize * GRID) / 2)
  }

  private loadLevel(): void {
    // Cancel any pending timers (old recording countdown, old ghost replay callbacks)
    // and kill in-flight tweens before rebuilding the level.
    this.tweens.killAll()
    this.time.removeAllEvents()

    this.phase = 'recording'
    this.playerMoving = false
    this.ghostVisible = false
    this.recordedMoves = []
    this.latchedPlates = new Set()
    this.openDoors     = new Set()

    const level = LEVELS[this.levelIndex]
    this.playerPos = { ...level.playerStart }
    this.ghostPos  = { ...level.playerStart }

    this.playerSprite?.destroy()
    this.ghostSprite?.destroy()
    this.phaseLabel?.destroy()
    this.timerLabel?.destroy()
    this.hintLabel?.destroy()

    // Clear tagged UI from previous level
    ;(this.children.list.slice() as Phaser.GameObjects.GameObject[])
      .filter(c => (c as { getData?: (k: string) => unknown }).getData?.('levelUI'))
      .forEach(c => c.destroy())

    const { px: spx, py: spy } = this.cellToPixel(this.playerPos.col, this.playerPos.row)
    this.playerSprite = this.add.rectangle(spx, spy, this.cellSize * 0.6, this.cellSize * 0.6, 0x4488ff).setDepth(10)
    this.ghostSprite  = this.add.rectangle(spx, spy, this.cellSize * 0.6, this.cellSize * 0.6, 0x88aaff).setAlpha(0).setDepth(9)

    this.addUI()
    this.redraw()

    this.recordingStart = this.time.now
    this.time.delayedCall(RECORD_DURATION, () => this.startReplay())

    this.vfx.fadeTransition(300)
  }

  private addUI(): void {
    const cx = this.scale.width / 2

    this.add.text(cx, 18, 'TIME ECHO', { fontSize: '18px', color: '#aaaacc', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0).setData('levelUI', true)

    this.add.text(cx, 40, `Level ${this.levelIndex + 1} / ${LEVELS.length}`, { fontSize: '13px', color: '#666688' })
      .setOrigin(0.5).setDepth(100).setScrollFactor(0).setData('levelUI', true)

    this.phaseLabel = this.add.text(cx, this.scale.height - 50, 'RECORDING', {
      fontSize: '14px', color: '#ff8844', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0)

    this.timerLabel = this.add.text(cx, this.scale.height - 30, '', {
      fontSize: '12px', color: '#888866',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0)

    this.hintLabel = this.add.text(cx, this.scale.height - 72, LEVELS[this.levelIndex].hint ?? '', {
      fontSize: '11px', color: '#444466',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0)

    this.add.text(8, this.scale.height - 20, 'WASD / Arrows to move  ·  R = restart level', {
      fontSize: '11px', color: '#333355',
    }).setScrollFactor(0).setDepth(100).setData('levelUI', true)
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private handleInput(dir: Dir): void {
    if (this.phase === 'won' || this.playerMoving) return

    const level = LEVELS[this.levelIndex]
    const delta = DELTA[dir]
    const next  = { col: this.playerPos.col + delta.col, row: this.playerPos.row + delta.row }

    if (!this.canMove(next, level)) return

    if (this.phase === 'recording') {
      this.recordedMoves.push({ dir, elapsedMs: this.time.now - this.recordingStart })
    }

    this.playerMoving = true
    const { px, py } = this.cellToPixel(next.col, next.row)
    this.tweens.add({
      targets: this.playerSprite,
      x: px, y: py,
      duration: MOVE_TWEEN_MS,
      ease: 'Quad.Out',
      onComplete: () => {
        this.playerMoving = false
        this.playerPos = next
        if (this.phase === 'replay') {
          this.checkPlates()
          this.checkWin()
        }
      },
    })
  }

  private canMove(pos: GridPos, level: TimeEchoLevel): boolean {
    if (pos.col < 1 || pos.col > GRID - 2 || pos.row < 1 || pos.row > GRID - 2) return false
    if (level.walls.some(w => w.col === pos.col && w.row === pos.row)) return false
    if (level.doors.some((d, i) => !this.openDoors.has(i) && d.pos.col === pos.col && d.pos.row === pos.row)) return false
    return true
  }

  // ── Recording → Replay ───────────────────────────────────────────────────

  private startReplay(): void {
    if (this.phase !== 'recording') return
    this.phase = 'replay'

    const level = LEVELS[this.levelIndex]
    this.playerPos = { ...level.playerStart }
    const { px: spx, py: spy } = this.cellToPixel(this.playerPos.col, this.playerPos.row)
    this.playerSprite.setPosition(spx, spy)
    this.playerMoving = false

    this.ghostPos = { ...level.playerStart }
    this.ghostSprite.setPosition(spx, spy).setAlpha(0)
    this.ghostVisible = true
    this.tweens.add({ targets: this.ghostSprite, alpha: 0.55, duration: 400 })

    this.phaseLabel.setText('ECHO ACTIVE').setColor('#88ccff')
    this.timerLabel.setText('')
    this.hintLabel.setText('Reach the star!')

    this.recordedMoves.forEach(move => {
      this.time.delayedCall(move.elapsedMs, () => {
        if (this.phase !== 'replay') return
        const delta = DELTA[move.dir]
        const next  = { col: this.ghostPos.col + delta.col, row: this.ghostPos.row + delta.row }
        if (!this.canMove(next, level)) return
        const { px, py } = this.cellToPixel(next.col, next.row)
        this.tweens.add({
          targets: this.ghostSprite,
          x: px, y: py,
          duration: MOVE_TWEEN_MS,
          ease: 'Quad.Out',
          onComplete: () => {
            this.ghostPos = next
            this.checkPlates()
          },
        })
      })
    })

    this.redraw()
  }

  // ── Puzzle state ─────────────────────────────────────────────────────────

  private checkPlates(): void {
    const level = LEVELS[this.levelIndex]
    let changed = false

    level.plates.forEach((plate, i) => {
      if (this.latchedPlates.has(i)) return
      const playerOn = this.playerPos.col === plate.col && this.playerPos.row === plate.row
      const ghostOn  = this.ghostPos.col  === plate.col && this.ghostPos.row  === plate.row
      if (playerOn || ghostOn) {
        this.latchedPlates.add(i)
        changed = true
        const { px, py } = this.cellToPixel(plate.col, plate.row)
        this.vfx.burst(px, py, 0xffaa00, 8)
      }
    })

    if (changed) {
      level.doors.forEach((door, i) => {
        if (!this.openDoors.has(i) && door.plates.every(pi => this.latchedPlates.has(pi))) {
          this.openDoors.add(i)
          const { px, py } = this.cellToPixel(door.pos.col, door.pos.row)
          this.vfx.floatingText(px, py - this.cellSize, 'OPEN', '#00ff88', '14px')
        }
      })
      this.redraw()
    }
  }

  private checkWin(): void {
    if (this.phase !== 'replay') return
    const level = LEVELS[this.levelIndex]
    if (this.playerPos.col === level.goal.col && this.playerPos.row === level.goal.row) {
      this.onWin()
    }
  }

  private onWin(): void {
    this.phase = 'won'
    const level = LEVELS[this.levelIndex]
    const { px, py } = this.cellToPixel(level.goal.col, level.goal.row)
    this.vfx.burst(px, py, 0x00ff88, 20)
    this.vfx.screenShake(8, 300)

    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const isLast = this.levelIndex >= LEVELS.length - 1

    this.add.rectangle(cx, cy, 320, 200, 0x111122, 0.95)
      .setStrokeStyle(2, 0x333366).setDepth(500).setScrollFactor(0).setData('levelUI', true)

    this.add.text(cx, cy - 60, 'LEVEL COMPLETE', {
      fontSize: '26px', color: '#00ff88', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setData('levelUI', true)

    if (!isLast) {
      const nextBtn = this.add.text(cx, cy + 10, 'Next Level', {
        fontSize: '18px', color: '#ffffff', backgroundColor: '#224488',
        padding: { x: 20, y: 10 },
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0)
        .setInteractive({ useHandCursor: true }).setData('levelUI', true)
      nextBtn.on('pointerdown', () => { this.levelIndex++; this.loadLevel() })
      nextBtn.on('pointerover',  () => nextBtn.setAlpha(0.8))
      nextBtn.on('pointerout',   () => nextBtn.setAlpha(1))
    } else {
      this.add.text(cx, cy + 10, 'All levels complete!', {
        fontSize: '18px', color: '#ffaa00',
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setData('levelUI', true)
    }

    const restartBtn = this.add.text(cx, cy + 60, 'Restart Level', {
      fontSize: '14px', color: '#888888',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }).setData('levelUI', true)
    restartBtn.on('pointerdown', () => this.loadLevel())
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private redraw(): void {
    this.gfx.clear()
    const level = LEVELS[this.levelIndex]
    this.drawGrid()
    this.drawWalls(level)
    this.drawPlates(level)
    this.drawDoors(level)
    this.drawGoal(level)
  }

  private drawGrid(): void {
    const g = this.gfx

    // Border cells
    g.fillStyle(0x444455, 1)
    for (let c = 0; c < GRID; c++) {
      this.fillCell(g, c, 0)
      this.fillCell(g, c, GRID - 1)
    }
    for (let r = 1; r < GRID - 1; r++) {
      this.fillCell(g, 0, r)
      this.fillCell(g, GRID - 1, r)
    }

    // Grid lines
    g.lineStyle(1, 0x1a1a2e, 1)
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

  private drawWalls(level: TimeEchoLevel): void {
    const g = this.gfx
    g.fillStyle(0x555566, 1)
    for (const w of level.walls) this.fillCell(g, w.col, w.row)
  }

  private drawPlates(level: TimeEchoLevel): void {
    const g = this.gfx
    level.plates.forEach((p, i) => {
      const latched = this.latchedPlates.has(i)
      const { px, py } = this.cellToPixel(p.col, p.row)
      const s = this.cellSize * 0.55
      g.fillStyle(latched ? 0xffaa00 : 0x443300, 1)
      g.fillRect(px - s / 2, py - s / 2, s, s)
      g.lineStyle(2, latched ? 0xffcc44 : 0x886633, 1)
      g.strokeRect(px - s / 2, py - s / 2, s, s)
    })
  }

  private drawDoors(level: TimeEchoLevel): void {
    const g = this.gfx
    level.doors.forEach((d, i) => {
      const open = this.openDoors.has(i)
      const { px, py } = this.cellToPixel(d.pos.col, d.pos.row)
      if (open) {
        g.lineStyle(2, 0x224422, 0.4)
        g.strokeRect(px - this.cellSize / 2 + 2, py - this.cellSize / 2 + 2, this.cellSize - 4, this.cellSize - 4)
      } else {
        g.fillStyle(0x885533, 1)
        this.fillCell(g, d.pos.col, d.pos.row)
        g.lineStyle(2, 0xffaa44, 1)
        g.strokeRect(px - this.cellSize / 2 + 2, py - this.cellSize / 2 + 2, this.cellSize - 4, this.cellSize - 4)
      }
    })
  }

  private drawGoal(level: TimeEchoLevel): void {
    const g = this.gfx
    const { px, py } = this.cellToPixel(level.goal.col, level.goal.row)
    const r = this.cellSize * 0.3
    g.fillStyle(0x00cc77, 1)
    g.fillCircle(px, py, r)
    g.lineStyle(2, 0x00ff88, 1)
    g.strokeCircle(px, py, r)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(px, py, r * 0.3)
  }

  private fillCell(g: Phaser.GameObjects.Graphics, col: number, row: number): void {
    const pad = 1
    const { px, py } = this.cellToPixel(col, row)
    g.fillRect(px - this.cellSize / 2 + pad, py - this.cellSize / 2 + pad, this.cellSize - pad * 2, this.cellSize - pad * 2)
  }

  private cellToPixel(col: number, row: number): { px: number; py: number } {
    return {
      px: this.originX + col * this.cellSize + this.cellSize / 2,
      py: this.originY + row * this.cellSize + this.cellSize / 2,
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(): void {
    this.overlay.update()

    if (this.phase === 'recording') {
      const remaining = Math.max(0, RECORD_DURATION - (this.time.now - this.recordingStart))
      this.timerLabel.setText(`Recording: ${(remaining / 1000).toFixed(1)}s`)
    }
  }
}
