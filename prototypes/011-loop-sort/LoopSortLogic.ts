// Loop Sort DNA — pure logic. No Phaser. Deterministic: same level + same
// batch order always produces the same state and the same event log.
//
// BELT MODEL
//   A fixed array of `capacity` cells. Cubes compact toward index 0, but three
//   things act as hard dividers and split the belt into segments:
//     - a cell covered by a CLOSED curtain (unusable)
//     - a FROZEN (ice) cube, which never moves and blocks movement past it
//     - a LOCKED barrier, which sits between two cells
//   Cubes compact toward the low end of their own segment and never cross a
//   divider. Runs are contiguous same-colour cubes within one segment.

import type {
  Batch,
  Cube,
  CubeColor,
  GameState,
  LoopSortLevel,
  Obstacle,
  ResolveEvent,
} from './LoopSortTypes'

interface Segment { start: number; end: number }
interface Run { color: CubeColor; start: number; end: number }

// ── Segments ──────────────────────────────────────────────────────────────────

function isCurtained(state: GameState, i: number): boolean {
  return state.obstacles.some(
    o => o.kind === 'curtain' && !o.open && i >= o.from && i <= o.to,
  )
}

function isDivider(state: GameState, i: number): boolean {
  if (isCurtained(state, i)) return true
  const c = state.cells[i]
  return c !== null && c !== undefined && c.frozen
}

function barrierLockedAt(state: GameState, i: number): boolean {
  return state.obstacles.some(o => o.kind === 'barrier' && o.locked && o.at === i)
}

function segments(state: GameState): Segment[] {
  const out: Segment[] = []
  let cur: Segment | null = null
  const push = (): void => { if (cur) { out.push(cur); cur = null } }

  for (let i = 0; i < state.cells.length; i++) {
    if (barrierLockedAt(state, i)) push()
    if (isDivider(state, i)) { push(); continue }
    if (cur === null) cur = { start: i, end: i }
    else cur.end = i
  }
  push()
  return out
}

// ── Compaction ────────────────────────────────────────────────────────────────

/** Packs each segment's cubes toward its low end, emitting a shift per move. */
function compact(state: GameState, events: ResolveEvent[]): void {
  for (const seg of segments(state)) {
    const picked: Array<{ cube: Cube; from: number }> = []
    for (let i = seg.start; i <= seg.end; i++) {
      const c = state.cells[i]
      if (c) { picked.push({ cube: c, from: i }); state.cells[i] = null }
    }
    for (let k = 0; k < picked.length; k++) {
      const to = seg.start + k
      state.cells[to] = picked[k].cube
      if (picked[k].from !== to) {
        events.push({ kind: 'shift', cubeId: picked[k].cube.id, from: picked[k].from, to })
      }
    }
  }
}

// ── Runs ──────────────────────────────────────────────────────────────────────

function findRuns(state: GameState): Run[] {
  const runs: Run[] = []
  for (const seg of segments(state)) {
    let i = seg.start
    while (i <= seg.end) {
      const c = state.cells[i]
      if (!c) { i++; continue }
      let j = i
      while (j + 1 <= seg.end) {
        const n = state.cells[j + 1]
        if (n && n.color === c.color) j++
        else break
      }
      runs.push({ color: c.color, start: i, end: j })
      i = j + 1
    }
  }
  return runs
}

function firstFreeIn(state: GameState, seg: Segment): number {
  for (let i = seg.start; i <= seg.end; i++) if (!state.cells[i]) return i
  return -1
}

/** First free cell at or after `from` within `seg`. -1 if the tail is full. */
function firstFreeFrom(state: GameState, seg: Segment, from: number): number {
  for (let i = Math.max(from, seg.start); i <= seg.end; i++) {
    if (!state.cells[i]) return i
  }
  return -1
}

// ── Routing ───────────────────────────────────────────────────────────────────
//
// Place one incoming cube of colour C:
//   1. Among all runs of C, take the LONGEST; ties break to the LOWEST start.
//   2. Insert immediately after that run, shifting the rest of the segment up.
//   3. If C has no run (or its segment is full), append at the first free cell,
//      scanning segments from index 0.
//   4. If no segment has a free cell, the placement fails — that is the loss.

