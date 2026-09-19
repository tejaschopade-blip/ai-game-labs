# Prototype 008 — Block Placement

## Core mechanic

Choose a shape → place on 8×8 grid → complete rows/columns → clear them → score.

## What this prototype tests

1. Is shape placement satisfying?
2. Does the player naturally think "if I place it here vs. there"?
3. Does line clearing create enough feedback?
4. Does the player look for multi-line clears?
5. Does the combo system add tension?
6. Does game over create immediate desire to restart?

## Controls

Click a shape in the tray → click the board to place it  
R = restart · ESC = menu

## Scoring

- Place shape: +1
- 1 line clear: +10
- 2 lines: +25
- 3 lines: +45
- 4+ lines: +70
- Combo multiplier on consecutive clears

## Potential mutations (do NOT implement yet)

Gravity, special blocks, bombs, chained clears, obstacles, board rotation, shape rotation, limited colors, objectives, moving board, different grid sizes.
