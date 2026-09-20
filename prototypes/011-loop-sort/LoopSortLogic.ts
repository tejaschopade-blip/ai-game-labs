// Loop Sort DNA — pure logic. No Phaser, no tweens, no screen coordinates.
//
// BELT MODEL
//   `cells` is a fixed ring of `capacity` slots. A cube sits in a cell and
//   stays there: cubes never slide relative to the belt on their own. What
//   moves is `rotation`, a continuous cell-offset that advances every frame and
//   carries the entire ring past a fixed intake point.
//
//   Cell `c` is at loop fraction  ((rotation + c) / capacity) mod 1.
//   The intake chute is at loop fraction INTAKE_T, permanently.
//
//   So the cell under the chute changes as the belt turns, and the only thing
//   the player controls is *which cell that is when they tap*. Colour is the
//   what; rotation is the where. Neither alone is a decision — together they
//   are the entire mechanic.
//
// WHY CUBES NEVER COMPACT
//   An earlier build packed cubes toward a fixed end after every action. That
//   made gaps disappear on their own, which meant matches assembled themselves
//   and the player's timing stopped mattering. Here a gap is a real, persistent
//   object that travels around the loop with everything else — it is the space
//   you aim at, and it is the resource you spend.

import type {
  Batch,
  Cube,
  CubeColor,
  GameState,
  LoopSortLevel,
  ReleaseEvent,
} from './LoopSortTypes'
import { effectiveCapacity, effectiveMatchSize, effectiveSpeed } from './LoopSortTuning'

/**
 * Where the intake chute sits on the loop, as a fraction of the path starting
 * at top-centre and running clockwise. 0.5 is bottom-centre — nearest the
 * batch tray, so a released cube travels the shortest possible distance and
 * the player's eye never has to leave the bottom of the screen.
 *
 * Shared with the scene so the drawn chute and the logical intake are the same
 * point by construction rather than by two numbers agreeing.
 */
export const INTAKE_T = 0.5

interface Run { color: CubeColor; cells: number[] }

// ── Geometry of the ring ──────────────────────────────────────────────────────

/** Loop fraction [0,1) of a given cell right now. */
export function cellFraction(state: GameState, cell: number): number {
  const cap = state.cells.length
  const raw = (state.rotation + cell) / cap
  return raw - Math.floor(raw)
}

/** The cell currently under the intake chute. */
export function intakeCell(state: GameState): number {
  const cap = state.cells.length
  const raw = INTAKE_T * cap - state.rotation
  return ((Math.round(raw) % cap) + cap) % cap
}

/** Advances the belt. The only thing that happens between player actions. */
export function advance(state: GameState, dtSeconds: number): void {
  if (state.phase !== 'RUNNING') return
  const cap = state.cells.length
  const speed = effectiveSpeed(state.level.speed)
  state.rotation = (state.rotation + speed * dtSeconds) % cap
}

// ── Occupancy ─────────────────────────────────────────────────────────────────

export function occupiedCount(state: GameState): number {
  return state.cells.reduce<number>((n, c) => n + (c ? 1 : 0), 0)
}

export function freeCount(state: GameState): number {
  return state.cells.length - occupiedCount(state)
}

export function matchSizeOf(state: GameState): number {
  return effectiveMatchSize(state.level.matchSize)
}

/** A batch is releasable only if every one of its cubes has somewhere to go. */
export function canRelease(state: GameState, batch: Batch): boolean {
  return state.phase === 'RUNNING' && batch.cubes.length <= freeCount(state)
}

// ── Runs ──────────────────────────────────────────────────────────────────────

/**
 * Maximal groups of touching same-colour cubes, scanned circularly.
 *
 * The scan starts at a colour boundary (or an empty cell) so a run that
 * straddles index 0 is found whole rather than split into two short ones. If no
 * boundary exists the ring is full and single-coloured, which is one run of
 * everything.
 */
function findRuns(state: GameState): Run[] {
  const cells = state.cells
  const cap = cells.length

  let start = -1
  for (let i = 0; i < cap; i++) {
    const c = cells[i]
    const prev = cells[(i - 1 + cap) % cap]
    if (c === null || prev === null || prev.color !== c.color) { start = i; break }
  }
  if (start < 0) {
    const first = cells[0]
    if (!first) return []
    return [{ color: first.color, cells: cells.map((_, i) => i) }]
  }

  const runs: Run[] = []
  let cur: Run | null = null
  for (let n = 0; n < cap; n++) {
    const i = (start + n) % cap
    const c = cells[i]
    if (!c) { if (cur) { runs.push(cur); cur = null } continue }
    if (cur && cur.color === c.color) cur.cells.push(i)
    else { if (cur) runs.push(cur); cur = { color: c.color, cells: [i] } }
  }
  if (cur) runs.push(cur)
  return runs
}

/** The run a given cell belongs to, or null. Used by the view for previews. */
export function runLengthAt(state: GameState, cell: number): number {
  const hit = findRuns(state).find(r => r.cells.includes(cell))
  return hit ? hit.cells.length : 0
}

// ── Insertion ─────────────────────────────────────────────────────────────────

/**
 * Drops one cube into `cell`. If the cell is taken, the machine shoves: the
 * cube there, and every cube touching it in the travel direction, moves one
 * cell along into the first gap ahead. Returns false only if the whole ring is
 * full, which `canRelease` prevents.
 */