function insertCube(state: GameState, color: CubeColor, events: ResolveEvent[]): boolean {
  const segs = segments(state)

  let best: Run | null = null
  for (const r of findRuns(state)) {
    if (r.color !== color) continue
    if (best === null) { best = r; continue }
    const len = r.end - r.start + 1
    const bestLen = best.end - best.start + 1
    if (len > bestLen || (len === bestLen && r.start < best.start)) best = r
  }

  // `free` must be at or after `target`, otherwise shifting would overwrite a
  // cube sitting below the insertion point on a not-yet-compacted belt.
  let target = -1
  let free = -1
  if (best !== null) {
    const chosen = best
    const seg = segs.find(s => chosen.start >= s.start && chosen.end <= s.end)
    if (seg) {
      const f = firstFreeFrom(state, seg, chosen.end + 1)
      if (f >= 0) { target = chosen.end + 1; free = f }
    }
  }
  if (target < 0) {
    for (const s of segs) {
      const f = firstFreeIn(state, s)
      if (f >= 0) { target = f; free = f; break }
    }
  }
  if (target < 0) {
    events.push({ kind: 'fail', reason: 'full' })
    return false
  }

  for (let i = free - 1; i >= target; i--) {
    const c = state.cells[i]
    if (!c) continue
    state.cells[i + 1] = c
    state.cells[i] = null
    events.push({ kind: 'shift', cubeId: c.id, from: i, to: i + 1 })
  }

  const cube: Cube = { id: `c${state.nextCubeId++}`, color, frozen: false }
  state.cells[target] = cube
  events.push({ kind: 'insert', cubeId: cube.id, color, slot: target })
  return true
}

// ── Matching and chains ───────────────────────────────────────────────────────

/** Clears runs >= matchSize repeatedly until stable. Returns the next chain index. */
function resolveMatches(state: GameState, events: ResolveEvent[], chainFrom: number): number {
  let chainIndex = chainFrom
  for (;;) {
    compact(state, events)
    const hit = findRuns(state).find(r => r.end - r.start + 1 >= state.level.matchSize)
    if (!hit) return chainIndex

    const cubeIds: string[] = []
    const slots: number[] = []
    for (let i = hit.start; i <= hit.end; i++) {
      const c = state.cells[i]
      if (!c) continue
      cubeIds.push(c.id)
      slots.push(i)
      state.cells[i] = null
    }
    state.clearedByColor[hit.color] += cubeIds.length
    state.totalClears += 1
    events.push({ kind: 'clear', cubeIds, color: hit.color, slots, chainIndex })
    chainIndex++
  }
}

// ── Obstacles ─────────────────────────────────────────────────────────────────

/** Returns true if the board changed in a way that can produce new matches. */
function resolveObstacles(state: GameState, events: ResolveEvent[]): boolean {
  let changed = false
  for (const o of state.obstacles) {
    if (o.kind === 'curtain') {
      if (!o.open && state.clearedByColor[o.requiredColor] >= o.requiredCount) {
        o.open = true
        events.push({ kind: 'obstacle', obstacleId: o.id, became: 'open' })
        changed = true
      }
    } else if (o.kind === 'ice') {
      if (!o.thawed && state.clearedByColor[o.requiredColor] >= o.requiredCount) {
        o.thawed = true
        const c = state.cells[o.slot]
        if (c) c.frozen = false
        events.push({ kind: 'obstacle', obstacleId: o.id, became: 'broken' })
        changed = true
      }
    } else if (o.kind === 'barrier') {
      if (o.locked && state.clearedByColor[o.requiredColor] >= o.requiredCount) {
        o.locked = false
        events.push({ kind: 'obstacle', obstacleId: o.id, became: 'unlocked' })
        changed = true
      }
    } else {
      // hidden — information only, never changes the logical board
      if (!o.revealed && state.totalClears >= o.revealAfterClears) {
        o.revealed = true
        events.push({ kind: 'obstacle', obstacleId: o.id, became: 'revealed' })
      }
    }
  }
  return changed
}

// ── State construction ────────────────────────────────────────────────────────

function makeBatch(cubes: CubeColor[], index: number): Batch {
  return { id: `b${index}`, cubes: [...cubes] }
}

function cloneState(s: GameState): GameState {
  return {
    level: s.level,
    cells: s.cells.map(c => (c ? { ...c } : null)),
    obstacles: s.obstacles.map(o => ({ ...o }) as Obstacle),
    offered: s.offered.map(b => ({ id: b.id, cubes: [...b.cubes] })),
    queueIndex: s.queueIndex,
    clearedByColor: { ...s.clearedByColor },
    totalClears: s.totalClears,
    picks: s.picks,
    phase: s.phase,
    nextCubeId: s.nextCubeId,
  }
}

