// Arrows — ten handcrafted levels.
//
// READING THE DATA
//   '>' '<' '^' 'v'  an arrow pointing that way
//   '.'              an empty cell
//   Row 0 is the top. Every row string must be the same length.
//
// TWO AUTHORING RULES, BOTH LEARNED THE HARD WAY
//   1. Never place two arrows facing each other on the same line with nothing
//      between them that can clear first — they block each other forever and
//      the level is unsolvable from the start.
//   2. What makes a level hard is how FEW arrows are legal at once, not how
//      many arrows there are. A 24-arrow board with eight legal moves is easier
//      to read than a 9-arrow board with one.

import type { ArrowsLevel } from './ArrowsTypes'

export const LEVELS: ArrowsLevel[] = [
  {
    id: 1,
    name: 'Tap to Clear',
    teaches: 'Tap an arrow, it flies off the board.',
    rows: [
      '....',
      '.>..',
      '....',
      '..v.',
    ],
  },
  {
    id: 2,
    name: 'In the Way',
    teaches: 'An arrow with something in front of it cannot leave yet.',
    rows: [
      '..v.',
      '>.>.',
      '....',
      '....',
    ],
  },
  {
    id: 3,
    name: 'Single File',
    teaches: 'A line of arrows leaves from the front, one at a time.',
    rows: [
      '.....',
      '>>>..',
      '.....',
      '..^..',
      '.....',
    ],
  },
  {
    id: 4,
    name: 'Four Ways',
    teaches: 'All four directions at once — read the shape, not the colour.',
    rows: [
      '..^..',
      '..^..',
      '<<.>>',
      '..v..',
      '..v..',
    ],
  },
  {
    id: 5,
    name: 'One Thread',
    teaches: 'Exactly one arrow is free at a time. Find it.',
    rows: [
      '....<',
      '....^',
      '>...^',
      '....^',
      '....^',
    ],
  },
  {
    id: 6,
    name: 'Keystone',
    teaches: 'One arrow is holding up everything. Freeing it frees two more.',
    rows: [
      '......',
      '.>.v..',
      '......',
      '>..v..',
      '......',
      '^.....',
    ],
  },
  {
    id: 7,
    name: 'Looks Free',
    teaches: 'Sitting against an edge means nothing if you point the other way.',
    rows: [
      '>..v..',
      '...v..',
      '...v..',
      '...v..',
      '^.....',
      '.....<',
    ],
  },
  {
    id: 8,
    name: 'Gridlock',
    teaches: 'Thirteen arrows, and usually only one of them can move.',
    rows: [
      '....>.',
      '<v^.<.',
      '.v<.<.',
      '...v..',
      '.>.v..',
      '<..<..',
    ],
  },
  {
    id: 9,
    name: 'Long Game',
    teaches: 'Chains that only unlock once other chains have finished.',
    rows: [
      '...>^..',
      'v<....>',
      'v.v.^..',
      'v..vv^^',
      '.v.....',
      '...v...',
      'v<<<<..',
    ],
  },
  {
    id: 10,
    name: 'The Knot',
    teaches: 'Everything at once — and still only one thread to pull.',
    rows: [
      '.....^.',
      '....>>.',
      '.v^<<v.',
      'v<<v>v.',
      '.v>v^v.',
      'v...<..',
      '<<.<...',
    ],
  },
]
