// Loop Sort — ten levels, hand-authored.
//
// Ten, not fifty. Every one exists to ask a different question about the same
// mechanic, and the set is short enough to replay end-to-end in a playtest.
//
// READING THE DATA
//   belt('rr..bb......')  is the ring at level start; '.' is an empty cell and
//                         the string length is the capacity.
//   q('r', 'bb', 'rb')    is the batch queue, consumed in order. Deterministic —
//                         nothing here is shuffled or generated, so a level
//                         plays the same way twice and can actually be tuned.
//
// ONE AUTHORING RULE
//   No initial belt contains three touching cubes of one colour. Matches are
//   only ever resolved by a release, so a pre-made match would sit there until
//   the player's first tap and then pop for no reason they can see.

import type { CubeColor, LoopSortLevel } from './LoopSortTypes'

const CH: Record<string, CubeColor | null> = {
  r: 'red', b: 'blue', g: 'green', y: 'yellow', '.': null,
}

function belt(s: string): (CubeColor | null)[] {
  return [...s].map(ch => CH[ch] ?? null)
}

function q(...rows: string[]): CubeColor[][] {
  return rows.map(row => [...row].map(ch => CH[ch] as CubeColor))
}

export const LEVELS: LoopSortLevel[] = [
  {
    id: 1,
    name: 'First Loop',
    teaches: 'Tap a batch, a cube joins the belt, three touching pop.',
    capacity: 12,
    matchSize: 3,
    speed: 0.7,
    offerCount: 3,
    initialBelt: belt('r.r.........'),
    batchQueue: q('r', 'b', 'r', 'r', 'b'),
    goal: [{ color: 'red', count: 3 }],
  },
  {
    id: 2,
    name: 'Two Trains',
    teaches: 'A batch lands as one piece — aim the pair, not a cube.',
    capacity: 12,
    matchSize: 3,
    speed: 0.75,
    offerCount: 3,
    initialBelt: belt('r..r..b..b..'),
    batchQueue: q('rr', 'bb', 'r', 'b', 'rb', 'br'),
    goal: [{ color: 'red', count: 3 }, { color: 'blue', count: 3 }],
  },
  {
    id: 3,
    name: 'Mind the Gap',
    teaches: 'Single cells between singles. Land in the gap, not beside it.',
    capacity: 12,
    matchSize: 3,
    speed: 0.8,
    offerCount: 3,
    initialBelt: belt('r.r.b.b.g.g.'),
    batchQueue: q('r', 'b', 'rr', 'bb', 'r', 'b', 'gg', 'rb', 'br', 'rr', 'bb'),
    goal: [{ color: 'red', count: 6 }, { color: 'blue', count: 6 }],
  },
  {
    id: 4,
    name: 'Three Colours',
    teaches: 'Three colours competing for the same cells.',
    capacity: 13,
    matchSize: 3,
    speed: 0.85,
    offerCount: 3,
    initialBelt: belt('r.b.g.r.b.g..'),
    batchQueue: q('rr', 'bb', 'gg', 'r', 'b', 'g', 'rb', 'gr', 'bg', 'rr', 'bb', 'g', 'r', 'b'),
    goal: [
      { color: 'red', count: 6 }, { color: 'blue', count: 6 }, { color: 'green', count: 3 },
    ],
  },
  {
    id: 5,
    name: 'Tight Belt',
    teaches: 'Ten cells. A two-cube batch you cannot cash in is two cells gone.',
    capacity: 10,
    matchSize: 3,
    speed: 0.85,
    offerCount: 3,
    initialBelt: belt('r.r.b.b.g.'),
    batchQueue: q('rb', 'r', 'b', 'gg', 'r', 'b', 'rb', 'r', 'b', 'rr', 'bb'),
    goal: [{ color: 'red', count: 6 }, { color: 'blue', count: 6 }],
  },
  {
    id: 6,
    name: 'Faster Loop',
    teaches: 'Same puzzle, more speed. The seam arrives sooner than you expect.',
    capacity: 12,
    matchSize: 3,
    speed: 1.2,
    offerCount: 3,
    initialBelt: belt('r.r.b.b.g.g.'),
    batchQueue: q('r', 'b', 'g', 'rb', 'g', 'r', 'bg', 'r', 'b', 'gg', 'rr', 'bb', 'g'),
    goal: [
      { color: 'red', count: 6 }, { color: 'blue', count: 6 }, { color: 'green', count: 6 },
    ],
  },
  {
    id: 7,
    name: 'Wait For It',
    teaches: 'Two offers, four free cells. The belt will bring you the cell you need.',
    capacity: 12,
    matchSize: 3,
    speed: 0.9,
    offerCount: 2,
    initialBelt: belt('rr.bb.gg.yy.'),
    batchQueue: q('r', 'y', 'b', 'r', 'y', 'g', 'r', 'y', 'rr', 'yy', 'b', 'g'),
    goal: [{ color: 'red', count: 6 }, { color: 'yellow', count: 6 }],
  },
  {
    id: 8,
    name: 'Dead Weight',
    teaches: 'A batch no goal wants. Refuse it and it blocks an offer slot forever.',
    capacity: 12,
    matchSize: 3,
    speed: 0.9,
    offerCount: 3,
    initialBelt: belt('r.r.b.b.g.g.'),
    batchQueue: q('yy', 'r', 'b', 'g', 'y', 'rb', 'gg', 'r', 'b', 'yy', 'rr', 'bb', 'g', 'g'),
    goal: [
      { color: 'red', count: 6 }, { color: 'blue', count: 6 }, { color: 'green', count: 6 },
    ],
  },
  {
    id: 9,
    name: 'Two Chances',
    teaches: 'More matches are available than you have room to set up.',
    capacity: 13,
    matchSize: 3,
    speed: 0.95,
    offerCount: 3,
    initialBelt: belt('r.r.b.b.g.g.r'),
    batchQueue: q('r', 'rb', 'b', 'g', 'rr', 'g', 'b', 'r', 'gb', 'r', 'bb', 'gg', 'rr', 'b'),
    goal: [
      { color: 'red', count: 9 }, { color: 'blue', count: 6 }, { color: 'green', count: 6 },
    ],
  },
  {
    id: 10,
    name: 'The Machine',
    teaches: 'Four colours, a tight belt and a moving seam. Everything at once.',
    capacity: 12,
    matchSize: 3,
    speed: 1,
    offerCount: 3,
    initialBelt: belt('r.r.b.b.g.g.'),
    batchQueue: q('y', 'rb', 'g', 'y', 'r', 'bg', 'y', 'rb', 'g', 'rb', 'gy', 'yy', 'rr', 'bb', 'gg', 'y'),
    goal: [
      { color: 'red', count: 6 }, { color: 'blue', count: 6 },
      { color: 'green', count: 6 }, { color: 'yellow', count: 6 },
    ],
  },
]
