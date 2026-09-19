# Prototype 010 — Cozy Maze Adventure

**Phases 1–2.** Movement, key/gate/exit, plus a switch, a remote gate, a hidden route
and an optional treasure. Everything else is deferred.

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

23 × 11, 69 open tiles, all reachable.

```
#######################
#.....###.....###...###
#.###.###.###.###.#.###
#.###.....#.#.....#.###
#.#################.###
#@###############...###
#.###############.#.###
#.###.###########.#.###
#.###.###########.#...#
#.................#####
#######################
```

| Object | Tile | Role |
|---|---|---|
| start | `(1,5)` | far left, between the two branches |
| `switch1` | `(5,7)` | dead-end stub off the south corridor |
| `rgate1` | `(9,9)` | vine gate blocking the south corridor |
| `hidden1` | `(11,2)` | looks like hedge, is walkable |
| `treasure1` | `(11,3)` | alcove reachable only through `hidden1` |
| `key1` | `(19,5)` | where both branches converge |
| `gate1` | `(19,7)` | wooden gate, opens with `key1` |
| `exit1` | `(21,8)` | pocket behind `gate1` |

### Three routes

- **SAFE** — north zigzag. **34 tiles** to the key. Needs nothing, always open.
- **SHORT** — south corridor. **26 tiles** to the key, but `rgate1` blocks it until you
  detour to `switch1`. The detour costs 4 tiles round-trip, so the real saving is ~4 tiles.
- **SECRET** — `hidden1` off the north route opens a treasure alcove. Purely optional.

The gem is visible in its sealed alcove from the north corridor, which is the clue that
a way in exists — per the spec's rule that a hidden path must never be unnoticeable.

**Verified properties** (throwaway BFS + a headless movement sim, both run during development):

- Dimensions exactly 23 × 11.
- `switch1` reachable with both gates blocked.
- Key reachable via SAFE with `rgate1` blocked (dist 34) — the switch is never mandatory.
- Key reachable via SHORT with `rgate1` open (dist 26) — strictly shorter, saves 8 tiles.
- Exit reachable with `gate1` open, **not** reachable with it blocked — still a genuine chokepoint.
- Treasure unreachable when `hidden1` is treated as wall, reachable when passable.
- No orphaned open tiles (69/69).
- Movement sim: all three routes complete; the remote gate halts a southbound player at
  `(8,9)` pre-switch; 60k-frame random-input fuzz never penetrates a wall or locked gate.

Measured run times: SAFE **10.9s**, SHORT **9.8s** (detour included), SECRET **12.0s**.

## Design note: the ASCII holds topology only

The maze string encodes walls and the player start. Nothing else. Every entity lives
in the `objects` array with an explicit grid position:

```ts
objects: [
  { id: 'hidden1', kind: 'hidden', pos: { col: 11, row: 2 } },
  { id: 'switch1', kind: 'switch', pos: { col:  5, row: 7 },
    affects: [{ target: 'rgate1', effect: 'open' }] },
  { id: 'gate1',   kind: 'gate',   pos: { col: 19, row: 7 }, opensWith: 'key1' },
]
```

This is deliberate, and Phase 2 is the proof it works: four new entity kinds and a
relationship were added by extending `ObjectKind` and the object list. The only
parser change was three lines — a `hidden` tile deletes itself from the wall set, so
even a topology override lives in the objects array rather than as a new ASCII glyph.

`levelData.ts` imports nothing from Phaser, so level definitions stay testable and,
later, generatable outside the runtime.

### Relationship model

One step only:

```ts
interface Relation { target: string; effect: 'open' | 'close' }
```

`switch1 → opens → rgate1`. No chains, no conditions, no effect interpreter. The
original spec asks for 70% one-step interactions, and multi-step chains
(switch → water → vine → shortcut) are Phase 5 work.

## Files

| File | Role |
|---|---|
| `levelData.ts` | Types, `parseLevel`, `reachableFrom`, the level definition. Zero Phaser imports. |
| `CozyMazeScene.ts` | Phaser runtime only. Contains no ASCII parsing. |

## Phase 2 — implemented

| Feature | Behaviour |
|---|---|
| **Switch** | Drive over it. Plate depresses, stone → amber, scale punch, burst. |
| **Remote gate** | Vine gate across the maze. Opens when the switch fires. Unblocked as the animation starts so it never eats an input. |
| **Treasure** | Optional gem in the secret alcove. No score, no stars — reported as found/missed at the end. |
| **Hidden route** | Renders as hedge with pale-flower clues. Walking in fades it out and reveals the path. |

**The remote cause → effect chain**, all on-screen at once since the maze needs no camera scrolling:

```
switch depresses → burst → travelling sparkle flies to the gate (520ms)
    → vines retract (400ms) → burst → 4–6 leaves drift down
```

The travelling sparkle exists to lead the eye across the maze, and the falling leaves
are the spec's own idiom for "the world changed over there". No text is used to
explain it.

The completion panel reports `Route: short|safe` and `Treasure: found|missed`.
Route is recorded by **actual traversal of the remote gate tile**, not by whether the
switch was flipped — a player can flip the switch and still walk the north route, and
the traversal is the honest measure of which route was taken.

## Phases 3–7 — deliberately NOT implemented

Listed so the current scope is unambiguous. None of this exists yet:

- **Obstacles** — crumbling floor, moving log, snail, sleeping guardian, patrol guardian,
  one-way gate, rotating gate, vine wall, water current, wind garden, pushable crate,
  pressure plate, weight plate, fake wall, temporary bridge, teleporter pair,
  mushroom bounce, growing hedge, flower bridge, curious bird, wandering sheep,
  treasure mimic, water level, moving platform
- **Abilities** — Reverse, Dash, Reveal, Bridge, Freeze, Teleport
- **Multi-state switches and relationship chains** (switch → water → vine → shortcut)
- **Level validator** — `reachableFrom` is a ~20-line dev helper, not a soft-lock detector
- **AI level generation** and the **difficulty model**
- **Crystals / stars / coins / XP** — the treasure is a flag, not a score

## Architecture note

There was no existing parser or game-definition engine in this repository to extend —
the only `parseLevel` was a 20-line local function inside prototype 007's Sokoban scene,
not shared and not a general engine. `levelData.ts` is therefore new, and is scoped to
this prototype rather than promoted to `src/`, per `docs/ai-rules.md` rule 5
("do not create abstractions without repeated concrete need").

Note also that `docs/ai-rules.md` lists "procedural content framework" as explicitly out
of scope for Foundation V2. Phases 6–7 as originally specified would conflict with that
and should be re-scoped before being built.

## Known design risk — the shortcut margin is thin

Measured: SAFE 10.9s, SHORT 9.8s including the switch detour. The shortcut saves 8
tiles on paper but the detour costs 4 back, so the net payoff is about **1.1 seconds**.

That may be too small for the decision to feel worth making. If playtesting shows
players defaulting to the safe route and ignoring the switch entirely, the fix is to
lengthen the north branch or shorten the switch detour — not to add another obstacle.
Worth settling before any Phase 3 work, since the route decision is the thing the
whole concept rests on.

## Experiment notes

_(fill in after playing)_

**Does continuous movement beat step-per-press in a maze?**

**Does the remote gate opening read as cause → effect without any text?**

**Is the ~1.1s shortcut payoff enough to make the switch detour feel worth it?**

**Did the visible-but-sealed gem make you look for a way in?**

**Is one chokepoint enough tension, or does it need a second decision?**

**What did I naturally try that the prototype didn't support?**
