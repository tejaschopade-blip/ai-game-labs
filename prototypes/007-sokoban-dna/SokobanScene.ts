import Phaser from 'phaser'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import { VFXManager } from '../../src/systems/VFXManager'

// ── Pure data types ────────────────────────────────────────────────────────────

interface Pos { col: number; row: number }

interface GridState {
  width: number
  height: number
  walls: Set<string>
  player: Pos
  boxes: Pos[]
  goals: Pos[]
}

// ── Pure helper functions (module-level) ───────────────────────────────────────

function posKey(p: Pos): string { return `${p.col},${p.row}` }

function posEq(a: Pos, b: Pos): boolean { return a.col === b.col && a.row === b.row }

function parseLevel(ascii: string): GridState {
  const rows = ascii.split('\n').filter(r => r.length > 0)
  const walls = new Set<string>()
  let player: Pos = { col: 0, row: 0 }
  const boxes: Pos[] = []
  const goals: Pos[] = []
  let width = 0

  rows.forEach((row, r) => {
    width = Math.max(width, row.length)
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '#') walls.add(`${c},${r}`)
      if (ch === '@' || ch === '+') player = { col: c, row: r }
      if (ch === '$' || ch === '*') boxes.push({ col: c, row: r })
      if (ch === '.' || ch === '*' || ch === '+') goals.push({ col: c, row: r })
    }
  })

  return { width, height: rows.length, walls, player, boxes, goals }
}

function tryMove(
  state: GridState,
  dc: number,
  dr: number,
): { next: GridState; pushed: boolean; blocked: boolean } {
  const np: Pos = { col: state.player.col + dc, row: state.player.row + dr }

  if (state.walls.has(posKey(np))) return { next: state, pushed: false, blocked: true }

  const boxIdx = state.boxes.findIndex(b => posEq(b, np))
  if (boxIdx >= 0) {
    const bp: Pos = { col: np.col + dc, row: np.row + dr }
    if (state.walls.has(posKey(bp))) return { next: state, pushed: false, blocked: true }
    if (state.boxes.some(b => posEq(b, bp))) return { next: state, pushed: false, blocked: true }
    const newBoxes = state.boxes.map((b, i) => i === boxIdx ? bp : b)
    return { next: { ...state, player: np, boxes: newBoxes }, pushed: true, blocked: false }
  }

  return { next: { ...state, player: np }, pushed: false, blocked: false }
}

function isComplete(state: GridState): boolean {
  return state.goals.every(g => state.boxes.some(b => posEq(b, g)))
}

function countOnGoal(state: GridState): number {
  return state.boxes.filter(b => state.goals.some(g => posEq(b, g))).length
}

// ── Level data ─────────────────────────────────────────────────────────────────

const LEVELS: string[] = [
  // Level 1 — Learn: one box, one obvious push right
  `########
#      #
#      #
# @$.  #
#      #
#      #
#      #
########`,

  // Level 2 — Direction: box must be pushed UP (pushing right hits a wall)
  `########
#      #
#      #
#  .   #
#      #
#  $   #
#@     #
########`,

  // Level 3 — Two Boxes: two boxes, two goals, must plan paths
  `########
#      #
# ..   #
#      #
# $$   #
#      #
#   @  #
########`,

  // Level 4 — Constraint: inner walls make wrong order much harder
  `########
#      #
#  ..  #
#      #
### $  #
#  $   #
#  @   #
########`,

  // Level 5 — Mistake: intuitive first move traps box against left wall
  `########
#      #
#  .   #
#      #
#      #
# $    #
# .@$  #
########`,
]

// ── Scene ──────────────────────────────────────────────────────────────────────

const PROTO = '007-sokoban-dna'
const GRID_SIZE = 8