export function createGame(level: LoopSortLevel): GameState {
  const cells: (Cube | null)[] = new Array(level.capacity).fill(null)
  let nextCubeId = 0

  const iceSlots = new Set(
    level.obstacles.filter(o => o.kind === 'ice').map(o => (o as { slot: number }).slot),
  )

  for (let i = 0; i < Math.min(level.initialBelt.length, level.capacity); i++) {
    const color = level.initialBelt[i]
    if (!color) continue
    cells[i] = { id: `c${nextCubeId++}`, color, frozen: iceSlots.has(i) }
  }

  const offered: Batch[] = []
  let queueIndex = 0
  while (offered.length < level.offerCount && queueIndex < level.batchQueue.length) {
    offered.push(makeBatch(level.batchQueue[queueIndex], queueIndex))
    queueIndex++
  }

  return {
    level,
    cells,
    obstacles: level.obstacles.map(o => ({ ...o }) as Obstacle),
    offered,
    queueIndex,
    clearedByColor: { red: 0, blue: 0, green: 0, yellow: 0 },
    totalClears: 0,
    picks: 0,
    phase: 'WAITING_FOR_INPUT',
    nextCubeId,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isComplete(state: GameState): boolean {
  return state.level.goal.every(g => state.clearedByColor[g.color] >= g.count)
}

export function isFailed(state: GameState): boolean {
  return state.phase === 'LEVEL_FAILED'
}

/**
 * Sends one batch. Cubes enter one at a time in array order, each fully
 * resolving (matches, chains, obstacles) before the next — that ordering is
 * what makes a batch's outcome predictable, and therefore a real decision.
 */
export function selectBatch(
  state: GameState,
  batchId: string,
): { next: GameState; events: ResolveEvent[] } {
  const events: ResolveEvent[] = []
  const next = cloneState(state)

  if (next.phase === 'LEVEL_COMPLETE' || next.phase === 'LEVEL_FAILED') {
    return { next, events }
  }
  const idx = next.offered.findIndex(b => b.id === batchId)
  if (idx < 0) return { next, events }

  const batch = next.offered[idx]
  next.offered.splice(idx, 1)
  if (next.queueIndex < next.level.batchQueue.length) {
    next.offered.push(makeBatch(next.level.batchQueue[next.queueIndex], next.queueIndex))
    next.queueIndex++
  }
  next.picks++

  let chain = 0
  for (const color of batch.cubes) {
    if (!insertCube(next, color, events)) {
      next.phase = 'LEVEL_FAILED'
      return { next, events }
    }
    for (;;) {
      chain = resolveMatches(next, events, chain)
      if (!resolveObstacles(next, events)) break
    }
  }
  compact(next, events)

  if (isComplete(next)) {
    next.phase = 'LEVEL_COMPLETE'
    events.push({ kind: 'complete' })
  } else if (next.offered.length === 0) {
    next.phase = 'LEVEL_FAILED'
    events.push({ kind: 'fail', reason: 'outOfBatches' })
  } else {
    next.phase = 'WAITING_FOR_INPUT'
  }

  return { next, events }
}

/** Occupied cell count — the "how full am I" readout for the HUD. */
export function occupiedCount(state: GameState): number {
  return state.cells.reduce<number>((n, c) => n + (c ? 1 : 0), 0)
}

/** Usable cell count, i.e. capacity minus cells under a closed curtain. */
export function usableCapacity(state: GameState): number {
  let n = 0
  for (let i = 0; i < state.cells.length; i++) if (!isCurtained(state, i)) n++
  return n
}

/** Stable serialisation — used for search memoisation and determinism checks. */
export function stateKey(state: GameState): string {
  const belt = state.cells
    .map(c => (c ? `${c.color[0]}${c.frozen ? '*' : ''}` : '.'))
    .join('')
  const obs = state.obstacles
    .map(o => {
      if (o.kind === 'curtain') return `c${o.id}:${o.open ? 1 : 0}`
      if (o.kind === 'ice') return `i${o.id}:${o.thawed ? 1 : 0}`
      if (o.kind === 'barrier') return `b${o.id}:${o.locked ? 1 : 0}`
      return `h${o.id}:${o.revealed ? 1 : 0}`
    })
    .join(',')
  const offer = state.offered.map(b => b.cubes.join('')).join('|')
  const cleared = `${state.clearedByColor.red},${state.clearedByColor.blue},${state.clearedByColor.green},${state.clearedByColor.yellow}`
  return `${belt}#${obs}#${offer}#${state.queueIndex}#${cleared}#${state.phase}`
}
