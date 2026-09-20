# Prototype 009 — Sort Lab

## Goal

Test different sorting mechanics using the same tap-to-sort interaction.

## Core Question

Which classification rule creates the most interesting decisions with the least complicated input?

## Modes

- **Color** — sort by visual color. Baseline: see → match → place.
- **Size** — sort by physical size. Colors are mixed to prevent color shortcuts.
- **Shape** — sort by shape. Colors and sizes are mixed.
- **Weight** — tap to discover hidden weight via bounce reaction, then sort. No labels.
- **Behavior** — move cursor near objects to observe behavior (follows / avoids / stays), then sort.

## Controls

Tap object → tap container to place  
Tap selected object again to deselect  
Mode buttons at top to switch experiment  
R = restart mode · ESC = menu

## Rounds

Each mode has 2 rounds:
- Round 1: fewer objects (6), obvious distinctions
- Round 2: more objects (9), subtler distinctions
After Round 2, Try Again resets to the same round.

## Presentation

This prototype is the **benchmark for the presentation layer** (`docs/presentation.md`).
It is built entirely on `createPresentation(this, { theme: 'puzzle', ... })`:
themed surfaces via `Draw`, baked static art via `bakeGraphics`, feedback via
`p.juice`, HUD via `p.ui.createBadge` / `createProgressBar`.

**No gameplay rule changed in that upgrade.** Object generation, categories,
counts per round, hit radii, container positions, weight-bounce heights and
durations, behaviour speeds and clamps, and the mistake count are all identical
to the previous version. Only rendering, animation, layout hierarchy and
feedback changed.

One deliberate restraint: bin accents cycle through a fixed neutral ramp rather
than matching their own category colour. Tinting the RED bin red would make
COLOR mode measurably easier than the other four, and this prototype exists to
compare those five modes against each other.

It stays landscape 960x540 — existing prototypes are never retrofitted to
portrait (`docs/ai-rules.md` rule 13).

## Experiment Notes

**Color:**
[leave blank for manual notes]

**Size:**
[leave blank for manual notes]

**Shape:**
[leave blank for manual notes]

**Weight:**
[leave blank for manual notes]

**Behavior:**
[leave blank for manual notes]

## The Key Experiment

Pay attention to the difference between Color (see → match → place)
and Behavior (interact → observe → understand → place).
Does the extra cognitive step produce "I figured it out!" rather than "I matched the colors"?

## Potential Future Directions

- sorting by movement
- sorting by relationships
- sorting by sequence
- sorting with limited containers
- conveyor sorting
- physics sorting
- transformation sorting
- sorting + merging
- ambiguous categories (edge cases)
- sorting under time pressure
- sorting with fog of war
