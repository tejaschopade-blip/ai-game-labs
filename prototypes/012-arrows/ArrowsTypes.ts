// Arrows DNA — pure types. No Phaser, no runtime dependencies.
// Kept separate from the logic so the level set can be verified under plain node.

export type Dir = 'up' | 'down' | 'left' | 'right'

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right']

/** Column/row step for each direction. Row 0 is the top of the board. */
export const STEP: Record<Dir, { dc: number; dr: number }> = {
  up:    { dc:  0, dr: -1 },
  down:  { dc:  0, dr:  1 },
  left:  { dc: -1, dr:  0 },
  right: { dc:  1, dr:  0 },
}

/**
 * A board coordinate. Structural, so everything that already returns
 * `{ col, row }` satisfies it — added for the presentation layer to name paths
 * with; the logic is unchanged.
 */
export interface Cell { col: number; row: number }

export interface Arrow {
  id: string
  dir: Dir
  col: number
  row: number
}

export interface Board {
  cols: number
  rows: number
  arrows: Arrow[]
}

export interface ArrowsLevel {
  id: number
  name: string
  teaches: string
  /** One string per row. '>', '<', '^', 'v' are arrows; '.' is empty. */
  rows: string[]
}

/**
 * What a tap did.
 *
 *   exit    — the runway was clear; the arrow flew off the board
 *   blocked — something stands between the arrow and the edge
 *   nudge   — blocked, but `rules.blockedTap === 'nudge'`, so it slid as far as
 *             it could and stopped behind the blocker
 *   none    — no arrow with that id
 */
export type TapResult =
  | { kind: 'exit'; arrow: Arrow; path: Array<{ col: number; row: number }> }
  | { kind: 'blocked'; arrow: Arrow; blocker: Arrow }
  | { kind: 'nudge'; arrow: Arrow; blocker: Arrow; to: { col: number; row: number } }
  | { kind: 'none' }
