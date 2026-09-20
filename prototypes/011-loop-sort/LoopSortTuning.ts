// Loop Sort — the experiment dial board.
//
// Everything worth changing while playtesting lives here, in one mutable
// object. Nothing downstream hard-codes a speed, a delay or a size; the scene
// and the logic both read `tuning` at the moment they need a value, so an edit
// here (or a debug key at runtime) takes effect on the next level load with no
// other change.
//
// This is deliberately a plain object and not a config framework. It is a
// prototype's tuning sheet: seven numbers, one override hook, no schema.

import type { CubeColor } from './LoopSortTypes'

export interface Tuning {
  /**
   * Multiplier on each level's authored belt speed (cells/second). The debug
   * keys move this, which is how "watch it at 0.25x" works without touching
   * level data.
   */
  speedScale: number
  /** Added to every level's capacity. Negative squeezes the whole game. */
  capacityBonus: number
  /** 0 = use the level's matchSize. Any other value overrides every level. */
  matchSizeOverride: number
  /** Gap between two cubes of the same batch arriving, in ms. */
  entryStagger: number
  /** Held beat between "they connected" and "they pop". */
  matchDelay: number
  /**
   * How fast a cube's drawn position catches up to its logical cell after a
   * shove, as an exponential rate (higher = snappier). This is the only thing
   * standing between the belt and visible teleporting.
   */
  slideRate: number
  /** Belt travel is paused while true. Debug only — normal play never sets it. */
  paused: boolean
}

export const tuning: Tuning = {
  speedScale: 1,
  capacityBonus: 0,
  matchSizeOverride: 0,
  entryStagger: 105,
  matchDelay: 150,
  slideRate: 13,
  paused: false,
}

/** Speeds the debug controls cycle through. 1 is the authored speed. */
export const SPEED_STEPS = [1, 0.5, 0.25, 1.5] as const

export function effectiveSpeed(levelSpeed: number): number {
  return tuning.paused ? 0 : levelSpeed * tuning.speedScale
}

export function effectiveCapacity(levelCapacity: number): number {
  return Math.max(6, levelCapacity + tuning.capacityBonus)
}

export function effectiveMatchSize(levelMatchSize: number): number {
  return tuning.matchSizeOverride > 0 ? tuning.matchSizeOverride : levelMatchSize
}

/** Colour order used by the HUD so goal chips never reshuffle between levels. */
export const COLOR_ORDER: readonly CubeColor[] = ['red', 'blue', 'green', 'yellow']
