# Prototype 007 — Sokoban DNA

## Core mechanic

Push objects, never pull. One wrong push can make a level unsolvable.

## Question being tested

How much puzzle depth can emerge from a single irreversible interaction?

## Levels

1. **Learn** — One box, one obvious push. Teaches the basic mechanic.
2. **Direction** — Box must be pushed from the correct side. Teaches position awareness.
3. **Two Boxes** — Two boxes, two goals. Introduces ordering and path planning.
4. **Constraint** — Inner walls make pushing the wrong box first significantly harder.
5. **Mistake** — The intuitive first move traps a box against the left wall where it can never reach the goal. Must restart and rethink.

## Controls

WASD / Arrow Keys: move  
R: restart current level  
ESC: return to menu

## What this tests

- Does push-only movement feel satisfying?
- Does the player naturally think "where will this box end up?"
- When a mistake makes a level unsolvable, is the desire to restart immediate?
- Does adding a second box create meaningfully more decisions than one?

## Observations

_Fill in after playtesting._

## Most interesting interaction

_Fill in after playtesting._

## Does the mechanic create meaningful decisions?

_Fill in after playtesting._

## Possible mutations (do NOT implement yet)

- Push + boxes merge when they meet
- Push + boxes have different weights (heavy box needs a running start)
- Push + boxes activate floor switches
- Push + world rotates 90° on each push (Sokoban × Prototype 002)
- Push + limited number of pushes per box
- Push + player leaves a trail that becomes an impassable wall
- Push + box changes player movement range when pushed
- Push + two players, alternating turns
