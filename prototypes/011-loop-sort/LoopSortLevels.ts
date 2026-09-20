// Loop Sort DNA — 20 handcrafted levels. No generator, no Math.random().
// Every level is verified headlessly for solvability, failability and
// obstacle reachability (see README).
//
// Design notes:
//   - Levels 1-3 are tutorials and are intentionally UNLOSABLE.
//   - Levels 4-20 must all be losable, or the batch choice is not a decision.
//   - "Junk" colours (usually yellow) never reach matchSize, so they occupy a
//     cell permanently. That is the pressure that makes capacity matter.

import type { LoopSortLevel } from './LoopSortTypes'

const R = 'red' as const
const B = 'blue' as const
const G = 'green' as const
const Y = 'yellow' as const

export const LEVELS: LoopSortLevel[] = [
  // ── 1-3 · core loop: 2 colours, generous capacity, no obstacles ────────────
  {
    id: 1,
    name: 'First Delivery',
    teaches: 'Tap a batch, cubes enter, matching cubes clear.',
    matchSize: 3,
    capacity: 10,
    offerCount: 2,
    initialBelt: [],
    batchQueue: [[R, R], [B, B], [R], [B]],
    obstacles: [],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }],
  },
  {
    id: 2,
    name: 'They Find Each Other',
    teaches: 'Cubes route to their own colour, not to the end of the line.',
    matchSize: 3,
    capacity: 10,
    offerCount: 2,
    initialBelt: [R, R, B, B, R, R],
    batchQueue: [[G], [B]],
    obstacles: [],
    goal: [{ color: R, count: 4 }, { color: B, count: 3 }],
  },
  {
    id: 3,
    name: 'Leftovers',
    teaches: 'Cubes that never reach three sit on the belt forever.',
    matchSize: 3,
    capacity: 8,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[R, R], [B, B], [G], [Y], [R], [B], [G], [Y]],
    obstacles: [],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }],
  },

  // ── 4-6 · decisions: 3 colours, tighter capacity ───────────────────────────
  {
    id: 4,
    name: 'Three Ways',
    teaches: 'Spending space on junk early costs you the level later.',
    matchSize: 3,
    capacity: 7,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[R, R], [B, B], [G, G], [Y], [R], [B], [G], [Y]],
    obstacles: [],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 5,
    name: 'Tight Belt',
    teaches: 'Finish a colour before starting another.',
    matchSize: 3,
    capacity: 7,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[R, R], [B, B], [G], [Y], [R], [B], [G, G], [Y]],
    obstacles: [],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 6,
    name: 'Mixed Cargo',
    teaches: 'A mixed batch still sorts itself — read the whole batch.',
    matchSize: 3,
    capacity: 7,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[R, B], [R, B], [R, B], [G, G], [G], [Y], [Y]],
    obstacles: [],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },

  // ── 7-9 · curtain ──────────────────────────────────────────────────────────
  {
    id: 7,
    name: 'Behind the Curtain',
    teaches: 'Clearing the required colour opens new belt space.',
    matchSize: 3,
    capacity: 12,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[R, R], [R], [B, B], [G, G], [B], [G], [Y], [Y]],
    obstacles: [
      { kind: 'curtain', id: 'cur1', from: 6, to: 11, requiredColor: R, requiredCount: 3, open: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 8,
    name: 'Rent the Space',
    teaches: 'Open the curtain before the small belt fills up.',
    matchSize: 3,
    capacity: 12,
    offerCount: 3,
    initialBelt: [B, Y],
    batchQueue: [[R, R], [G, G], [R], [B, B], [G], [Y], [G], [B]],
    obstacles: [
      { kind: 'curtain', id: 'cur1', from: 5, to: 11, requiredColor: R, requiredCount: 3, open: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 9,
    name: 'Two Rooms',
    teaches: 'The curtain colour is not the goal colour — plan around it.',
    matchSize: 3,
    capacity: 12,
    offerCount: 3,
    initialBelt: [Y],
    batchQueue: [[G, G], [G], [R, R], [B, B], [R], [B], [Y], [R], [B]],
    obstacles: [
      { kind: 'curtain', id: 'cur1', from: 5, to: 11, requiredColor: G, requiredCount: 3, open: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },

  // ── 10-12 · ice ────────────────────────────────────────────────────────────
  {
    id: 10,
    name: 'Frozen Solid',
    teaches: 'Ice splits the belt and never matches until it thaws.',
    matchSize: 3,
    capacity: 10,
    offerCount: 3,
    initialBelt: [null, null, null, G],
    batchQueue: [[R, R], [R], [B, B], [B], [G, G], [Y]],
    obstacles: [
      { kind: 'ice', id: 'ice1', slot: 3, requiredColor: B, requiredCount: 3, thawed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 11,
    name: 'Thaw First',
    teaches: 'The small side of the ice fills fast — free it early.',
    matchSize: 3,
    capacity: 9,
    offerCount: 3,
    initialBelt: [null, null, G, null],
    batchQueue: [[B, B], [B], [R, R], [R], [G, G], [Y], [Y]],
    obstacles: [
      { kind: 'ice', id: 'ice1', slot: 2, requiredColor: B, requiredCount: 3, thawed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 12,
    name: 'Cold Storage',
    teaches: 'Ice plus a tight belt: order is everything.',
    matchSize: 3,
    capacity: 9,
    offerCount: 3,
    initialBelt: [R, null, null, G, null],
    batchQueue: [[B, B], [B], [R, R], [G, G], [Y], [R], [G]],
    obstacles: [
      { kind: 'ice', id: 'ice1', slot: 3, requiredColor: B, requiredCount: 3, thawed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },

  // ── 13-15 · barrier ────────────────────────────────────────────────────────
  {
    id: 13,
    name: 'One Way In',
    teaches: 'Cubes can enter the far side but cannot come back.',
    matchSize: 3,
    capacity: 10,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[R, R], [R], [B, B], [B], [G, G], [G], [Y]],
    obstacles: [
      { kind: 'barrier', id: 'bar1', at: 4, requiredColor: R, requiredCount: 3, locked: true },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 14,
    name: 'Split Shift',
    teaches: 'Stranding a pair on the far side wastes it.',
    matchSize: 3,
    capacity: 10,
    offerCount: 3,
    initialBelt: [Y],
    batchQueue: [[B, B], [B], [R, R], [R], [G, G], [G], [Y]],
    obstacles: [
      { kind: 'barrier', id: 'bar1', at: 4, requiredColor: B, requiredCount: 3, locked: true },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 15,
    name: 'Narrow Gate',
    teaches: 'Barrier plus capacity — the near side is only four cells.',
    matchSize: 3,
    capacity: 9,
    offerCount: 3,
    initialBelt: [],
    batchQueue: [[G, G], [G], [R, R], [B, B], [R], [B], [Y], [Y]],
    obstacles: [
      { kind: 'barrier', id: 'bar1', at: 4, requiredColor: G, requiredCount: 3, locked: true },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },

  // ── 16-18 · hidden ─────────────────────────────────────────────────────────
  {
    id: 16,
    name: 'Unmarked Crates',
    teaches: 'You start with cubes you cannot identify — clear once to see them.',
    matchSize: 3,
    capacity: 7,
    offerCount: 3,
    initialBelt: [Y, R, B],
    batchQueue: [[G, G], [G], [R, R], [B, B], [Y], [R], [B]],
    obstacles: [
      { kind: 'hidden', id: 'hid1', from: 0, to: 2, revealAfterClears: 1, revealed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 17,
    name: 'Blind Corner',
    teaches: 'Commit before you know — then adapt.',
    matchSize: 3,
    capacity: 7,
    offerCount: 3,
    initialBelt: [G, G, Y],
    batchQueue: [[R, R], [R], [B, B], [B], [G], [Y], [R]],
    obstacles: [
      { kind: 'hidden', id: 'hid1', from: 0, to: 2, revealAfterClears: 1, revealed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 18,
    name: 'Late Reveal',
    teaches: 'Information arrives after two clears, not one.',
    matchSize: 3,
    capacity: 7,
    offerCount: 3,
    initialBelt: [Y, B, G],
    batchQueue: [[R, R], [R], [B, B], [G, G], [Y], [B], [G]],
    obstacles: [
      { kind: 'hidden', id: 'hid1', from: 0, to: 2, revealAfterClears: 2, revealed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },

  // ── 19-20 · combinations ───────────────────────────────────────────────────
  {
    id: 19,
    name: 'Curtain and Ice',
    teaches: 'Two locks, one key colour each — which do you open first?',
    matchSize: 3,
    capacity: 12,
    offerCount: 3,
    initialBelt: [null, null, null, G],
    batchQueue: [[R, R], [R], [B, B], [B], [G, G], [Y], [Y], [G]],
    obstacles: [
      { kind: 'ice', id: 'ice1', slot: 3, requiredColor: R, requiredCount: 3, thawed: false },
      { kind: 'curtain', id: 'cur1', from: 7, to: 11, requiredColor: B, requiredCount: 3, open: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
  {
    id: 20,
    name: 'The Whole Machine',
    teaches: 'Barrier, curtain and hidden space at once.',
    matchSize: 3,
    capacity: 13,
    offerCount: 3,
    initialBelt: [null, null, null, null, null, G, Y],
    batchQueue: [[R, R], [R], [B, B], [B], [G, G], [Y], [G], [Y]],
    obstacles: [
      { kind: 'barrier', id: 'bar1', at: 5, requiredColor: R, requiredCount: 3, locked: true },
      { kind: 'curtain', id: 'cur1', from: 10, to: 12, requiredColor: B, requiredCount: 3, open: false },
      // The stranded pair behind the barrier is what you cannot identify.
      { kind: 'hidden', id: 'hid1', from: 5, to: 7, revealAfterClears: 1, revealed: false },
    ],
    goal: [{ color: R, count: 3 }, { color: B, count: 3 }, { color: G, count: 3 }],
  },
]

export function getLevel(id: number): LoopSortLevel {
  const lv = LEVELS.find(l => l.id === id)
  if (!lv) throw new Error(`Loop Sort: no level ${id}`)
  return lv
}