function insertAt(
  state: GameState, cell: number, color: CubeColor, events: ReleaseEvent[], order: number,
): boolean {
  const cells = state.cells
  const cap = cells.length

  if (cells[cell] !== null) {
    let gap = -1
    for (let j = 1; j < cap; j++) {
      if (cells[(cell + j) % cap] === null) { gap = j; break }
    }
    if (gap < 0) return false
    for (let k = gap; k >= 1; k--) {
      const to = (cell + k) % cap
      const from = (cell + k - 1) % cap
      const moving = cells[from]
      if (!moving) continue
      cells[to] = moving
      cells[from] = null
      events.push({ kind: 'shove', cubeId: moving.id, from, to })
    }
  }

  const cube: Cube = { id: `c${state.nextCubeId++}`, color }
  cells[cell] = cube
  events.push({ kind: 'land', cubeId: cube.id, color, cell, order })
  return true
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Clears every run at or over the match size, longest first so a five-in-a-row
 * pops as one satisfying group rather than as a three plus leftovers.
 *
 * Runs again after each clear, but clearing never joins two groups (the cubes
 * do not move), so this settles immediately. It loops only to catch a batch
 * that completed two separate matches at once.
 */
function resolveMatches(state: GameState, events: ReleaseEvent[]): void {
  const need = matchSizeOf(state)
  let order = 0
  for (;;) {
    const hits = findRuns(state)
      .filter(r => r.cells.length >= need)
      .sort((a, b) => b.cells.length - a.cells.length)
    const hit = hits[0]
    if (!hit) return

    const cubeIds: string[] = []
    for (const i of hit.cells) {
      const c = state.cells[i]
      if (!c) continue
      cubeIds.push(c.id)
      state.cells[i] = null
    }
    state.clearedByColor[hit.color] += cubeIds.length
    state.totalCleared += cubeIds.length
    state.matches += 1
    events.push({
      kind: 'clear',
      cubeIds,
      color: hit.color,
      cells: hit.cells,
      size: cubeIds.length,
      order,
    })
    order++
  }
}

// ── State construction ────────────────────────────────────────────────────────

function makeBatch(cubes: CubeColor[], index: number): Batch {
  return { id: `b${index}`, cubes: [...cubes] }
}

function refillOffer(state: GameState): void {
  const level = state.level
  while (state.offered.length < level.offerCount && state.queueIndex < level.batchQueue.length) {
    state.offered.push(makeBatch(level.batchQueue[state.queueIndex], state.queueIndex))
    state.queueIndex++
  }
}

export function createGame(level: LoopSortLevel): GameState {
  const cap = effectiveCapacity(level.capacity)
  const cells: (Cube | null)[] = new Array(cap).fill(null)
  let nextCubeId = 0

  for (let i = 0; i < Math.min(level.initialBelt.length, cap); i++) {
    const color = level.initialBelt[i]
    if (!color) continue
    cells[i] = { id: `c${nextCubeId++}`, color }
  }

  const state: GameState = {
    level,
    cells,
    rotation: 0,
    offered: [],
    queueIndex: 0,
    clearedByColor: { red: 0, blue: 0, green: 0, yellow: 0 },
    totalCleared: 0,
    matches: 0,
    picks: 0,
    phase: 'RUNNING',
    nextCubeId,
  }
  refillOffer(state)
  return state
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isComplete(state: GameState): boolean {
  return state.level.goal.every(g => state.clearedByColor[g.color] >= g.count)
}

/** Goal progress 0..1 across every colour, for the HUD ring. */
export function goalProgress(state: GameState): number {
  const goals = state.level.goal
  if (goals.length === 0) return 0
  let got = 0
  let want = 0
  for (const g of goals) {
    got += Math.min(state.clearedByColor[g.color], g.count)
    want += g.count
  }
  return want > 0 ? got / want : 0
}

/**
 * Sends one batch onto the belt, landing its cubes in consecutive cells
 * starting at whichever cell is under the chute *at this instant*.
 *
 * The whole batch is placed before matches are checked, so a batch reads as one
 * object with one outcome — which is what makes "if I send this now, those two
 * will connect" a prediction the player can actually make.
 */
export function releaseBatch(state: GameState, batchId: string): ReleaseEvent[] {
  const events: ReleaseEvent[] = []
  if (state.phase !== 'RUNNING') return events

  const idx = state.offered.findIndex(b => b.id === batchId)
  if (idx < 0) return events
  const batch = state.offered[idx]
  if (!canRelease(state, batch)) return events

  state.offered.splice(idx, 1)
  refillOffer(state)
  state.picks++

  const cap = state.cells.length
  const start = intakeCell(state)
  for (let j = 0; j < batch.cubes.length; j++) {
    if (!insertAt(state, (start + j) % cap, batch.cubes[j], events, j)) break
  }

  resolveMatches(state, events)
  evaluate(state, events)
  return events
}

/**
 * Decides whether the level is over. Failure is always one of two readable
 * sentences: the belt has no room for anything you were offered, or the offer
 * ran dry before the goal was met.
 */
export function evaluate(state: GameState, events: ReleaseEvent[]): void {
  if (state.phase !== 'RUNNING') return

  if (isComplete(state)) {
    state.phase = 'LEVEL_COMPLETE'
    events.push({ kind: 'complete' })
    return
  }
  if (state.offered.length === 0) {
    state.phase = 'LEVEL_FAILED'
    state.failReason = 'outOfBatches'
    events.push({ kind: 'fail', reason: 'outOfBatches' })
    return
  }
  if (!state.offered.some(b => canRelease(state, b))) {
    state.phase = 'LEVEL_FAILED'
    state.failReason = 'full'
    events.push({ kind: 'fail', reason: 'full' })
  }
}

/** Compact belt readout for the debug overlay. `.` is an empty cell. */
export function describeBelt(state: GameState): string {
  return state.cells.map(c => (c ? c.color[0] : '.')).join('')
}
