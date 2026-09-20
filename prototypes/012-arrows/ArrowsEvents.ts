// Arrows — the presentation contract.
//
// The seam between "what happened" and "how it looks". ArrowsLogic speaks in
// TapResult: exit / blocked / nudge / none. That vocabulary is about *rules*,
// and it is the wrong thing to hand to a renderer — 'exit' says nothing about
// how many things must now animate, or that the board just became empty.
//
// This file translates one tap into the list of things the player should see,
// in order. It is pure: no Phaser, no scene, no tween, no colour. Which means
//
//   * the logic never learns that a renderer exists,
//   * the renderer never learns how the rule is decided,
//   * and the art style can be replaced by rewriting ArrowsView alone.
//
// Deliberately NOT here: durations, easings, colours, particle counts. Those
// are presentation decisions and live in ArrowsTheme / ArrowsView. An event
// says what occurred, never how loud it was.

import { blockerOf, isComplete, isStuck, runway } from './ArrowsLogic'
import type { Arrow, Board, Cell, TapResult } from './ArrowsTypes'

export type ArrowsEvent =
  /** A level's board exists and should be shown. */
  | { type: 'BOARD_BUILT'; board: Board }
  /**
   * The player is holding an arrow and has not committed yet. `blockedAt` is
   * the index into `path` of the first occupied cell, or -1 when the run is
   * clear — everything a runway preview needs, resolved once, here.
   */
  | { type: 'ARROW_FOCUSED'; arrow: Arrow; path: Cell[]; blockedAt: number }
  /** The hold ended — by release, by cancel, or because the tap resolved. */
  | { type: 'FOCUS_CLEARED' }
  /** The runway was clear: this arrow leaves along `path` and is gone. */
  | { type: 'ARROW_EXIT'; arrow: Arrow; path: Cell[] }
  /** Refused: `blocker` stands in the way. Nothing about the board changed. */
  | { type: 'ARROW_BLOCKED'; arrow: Arrow; blocker: Arrow }
  /** `rules.blockedTap === 'nudge'`: slid forward and stopped behind `blocker`. */
  | { type: 'ARROW_NUDGED'; arrow: Arrow; blocker: Arrow; to: Cell }
  /** Always emitted after a tap that changed anything. Drives the HUD. */
  | { type: 'BOARD_CHANGED'; remaining: number }
  /** The board is empty. */
  | { type: 'LEVEL_COMPLETE' }
  /** Arrows remain and none of them can move. Only reachable under 'nudge'. */
  | { type: 'LEVEL_STUCK' }

/**
 * What the player is holding right now.
 *
 * Split out from the tap itself because a press and a release are two separate
 * moments: the preview must appear on pointer-down, while `tap` must not run
 * until release (see docs/presentation.md — firing on press removes the
 * player's ability to slide off and cancel).
 */
export function focusEvent(board: Board, arrow: Arrow): ArrowsEvent {
  const path = runway(board, arrow)
  const blocker = blockerOf(board, arrow)
  const blockedAt = blocker
    ? path.findIndex(c => c.col === blocker.col && c.row === blocker.row)
    : -1
  return { type: 'ARROW_FOCUSED', arrow, path, blockedAt }
}

/**
 * One tap, as a sequence of things to show.
 *
 * `after` is the board the logic returned. It is passed in rather than derived
 * so that "the level is over" is decided by the same authority that decided the
 * move — this file never re-implements a rule.
 */
export function tapEvents(result: TapResult, after: Board): ArrowsEvent[] {
  const events: ArrowsEvent[] = [{ type: 'FOCUS_CLEARED' }]

  switch (result.kind) {
    case 'exit':
      events.push({ type: 'ARROW_EXIT', arrow: result.arrow, path: result.path })
      break
    case 'blocked':
      // No BOARD_CHANGED: a refused tap leaves the board exactly as it was, and
      // a HUD that flickers on a no-op reads as a bug.
      events.push({ type: 'ARROW_BLOCKED', arrow: result.arrow, blocker: result.blocker })
      return events
    case 'nudge':
      events.push({
        type: 'ARROW_NUDGED', arrow: result.arrow, blocker: result.blocker, to: result.to,
      })
      break
    case 'none':
      return events
  }

  events.push({ type: 'BOARD_CHANGED', remaining: after.arrows.length })
  if (isComplete(after)) events.push({ type: 'LEVEL_COMPLETE' })
  else if (isStuck(after)) events.push({ type: 'LEVEL_STUCK' })

  return events
}
