# Prototype 010 — Cozy Maze Adventure

**Phase 1 only.** Movement + one key + one gate + one exit. Everything else is deferred.

## Goal

Build toward a cozy storybook garden maze that feels like a small living world rather
than a static set of walls. Phase 1 establishes the foundation that every later phase
hangs off: continuous movement through a readable maze.

## The one question this prototype tests

> Does a continuously-moving maze with a single key/gate chokepoint feel good to navigate?

Specifically: is buffered-turn continuous movement (Pac-Man style) more pleasant to
steer through a maze than the discrete step-per-press movement used in prototypes
002 and 007? And does one remote gate opening across the map read as cause → effect?

If the answer is no, adding 29 more obstacle types will not save it.

## Controls

| Input | Action |
|---|---|
| WASD / arrow keys | Set direction (buffered) |
| Swipe | Set direction (touch, 24px threshold) |
| R | Restart |
| D | Toggle debug overlay |
| ESC | Back to game select |

You move continuously. Pressing a direction *before* an intersection queues the turn
and it fires the moment the turn becomes legal. Reversing works mid-tile.

## Movement model

Tile-to-tile interpolation, not pixel position with snapping:

- `col`/`row` is the anchor tile, `dir` the travel direction, `t` the 0→1 progress toward the next tile.
- Pixel position is a lerp between the anchor tile centre and the tile centre in `dir`.
- Turns resolve at tile boundaries; reversals resolve instantly by flipping the anchor and mirroring `t`.
- `dt` is capped at 50ms so a backgrounded tab cannot warp the player through the maze.

This matters because epsilon-snapping on pixel positions overshoots at low framerate
and lets the player clip corners. The tile-anchored model cannot, by construction.

## The level — "The Garden Shortcut"

19 × 11, 91 open tiles, all reachable.

```
###################
#@....#.....#.....#
#.###.#.###.#.###.#
#.#...#.#.#.#.#...#
#.#.###.#.#.#.#.###
#...#...#...#.#...#
###.#.###.###.###.#
#...#.#...#.....#.#
#.###.#.#.#####.#.#
#.......#.......#.#
###################
```

- Player start `(1,1)` — top left
- Key `(9,5)` — centre of the maze
- Gate `(17,7)` — locked until the key is picked up
- Exit `(17,9)` — bottom right, behind the gate

**Verified properties** (checked with a throwaway BFS script during development):

- Key is reachable from the start *with the gate locked* — you can always get the key first.
- Exit is reachable *with the gate open*.
- Exit is **not** reachable with the gate locked — the gate is a genuine chokepoint, not decoration.
- No orphaned open tiles.

Optimal run is roughly 18 seconds.

## Design note: the ASCII holds topology only

The maze string encodes walls and the player start. Nothing else. Every entity lives
in the `objects` array with an explicit grid position:

```ts
objects: [
  { id: 'key1',  kind: 'key',  pos: { col:  9, row: 5 } },
  { id: 'gate1', kind: 'gate', pos: { col: 17, row: 7 }, opensWith: 'key1' },
  { id: 'exit1', kind: 'exit', pos: { col: 17, row: 9 } },
]
```

This is deliberate. Phases 2–5 add switches, guardians and relationships by extending
`ObjectKind` and the object list — without touching the maze string or re-encoding
entities as ASCII glyphs. `levelData.ts` imports nothing from Phaser, so level
definitions stay testable and, later, generatable outside the runtime.

## Files

| File | Role |
|---|---|
| `levelData.ts` | Types, `parseLevel`, `reachableFrom`, the level definition. Zero Phaser imports. |
| `CozyMazeScene.ts` | Phaser runtime only. Contains no ASCII parsing. |

## Phases 2–7 — deliberately NOT implemented

Listed so the current scope is unambiguous. None of this exists yet:

- **Obstacles** — crumbling floor, moving log, snail, sleeping guardian, patrol guardian,
  one-way gate, rotating gate, vine wall, water current, wind garden, pushable crate,
  pressure plate, weight plate, hidden path, fake wall, temporary bridge, teleporter pair,
  mushroom bounce, growing hedge, flower bridge, curious bird, wandering sheep,
  treasure mimic, falling leaves, water level, moving platform
- **Abilities** — Reverse, Dash, Reveal, Bridge, Freeze, Teleport
- **Multi-state switches and relationship chains** (switch → water → vine → shortcut)
- **Route splitting** — the current level has one route, not safe/risk/secret variants
- **Level validator** — `reachableFrom` is a ~20-line dev helper, not a soft-lock detector
- **AI level generation** and the **difficulty model**
- **Collectibles / crystals / stars / rewards**

## Architecture note

There was no existing parser or game-definition engine in this repository to extend —
the only `parseLevel` was a 20-line local function inside prototype 007's Sokoban scene,
not shared and not a general engine. `levelData.ts` is therefore new, and is scoped to
this prototype rather than promoted to `src/`, per `docs/ai-rules.md` rule 5
("do not create abstractions without repeated concrete need").

Note also that `docs/ai-rules.md` lists "procedural content framework" as explicitly out
of scope for Foundation V2. Phases 6–7 as originally specified would conflict with that
and should be re-scoped before being built.

## Experiment notes

_(fill in after playing)_

**Does continuous movement beat step-per-press in a maze?**

**Does the remote gate opening read as cause → effect?**

**Is one chokepoint enough tension, or does it need a second decision?**

**What did I naturally try that the prototype didn't support?**
