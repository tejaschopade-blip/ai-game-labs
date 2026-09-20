# Prototype 011 — Loop Sort DNA

## Hypothesis

> Is "choose which batch enters → cubes automatically sort around a loop → matches resolve → board changes → choose again" an engaging mobile puzzle loop?

This is a mechanical study of the structure, not a clone. No original art, levels, UI, text or audio is reproduced.

## Core mechanic

```
LOOK → CHOOSE → TAP → WATCH → ANTICIPATE → MATCH/FAIL → BOARD CHANGES → CHOOSE AGAIN
```

The player never drags a cube. The only input is **which batch to send next**. Everything after the tap is automatic, deterministic and watchable.

## Rules

- **Colours:** red, blue, green, yellow.
- **Match size:** 3 contiguous same-colour cubes clear (per-level, default 3).
- **Belt:** a ring of `capacity` cells. Cubes compact toward slot 0 (marked on screen).
- **Routing:** an incoming cube of colour C joins the **longest existing run of C**, ties breaking to the lowest slot index, shifting the rest of the segment up. With no run of C it appends at the first free cell. With no free cell anywhere, the level is lost.
- **Batch entry:** cubes enter **one at a time in array order**, each fully resolving (matches → chains → obstacles) before the next. This is what makes a batch's outcome predictable, and therefore a decision.
- **Chains:** after each clear the belt compacts and is rescanned, so one insertion can cascade.
- **Junk colours** (usually yellow) never reach match size and occupy a cell permanently. That is the pressure that makes capacity matter.
- **Failure:** the belt fills, or the batch queue runs out with goals unmet.

### Dividers

Three things split the belt into segments that cubes never compact across:

| Divider | Effect | Opens when |
|---|---|---|
| **Curtain** | Its slots are unusable | N cubes of a required colour are cleared |
| **Ice** | The frozen cube is inert and immovable | N cubes of a required colour are cleared |
| **Barrier** | Nothing crosses the wall between two slots | N cubes of a required colour are cleared |
| **Hidden** | Contents unreadable (logic still knows) | After N total clears |

Hidden is information-only — it never changes the logical board.

## Architecture

```
LoopSortTypes.ts    types + constants          ← zero Phaser
LoopSortLogic.ts    belt, routing, matching,   ← zero Phaser, runs under node
                    obstacles, state machine
LoopSortLevels.ts   20 handcrafted levels      ← zero Phaser
LoopSortScene.ts    Phaser presentation
```

`selectBatch()` returns `{ next, events }`. The **event log is the only contract** between logic and view — the scene plays it back as a timeline and never derives game state from sprite positions.

```
insert · shift · clear(chainIndex) · obstacle · fail · complete
```

Timings: insert 260ms, shift 160ms (consecutive shifts move together), clear 320ms, cascades staggered 140ms per chain step. Input is locked for the whole timeline.

## Mobile presentation

First prototype in the repo to run **portrait 1080×1920**, via Foundation V3's `applyPrototypeConfig()`. Everything before it is landscape 960×540 and is not retrofitted.

Remaining capacity is deliberately readable three ways, because the decision is often sparse and the squeeze is what supplies the tension:

1. **Empty sockets** drawn on the belt — spatial, no counting
2. **A capacity bar** that fills as the belt does
3. **An `N FREE` readout** that turns amber at 60% and red at 85%

## Level progression

| # | Name | Teaches | Cap |
|---|---|---|---|
| 1 | First Delivery | Tap a batch, cubes enter, matching cubes clear | 10 |
| 2 | They Find Each Other | Cubes route to their own colour, not the end of the line | 10 |
| 3 | Leftovers | Cubes that never reach three sit on the belt forever | 8 |
| 4 | Three Ways | Spending space on junk early costs you later | 7 |
| 5 | Tight Belt | Finish a colour before starting another | 7 |
| 6 | Mixed Cargo | A mixed batch still sorts itself — read the whole batch | 7 |
| 7 | Behind the Curtain | Clearing the required colour opens new belt space | 12 |
| 8 | Rent the Space | Open the curtain before the small belt fills | 12 |
| 9 | Two Rooms | The curtain colour is not the goal colour | 12 |
| 10 | Frozen Solid | Ice splits the belt and never matches until it thaws | 10 |
| 11 | Thaw First | The small side of the ice fills fast — free it early | 9 |
| 12 | Cold Storage | Ice plus a tight belt: order is everything | 9 |
| 13 | One Way In | Cubes can enter the far side but cannot come back | 10 |
| 14 | Split Shift | Stranding a pair on the far side wastes it | 10 |
| 15 | Narrow Gate | Barrier plus capacity — the near side is four cells | 9 |
| 16 | Unmarked Crates | You start with cubes you cannot identify | 7 |
| 17 | Blind Corner | Commit before you know — then adapt | 7 |
| 18 | Late Reveal | Information arrives after two clears, not one | 7 |
| 19 | Curtain and Ice | Two locks, one key colour each — which first? | 12 |
| 20 | The Whole Machine | Barrier, curtain and hidden space at once | 13 |

Levels 1–2 are deliberately **unlosable** (tutorial). Levels 3–20 are all losable — verified.

## Verification

All 20 levels were checked headlessly (BFS over batch orders, 400k node cap) for:

- **Solvable** — at least one batch ordering completes it ✓ 20/20
- **Failable** — at least one ordering loses ✓ 18/18 non-tutorial
- **Deterministic** — same order replays byte-identical state *and* event log ✓
- **Obstacle reachability** — every obstacle's unlock condition is satisfiable ✓
- **Conservation** — belt + cleared == initial + inserted across 7,462 checks ✓

Two real bugs were caught by that harness, not by eye:

1. `insertCube` could pick a free cell *below* the insertion target on a not-yet-compacted belt, silently overwriting a cube. The conservation invariant exists to keep that class dead.
2. A hidden region placed at high slot indices is **inert** — cubes compact toward slot 0 and immediately leave it. Hidden only bites at the front of the belt, or behind a divider that pins cubes in place. Levels 16–18 were rebuilt because of this.

## Measured decision density

Every reachable state was classified by how many of its choices still keep a win alive:

| Levels | States with a fatal option |
|---|---|
| 1–2 | 0% (tutorial, correct) |
| 3–9 | 10–21% |
| 10, 13–15, 19 | 26–35% |
| 11, 12 | 52–56% |
| 16, 18, 20 | 8% |

**The decision is real but sparse.** On most levels, 70–90% of turns have no losing option — the player is choosing between "win" and "win one pick slower", which is not the moment the hypothesis is about.

The cause is structural: **ice is the only obstacle that removes space unconditionally and immediately.** Curtain and barrier withhold space the player did not yet need; hidden withholds information without costing anything.

## Playtest Observations

*(to be filled in by hand)*

What felt satisfying?

What felt boring?

Did choosing a batch feel meaningful?

Did automatic sorting feel satisfying?

Did the player understand why a cube moved?

Were failures understandable?

Which obstacle created interesting decisions?

Which obstacle only added complexity?

Did the player want to immediately retry?

Do levels 11–12 read as unfair? (Two of three opening moves lose before anything is on screen.)

## Future experiments — not implemented

- Make curtain and barrier **cost** space rather than withhold it, so every obstacle applies ice-like pressure
- Show the next batch after the offered ones, turning this into a lookahead puzzle
- Let the player discard a batch at a price
- Variable match size within a level
- A belt that advances one step per pick regardless of input
- Two interleaved loops sharing an entry point
