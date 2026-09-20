// Loop Sort DNA — pure types. No Phaser, no runtime dependencies.
//
// THE MODEL, IN ONE PARAGRAPH
//   The belt is a ring of `capacity` fixed cells that rotates continuously.
//   Cubes sit in cells and travel with them; they never move relative to the
//   belt on their own. One fixed point in *screen* space is the intake chute.
//   As the ring turns, a different cell passes under the chute every moment —
//   so WHEN you release a batch decides WHERE on the belt it lands. That is the
//   whole game: the belt supplies the timing, the player supplies the colour.

export type CubeColor = 'red' | 'blue' | 'green' | 'yellow'

export const ALL_COLORS: readonly CubeColor[] = ['red', 'blue', 'green', 'yellow']

/** A cube occupying one belt cell. `cell` is an index into BeltState.cells. */
export interface Cube {
  id: string
  color: CubeColor
}

export interface Batch {
  id: string
  cubes: CubeColor[]
}

export interface LevelGoal { color: CubeColor; count: number }

export interface LoopSortLevel {
  id: number
  name: string
  teaches: string
  /** Cells around the ring. This *is* the capacity — one cube per cell. */
  capacity: number
  matchSize: number
  /** Belt travel in cells per second. Slow enough to read, fast enough to feel alive. */
  speed: number
  /** How many batches are offered at once. */
  offerCount: number
  /** Cube colours at cell 0..n at level start; `null` leaves the cell empty. */
  initialBelt: (CubeColor | null)[]
  /** Consumed in order to refill the offer. Deterministic — never shuffled. */
  batchQueue: CubeColor[][]
  goal: LevelGoal[]
}

export type Phase = 'RUNNING' | 'LEVEL_COMPLETE' | 'LEVEL_FAILED'

export type FailReason = 'full' | 'outOfBatches'

/**
 * Plain data only — never holds a Phaser reference.
 *
 * `rotation` is continuous and is the only thing that changes between player
 * actions. Everything else changes exclusively inside `releaseBatch`.
 */
export interface GameState {
  level: LoopSortLevel
  /** Fixed ring of cells. Index is a belt position, not a screen position. */
  cells: (Cube | null)[]
  /** Continuous belt travel in cells, wrapped to [0, capacity). */
  rotation: number
  offered: Batch[]
  queueIndex: number
  clearedByColor: Record<CubeColor, number>
  totalCleared: number
  matches: number
  picks: number
  phase: Phase
  failReason?: FailReason
  nextCubeId: number
}

// ── Event log ─────────────────────────────────────────────────────────────────
// One release produces one ordered list. The scene animates it; it is the only
// contract between logic and view.

export type ReleaseEvent =
  /** A batch cube arrived in `cell`. */
  | { kind: 'land'; cubeId: string; color: CubeColor; cell: number; order: number }
  /** An existing cube was pushed one cell along to make room. */
  | { kind: 'shove'; cubeId: string; from: number; to: number }
  /** `cubeIds` were connected and popped. `size` >= matchSize. */
  | { kind: 'clear'; cubeIds: string[]; color: CubeColor; cells: number[]; size: number; order: number }
  | { kind: 'complete' }
  | { kind: 'fail'; reason: FailReason }