export class SokobanScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private vfx!: VFXManager
  private gfx!: Phaser.GameObjects.Graphics

  private state!: GridState
  private levelIndex = 0
  private moveCount = 0
  private won = false

  private cellSize = 0
  private originX = 0
  private originY = 0

  private moveLabel!: Phaser.GameObjects.Text

  constructor() { super({ key: 'SokobanScene' }) }

  create(): void {
    this.vfx = new VFXManager(this)
    this.gfx = this.add.graphics()

    this.overlay = new DebugOverlay(this, PROTO)
    this.overlay.addWatch('Level',  () => String(this.levelIndex + 1))
    this.overlay.addWatch('Moves',  () => String(this.moveCount))
    this.overlay.addWatch('Player', () => `(${this.state?.player.col ?? 0},${this.state?.player.row ?? 0})`)
    this.overlay.addWatch('Goals',  () => this.state
      ? `${countOnGoal(this.state)}/${this.state.goals.length}`
      : '0/0')

    this.setupLayout()
    this.setupInput()
    this.loadLevel()
    // `this.scale` is the GLOBAL ScaleManager, shared by every scene, so a
    // listener registered here outlives this scene unless it is removed. Since
    // per-prototype design sizes landed, entering a prototype with a different
    // design space fires setGameSize -> 'resize' on every stale listener, which
    // then runs this scene's layout code against a destroyed scene.
    const onResize = (): void => { this.setupLayout(); if (this.state) this.renderState() }
    this.scale.on('resize', onResize)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize))
  }

  private setupLayout(): void {
    const pad = 90
    const avail = Math.min(this.scale.width - pad, this.scale.height - pad)
    this.cellSize = Math.floor(avail / GRID_SIZE)
    this.originX  = Math.floor((this.scale.width  - GRID_SIZE * this.cellSize) / 2)
    this.originY  = Math.floor((this.scale.height - GRID_SIZE * this.cellSize) / 2)
  }

  private setupInput(): void {
    const kb = this.input.keyboard!
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP).on('down',    () => this.doMove(0, -1))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN).on('down',  () => this.doMove(0, 1))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).on('down',  () => this.doMove(-1, 0))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).on('down', () => this.doMove(1, 0))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.W).on('down', () => this.doMove(0, -1))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.S).on('down', () => this.doMove(0, 1))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.A).on('down', () => this.doMove(-1, 0))
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.D).on('down', () => this.doMove(1, 0))
  }

  private loadLevel(): void {
    this.tweens.killAll()
    this.time.removeAllEvents()

    this.won = false
    this.moveCount = 0

    // Clear tagged UI from previous level / win screen
    ;(this.children.list.slice() as Phaser.GameObjects.GameObject[])
      .filter(c => (c as { getData?: (k: string) => unknown }).getData?.('levelUI'))
      .forEach(c => c.destroy())

    this.state = parseLevel(LEVELS[this.levelIndex])
    this.setupLayout()
    this.renderState()
    this.createHUD()
    this.vfx.fadeTransition(300)
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private renderState(): void {
    this.gfx.clear()
    const { state, cellSize: cs, originX: ox, originY: oy } = this

    for (let r = 0; r < state.height; r++) {
      for (let c = 0; c < state.width; c++) {
        const x = ox + c * cs
        const y = oy + r * cs
        const wall    = state.walls.has(`${c},${r}`)
        const onGoal  = state.goals.some(g => g.col === c && g.row === r)
        const hasBox  = state.boxes.some(b => b.col === c && b.row === r)
        const isPlayer = state.player.col === c && state.player.row === r

        // Cell background
        this.gfx.fillStyle(wall ? 0x444455 : (onGoal && !hasBox ? 0x142214 : 0x0e0e1a), 1)
        this.gfx.fillRect(x + 1, y + 1, cs - 2, cs - 2)

        // Wall cross-hatch
        if (wall) {
          this.gfx.lineStyle(1, 0x333344, 0.5)
          this.gfx.lineBetween(x + 1, y + 1, x + cs - 1, y + cs - 1)
          this.gfx.lineBetween(x + cs - 1, y + 1, x + 1, y + cs - 1)
        }

        // Goal ring (only when box not on it)
        if (onGoal && !hasBox) {
          this.gfx.lineStyle(2, 0x44aa44, 1)
          this.gfx.strokeCircle(x + cs / 2, y + cs / 2, cs * 0.22)
        }

        // Box
        if (hasBox) {
          const pad = cs * 0.1
          this.gfx.fillStyle(onGoal ? 0x226622 : 0x7a5c22, 1)
          this.gfx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2)
          this.gfx.lineStyle(2, onGoal ? 0x66ee66 : 0xddaa33, 1)
          this.gfx.strokeRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2)
          // Center dot
          this.gfx.fillStyle(onGoal ? 0x88ff88 : 0xffcc55, 0.6)
          this.gfx.fillCircle(x + cs / 2, y + cs / 2, cs * 0.1)
        }

        // Player
        if (isPlayer) {
          this.gfx.fillStyle(0x4488ff, 1)
          this.gfx.fillCircle(x + cs / 2, y + cs / 2, cs * 0.3)
          this.gfx.lineStyle(2, 0x88ccff, 1)
          this.gfx.strokeCircle(x + cs / 2, y + cs / 2, cs * 0.3)
          // Pupil
          this.gfx.fillStyle(0xffffff, 0.8)
          this.gfx.fillCircle(x + cs / 2 + cs * 0.06, y + cs / 2 - cs * 0.06, cs * 0.07)
        }
      }
    }
  }

  // ── Input / movement ───────────────────────────────────────────────────────

  private doMove(dc: number, dr: number): void {
    if (this.won) return

    const prevOnGoal = countOnGoal(this.state)
    const { next, blocked } = tryMove(this.state, dc, dr)
    if (blocked) return

    this.state = next
    this.moveCount++
    this.renderState()
    this.moveLabel?.setText(`Moves: ${this.moveCount}`)

    const nowOnGoal = countOnGoal(next)
    if (nowOnGoal > prevOnGoal) {
      // A box just landed on a goal — burst at each box-on-goal
      next.boxes.forEach(b => {
        if (next.goals.some(g => posEq(b, g))) {
          const px = this.originX + b.col * this.cellSize + this.cellSize / 2
          const py = this.originY + b.row * this.cellSize + this.cellSize / 2
          this.vfx.burst(px, py, 0x44ff88, 8)
        }
      })
    }

    if (isComplete(next)) this.onLevelComplete()
  }

  // ── Level complete ─────────────────────────────────────────────────────────

  private onLevelComplete(): void {
    this.won = true
    this.vfx.screenShake(6, 300)
    this.state.boxes.forEach(b => {
      const px = this.originX + b.col * this.cellSize + this.cellSize / 2
      const py = this.originY + b.row * this.cellSize + this.cellSize / 2
      this.vfx.burst(px, py, 0x00ff88, 14)
    })

    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const isLast = this.levelIndex >= LEVELS.length - 1

    this.add.rectangle(cx, cy, 320, 200, 0x0e0e1a, 0.96)
      .setStrokeStyle(2, 0x334466).setDepth(500).setScrollFactor(0).setData('levelUI', true)

    this.add.text(cx, cy - 62, 'LEVEL COMPLETE', {
      fontSize: '24px', color: '#00ff88', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setData('levelUI', true)

    this.add.text(cx, cy - 28, `Moves: ${this.moveCount}`, {
      fontSize: '14px', color: '#888899',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setData('levelUI', true)

    if (!isLast) {
      const nextBtn = this.add.text(cx, cy + 14, 'Next Level', {
        fontSize: '16px', color: '#ffffff', backgroundColor: '#224488',
        padding: { x: 18, y: 8 },
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0)
        .setInteractive({ useHandCursor: true }).setData('levelUI', true)
      nextBtn.on('pointerdown', () => { this.levelIndex++; this.loadLevel() })
      nextBtn.on('pointerover',  () => nextBtn.setAlpha(0.8))
      nextBtn.on('pointerout',   () => nextBtn.setAlpha(1))
    } else {
      this.add.text(cx, cy + 14, 'All 5 levels complete!', {
        fontSize: '15px', color: '#ffaa00',
      }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setData('levelUI', true)
    }

    const retryBtn = this.add.text(cx, cy + 62, 'R — Retry Level', {
      fontSize: '13px', color: '#556677',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0).setData('levelUI', true)
    void retryBtn
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private createHUD(): void {
    const cx = this.scale.width / 2

    this.add.text(cx, 18, 'SOKOBAN DNA', {
      fontSize: '18px', color: '#aaaacc', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0).setData('levelUI', true)

    this.add.text(cx, 40, `Level ${this.levelIndex + 1} / ${LEVELS.length}`, {
      fontSize: '12px', color: '#555577',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0).setData('levelUI', true)

    this.moveLabel = this.add.text(cx, 58, 'Moves: 0', {
      fontSize: '12px', color: '#444466',
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0).setData('levelUI', true)

    this.add.text(cx, this.scale.height - 14,
      'WASD / Arrows: move  ·  R = restart level  ·  ESC = menu', {
        fontSize: '11px', color: '#333355',
      }).setOrigin(0.5, 1).setDepth(100).setScrollFactor(0).setData('levelUI', true)
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(): void {
    this.overlay.update()
  }
}
