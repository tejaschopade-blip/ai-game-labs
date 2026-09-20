# 012 — Arrows

**Tap an arrow. If nothing stands between it and the edge it points at, it flies
off the board.**

That is the whole rule. The challenge is entirely perceptual: on a board of
twenty-four arrows, finding the one with a clear run.

---

## The headline finding

Clearing an arrow only ever *empties* cells, so an arrow that is legal now stays
legal forever and the set of legal moves only grows. The rule is **confluent**:
if a board can be cleared at all, *any* order of legal taps clears it, and no
choice the player makes can create a dead end.

So there is no strategy — only reading. `rules.blockedTap` exists so the
alternative can be felt rather than argued about:

| Value | Behaviour |
|---|---|
| `reject` *(default)* | A blocked tap does nothing but complain. Confluent; no dead ends. |
| `nudge` | A blocked arrow slides up behind its blocker. The board changes, so a tap can make things worse and `LEVEL_STUCK` becomes reachable. |

Press **T** in-game to toggle it and reload the level.

---

## Files

| File | Owns |
|---|---|
| `ArrowsTypes.ts` | Types. No Phaser, no runtime deps. |
| `ArrowsLogic.ts` | The rule. Pure, immutable, verifiable under plain node. |
| `ArrowsLevels.ts` | Ten handcrafted levels as ASCII rows. |
| `ArrowsEvents.ts` | **The seam.** Translates one `TapResult` into the list of things the player should see. Pure. |
| `ArrowsTheme.ts` | Every colour, radius, shadow and duration. |
| `ArrowsVisuals.ts` | Pure drawing functions over a `Graphics`. No scene, no state. |
| `ArrowsView.ts` | The board presenter. Consumes events, produces motion. |
| `ArrowsScene.ts` | Level flow, layout, HUD, panels. |

```
input ──► ArrowsLogic.tap ──► TapResult ──► ArrowsEvents ──► ArrowsEvent[] ──► ArrowsView
            (rules)                        (translation)                       (pixels)
```

**The logic never learns that a renderer exists.** `tap()` returns
`{ next, result }` and nothing else; it does not know an animation has a
wind-up, that a blocker flashes red, or that the board sits on paper. Replacing
`ArrowsView.ts` and `ArrowsTheme.ts` changes the entire art style without
reopening a single rule — which is the point of splitting `ArrowsEvents` out
rather than switching on `TapResult` inside the scene.

`ArrowsEvents` deliberately carries no durations, easings, colours or particle
counts. An event says *what occurred*, never how loud it was.

---

## Visual direction

**"Departure Board"** — a slate puzzle tray lying on warm paper, holding four
colours of chunky moulded arrow tile that want to leave.

- The tray is the only cool surface and the least saturated thing on screen, so
  the tiles read as the subject and a half-empty board reads as progress.
- Hue encodes direction, and so does the glyph's rotation. Redundant on
  purpose: level 4 exists to test direction reading, so colour may never be the
  only cue — but on a 49-tile board at phone size, hue is what lets you scan a
  whole row without focusing on each tile.
- Empty wells are drawn with *inverted* lighting — dark top, lit bottom, the
  exact opposite of a tile — so an empty cell can never be mistaken for a piece.
- The tray's rim has an exit channel cut opposite every row and column. Before
  the player has tapped anything, the furniture states the rule: things leave
  this board, and they leave along the lines.

---

## The three animations that matter

**Exit** — wind up against the direction of travel (110ms), then launch,
stretching along the axis, with a trail; the rim gate flashes as the tile
crosses it; the vacated well breathes out. The wind-up does more for how the tap
feels than everything after it: without anticipation the tile simply teleports.

**Blocked** — a refusal has to teach, not just deny. The tapped arrow lunges at
what is in its way and squashes against it *and* the blocker recoils and is
ringed in danger red. Two objects move, so "why not?" is answered even if the
player was looking at the wrong tile. Kept small: a player hunting for the free
arrow can tap wrong ten times without the screen becoming unpleasant.

**Runway preview** — shown while a tile is *held*, never before. Which arrows
are free IS the puzzle, so the board must not advertise it; but the moment a
player commits to a tile, showing them the run and the thing standing in it
teaches the rule without a word of text. Because a blocked tap costs nothing
under the default rule, this is a readability aid rather than a solver.

---

## Performance

Every piece of art is baked into a shared texture — one for the tray, one for an
empty well, four for the tiles. A 49-cell board is ~50 quads with zero
per-frame tessellation. See `bakeTexture` in `src/presentation/Draw.ts`.

---

## Controls

Touch-first. Tap an arrow; on-screen **MENU** and **RESTART**.

Development keys: `R` restart · `D` debug overlay · `ESC` menu · `N`/`P` next
and previous level · `T` toggle the `blockedTap` rule.

---

## Level authoring

Two rules, both learned the hard way (see `ArrowsLevels.ts`):

1. Never place two arrows facing each other on a line with nothing between them
   that can clear first — they block each other forever.
2. Difficulty is how FEW arrows are legal at once, not how many arrows there
   are. A 24-arrow board with eight legal moves reads easier than a 9-arrow
   board with one.
