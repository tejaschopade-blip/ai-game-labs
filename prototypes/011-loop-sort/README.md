# 011 — Loop Sort: Continuous Conveyor Match-3

> **The question this prototype exists to answer:**
> Is it fun to watch a continuously moving system, predict where cubes will be,
> and decide what to inject into it?

Not "can the player sort cubes". The player never places a cube.

---

## The mechanic in one paragraph

The belt is a ring of fixed cells that rotates continuously and never stops. One
point in *screen* space — the intake chute at the bottom — does not move. As the
ring turns, a different cell passes under the chute every moment. Tapping a batch
drops its cubes into whichever cell is under the chute **at that instant**.

So the player supplies the colour and the belt supplies the position. Neither
alone is a decision; together they are the whole game:

```
OBSERVE  →  PREDICT  →  CHOOSE  →  WATCH  →  MATCH  →  POP  →  OBSERVE
```

The bracket that snaps from cell to cell under the chute is the key affordance:
it answers "where would this batch land if I tapped right now?" Without it the
player can see the belt move but cannot aim, and the mechanic collapses into
guessing.

## The three rules

1. **Cubes never move relative to the belt.** They ride in their cell. A gap is a
   real, persistent object that travels around the loop with everything else.
2. **A full cell shoves.** Drop onto an occupied cell and that cube — plus every
   cube touching it in the travel direction — slides one cell along into the
   first gap ahead. This is the only way cubes ever change cells.
3. **Three touching cubes of one colour pop.** Connectivity is checked around the
   ring; an empty cell breaks a run. A run of four or five pops whole.

### Why cubes do not compact

An earlier build packed the belt toward a fixed end after every action. Gaps
closed on their own, so matches assembled themselves and the player's timing
stopped mattering. Persistent gaps are what make the belt a system you aim at
rather than a system that resolves itself.

---

## Files

| File | Holds |
|---|---|
| `LoopSortTypes.ts` | Pure types. No Phaser. |
| `LoopSortLogic.ts` | Pure rules: rotation, intake cell, shove, runs, matching, win/lose. No Phaser. |
| `LoopSortTuning.ts` | Every knob worth turning during a playtest. |
| `LoopSortLevels.ts` | Ten hand-authored levels. |
| `LoopSortTheme.ts` | Colours, materials, motion vocabulary. |
| `LoopSortVisuals.ts` | Pure drawing functions + the arc-length `LoopTrack`. |
| `LoopSortScene.ts` | Presentation and timing only. |

`Logic`, `Types`, `Tuning` and `Levels` are Phaser-free on purpose: they compile
and run under plain node, which is how the level set was balanced (see below).

## How motion works

Nothing on the belt is tweened to a screen position. Every belt object — cube,
empty well, tread bar, target bracket — is placed each frame from one arc-length
sample of the track:

```
screenPos = track.at(((rotation + cell) / capacity) mod 1)
```

`LoopTrack` parameterises the rounded rectangle by real arc length, so a cube
keeps a constant speed through the corners instead of accelerating round them.

A shove changes a cube's logical `cell` by one; its drawn `visCell` chases it
exponentially (`tuning.slideRate`). That is the entire movement system, and it is
why the belt never snaps or teleports.

## Tuning

`LoopSortTuning.ts`:

| Knob | Does |
|---|---|
| `speedScale` | Multiplies every level's belt speed |
| `capacityBonus` | Added to every level's cell count |
| `matchSizeOverride` | Non-zero overrides every level's match size |
| `entryStagger` | Gap between two cubes of one batch arriving |
| `matchDelay` | The held beat between "they connected" and "they pop" |
| `slideRate` | How fast a shoved cube catches up to its cell |
| `paused` | Freezes belt travel (debug only) |

Per-level: `capacity`, `speed`, `matchSize`, `offerCount`, `initialBelt`,
`batchQueue`, `goal`.

## Debug controls

`DebugOverlay` already owns `R` (restart), `D` (toggle) and `ESC` (menu). This
prototype adds:

