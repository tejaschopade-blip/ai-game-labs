// Arrows DNA — pure logic. No Phaser, no screen coordinates.
//
// THE RULE, IN ONE SENTENCE
//   An arrow leaves the board if every cell between it and the edge it points
//   at is empty; otherwise the first arrow in the way is the blocker.
//
// A NOTE ON THIS RULE THAT MATTERS MORE THAN THE CODE
//   Clearing an arrow only ever *empties* cells, so an arrow that is legal now
//   stays legal forever and the set of legal moves only grows. That makes the
//   rule confluent: if a board can be cleared at all, ANY order of legal taps
//   clears it, and no choice the player makes can create a dead end. See
//   README.md — it is the prototype's headline finding, and `rules.blockedTap`
//   exists so the alternative can be felt rather than argued about.

import { STEP } from './ArrowsTypes'
import type { Arrow, ArrowsLevel, Board, Dir, TapResult } from './ArrowsTypes'

/**
 * The one experiment dial.
 *
 *   reject — a blocked tap does nothing but complain. The mechanic exactly as
 *            specified, and the default.
 *   nudge  — a blocked arrow slides as far as it can and stops behind the
 *            blocker. Board state changes, so a tap can make things worse and
 *            ordering starts to matter.
 */
export const rules: { blockedTap: 'reject' | 'nudge' } = { blockedTap: 'reject' }

const CHAR_TO_DIR: Record<string, Dir | undefined> = {
  '>': 'right', '<': 'left', '^': 'up', 'v': 'down',
}

const DIR_TO_CHAR: Record<Dir, string> = {
  right: '>', left: '<', up: '^', down: 'v',
}

// ── Construction ──────────────────────────────────────────────────────────────

export function parseLevel(level: ArrowsLevel): Board {
  const rows = level.rows
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0)
  const arrows: Arrow[] = []
  let next = 0

  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const dir = CHAR_TO_DIR[line[col]]
      if (dir) arrows.push({ id: `a${next++}`, dir, col, row })
    }
  })

  return { cols, rows: rows.length, arrows }
}

export function cloneBoard(b: Board): Board {
  return { cols: b.cols, rows: b.rows, arrows: b.arrows.map(a => ({ ...a })) }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function arrowAt(board: Board, col: number, row: number): Arrow | undefined {
  return board.arrows.find(a => a.col === col && a.row === row)
}

export function arrowById(board: Board, id: string): Arrow | undefined {
  return board.arrows.find(a => a.id === id)
}

/** Every cell from just in front of `arrow` to the edge, in travel order. */
export function runway(board: Board, arrow: Arrow): Array<{ col: number; row: number }> {
  const { dc, dr } = STEP[arrow.dir]
  const cells: Array<{ col: number; row: number }> = []
  let col = arrow.col + dc
  let row = arrow.row + dr
  while (col >= 0 && col < board.cols && row >= 0 && row < board.rows) {
    cells.push({ col, row })
    col += dc
    row += dr
  }
  return cells
}

/** The first arrow standing in this arrow's way, or undefined if the run is clear. */
export function blockerOf(board: Board, arrow: Arrow): Arrow | undefined {
  for (const c of runway(board, arrow)) {
    const hit = arrowAt(board, c.col, c.row)
    if (hit) return hit
  }
  return undefined
}

export function canExit(board: Board, arrow: Arrow): boolean {
  return blockerOf(board, arrow) === undefined
}

/** Every arrow that could leave right now. The player's search space. */
export function legalArrows(board: Board): Arrow[] {
  return board.arrows.filter(a => canExit(board, a))
}

export function isComplete(board: Board): boolean {
  return board.arrows.length === 0
}

/** Arrows remain but none of them can move. */
export function isStuck(board: Board): boolean {
  return board.arrows.length > 0 && legalArrows(board).length === 0
}

// ── The move ──────────────────────────────────────────────────────────────────

/**
 * Taps one arrow. Returns the resulting board and what happened; the input
 * board is never modified, so the scene can animate from the old state to the
 * new one without racing the logic.
 */
export function tap(board: Board, id: string): { next: Board; result: TapResult } {
  const arrow = arrowById(board, id)
  if (!arrow) return { next: board, result: { kind: 'none' } }

  const blocker = blockerOf(board, arrow)

  if (!blocker) {
    const next = cloneBoard(board)
    next.arrows = next.arrows.filter(a => a.id !== id)
    return { next, result: { kind: 'exit', arrow: { ...arrow }, path: runway(board, arrow) } }
  }

  if (rules.blockedTap === 'nudge') {
    const { dc, dr } = STEP[arrow.dir]
    const to = { col: blocker.col - dc, row: blocker.row - dr }
    // Already touching the blocker — there is nowhere to slide to.
    if (to.col !== arrow.col || to.row !== arrow.row) {
      const next = cloneBoard(board)
      const moved = arrowById(next, id)
      if (moved) { moved.col = to.col; moved.row = to.row }
      return { next, result: { kind: 'nudge', arrow: { ...arrow }, blocker: { ...blocker }, to } }
    }
  }

  return { next: board, result: { kind: 'blocked', arrow: { ...arrow }, blocker: { ...blocker } } }
}

// ── Debug ─────────────────────────────────────────────────────────────────────

/** The board as the level files write it. Used by the debug overlay and tests. */
export function describeBoard(board: Board): string {
  const grid: string[][] = []
  for (let r = 0; r < board.rows; r++) grid.push(new Array(board.cols).fill('.'))
  for (const a of board.arrows) grid[a.row][a.col] = DIR_TO_CHAR[a.dir]
  return grid.map(r => r.join('')).join('/')
}
