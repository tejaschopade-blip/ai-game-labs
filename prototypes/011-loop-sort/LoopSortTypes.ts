// Loop Sort DNA — pure types. No Phaser, no runtime dependencies.
// These files must be runnable under plain node so levels can be verified headlessly.

export type CubeColor = 'red' | 'blue' | 'green' | 'yellow'

export const ALL_COLORS: readonly CubeColor[] = ['red', 'blue', 'green', 'yellow']

export const DEFAULT_MATCH_SIZE = 3

/** A cube on the belt. `frozen` cubes are ice: inert, never match, never move. */
export interface Cube {
  id: string
  color: CubeColor
  frozen: boolean
}

export interface Batch {
  id: string
  cubes: CubeColor[]
}

// ── Obstacles ─────────────────────────────────────────────────────────────────
// Four kinds, one shared `id`. No plugin system, no effect interpreter.

/** Covers slots [from..to]. While closed those cells cannot hold cubes. */
export interface CurtainObstacle {
  kind: 'curtain'
  id: string
  from: number
  to: number
  requiredColor: CubeColor
  requiredCount: number
  open: boolean
}

/** Freezes the cube that starts at `slot`. Inert until thawed. */
export interface IceObstacle {
  kind: 'ice'
  id: string
  slot: number
  requiredColor: CubeColor
  requiredCount: number
  thawed: boolean
}

/** A wall between slot `at-1` and `at`. While locked, nothing crosses it. */
export interface BarrierObstacle {
  kind: 'barrier'
  id: string
  at: number
  requiredColor: CubeColor
  requiredCount: number
  locked: boolean
}

/** Purely informational: logic always knows the truth, the view hides it. */
export interface HiddenObstacle {
  kind: 'hidden'
  id: string
  from: number
  to: number
  revealAfterClears: number
  revealed: boolean
}

export type Obstacle =
  | CurtainObstacle
  | IceObstacle
  | BarrierObstacle
  | HiddenObstacle

// ── Level ─────────────────────────────────────────────────────────────────────

export interface LevelGoal { color: CubeColor; count: number }

export interface LoopSortLevel {
  id: number
  name: string
  teaches: string
  matchSize: number
  capacity: number
  /** How many batches are visible and choosable at once. */
  offerCount: number
  /** Occupied prefix of the belt at level start; padded with null to `capacity`. */
  initialBelt: (CubeColor | null)[]
  /** Consumed in order to refill the offer. Deterministic — never shuffled. */
  batchQueue: CubeColor[][]
  obstacles: Obstacle[]
  goal: LevelGoal[]
}

// ── Runtime state ─────────────────────────────────────────────────────────────

export type Phase =
  | 'LEVEL_READY'
  | 'WAITING_FOR_INPUT'
  | 'RELEASING'
  | 'SORTING'
  | 'RESOLVING_MATCHES'
  | 'RESOLVING_OBSTACLES'
  | 'CHECK_LEVEL'
  | 'LEVEL_COMPLETE'
  | 'LEVEL_FAILED'

/** Plain data only — never holds a Phaser reference. */
export interface GameState {
  level: LoopSortLevel
  cells: (Cube | null)[]
  obstacles: Obstacle[]
  offered: Batch[]
  queueIndex: number
  clearedByColor: Record<CubeColor, number>
  totalClears: number
  picks: number
  phase: Phase
  nextCubeId: number
}

// ── Event log ─────────────────────────────────────────────────────────────────
// The presentation layer animates this list in order. It is the only contract
// between logic and view.

export type ResolveEvent =
  | { kind: 'insert'; cubeId: string; color: CubeColor; slot: number }
  | { kind: 'shift'; cubeId: string; from: number; to: number }
  | { kind: 'clear'; cubeIds: string[]; color: CubeColor; slots: number[]; chainIndex: number }
  | { kind: 'obstacle'; obstacleId: string; became: 'open' | 'broken' | 'revealed' | 'unlocked' }
  | { kind: 'fail'; reason: 'full' | 'noValidPlacement' | 'outOfBatches' }
  | { kind: 'complete' }