| Key | Does |
|---|---|
| `P` | Pause / resume belt travel |
| `O` | Cycle belt speed: 1x → 0.5x → 0.25x → 1.5x |
| `N` / `B` | Next / previous level |

`?lvl=4` in the URL opens level 5 directly.

The overlay watches level, state, the belt as a string (`r.r.b.b.g.g.`), cube and
free-cell counts, belt speed, match size and progress, and the current intake
cell.

---

## Level set

Ten levels, not fifty — short enough to replay end to end in one playtest.

| # | Name | Teaches |
|---|---|---|
| 1 | First Loop | Tap, a cube joins, three touching pop |
| 2 | Two Trains | A batch lands as one piece — aim the pair |
| 3 | Mind the Gap | Land *in* the gap, not beside it |
| 4 | Three Colours | Three colours competing for the same cells |
| 5 | Tight Belt | Ten cells: a batch you cannot cash in is cells gone |
| 6 | Faster Loop | Same puzzle, more speed |
| 7 | Wait For It | Two offers, four free cells — let the belt come to you |
| 8 | Dead Weight | A batch no goal wants blocks an offer slot forever |
| 9 | Two Chances | More matches available than you have room to set up |
| 10 | The Machine | Four colours, a tight belt, a moving seam |

No obstacles. No ice, curtains, barriers, hidden cells, split belts or portals —
deliberately. Those come only if the pure conveyor mechanic proves interesting.

### How the set was balanced

The logic is Phaser-free, so the whole decision space is simulable. Because the
player can wait for any cell to reach the intake, a move is really
`(batch × cell)` — so a solver can enumerate every move a patient player could
make. Two players were simulated per level:

* a **thoughtful** player (greedy on goal progress, then free cells)
* a **random** player (200 runs)

| Level | Thoughtful | Random wins |
|---|---|---|
| 1 | win, 1 pick | 68% |
| 2 | win, 2 picks | 80% |
| 3 | win, 9 picks | 39% |
| 5 | win, 9 picks | 29% |
| 7 | win, 9 picks | 7% |
| 8 | win, 12 picks | 1.5% |
| 10 | win, 13 picks | 0.5% |

The gap between the two columns *is* the measurement of whether choice matters.
The first level set scored 84% for random play on level 2 and 1–4 picks
everywhere, which is how it was caught: every belt handed the player an adjacent
pair, so capacity and batch choice never bit. The current set widens the gap to
0.5% by level 10.

---

## What we learned

**The timing is the decision, and it works.** Splitting the choice into "which
colour" (the batch) and "where" (the moment) produces the intended thought —
*"if I release this now it lands between those two reds"* — from a single tap and
no other input. Prediction comes from the belt, not from a control scheme.

**The bracket carries the whole mechanic.** It is the difference between aiming
and guessing. It is the first thing to keep in any follow-up.

**Persistent gaps are the load-bearing rule.** The moment cubes compact on their
own, the machine starts solving itself and the player becomes a spectator.

**The shove is a better decision than expected.** Dropping onto an occupied cell
is not a mistake — it is a way to push a run into a gap. It gives the "bad" half
of the choice space real uses, which is what stops the game being a waiting
exercise.

### Biggest remaining uncertainty

Whether *watching* stays interesting for more than a few minutes. Each release
resolves in about a second, then the player waits for the seam to come round
again — up to 15 seconds at level 1's speed. That dead time is where the
prediction happens, but it is also the most likely place for the loop to feel
slow. The honest test is a human playing levels 1–10 back to back and noticing
whether the waiting reads as *anticipation* or as *delay*.

### Recommended next experiment

Give the player something to do with the waiting rather than speeding the belt
up. The cheapest version: let a queued batch be *armed* — tap once to arm, and it
releases automatically when the intake reaches a cell the player marks. That
turns dead time into a committed prediction, which is the feeling this prototype
is chasing, and it can be built on this logic without changing a rule.
