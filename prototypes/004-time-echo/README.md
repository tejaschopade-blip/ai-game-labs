# Prototype 004 — Time Echo

## Mechanic

Record player actions for 10 seconds, then a ghost replays them while you play simultaneously.

## Core Interaction

RECORD → REPLAY → cooperate with your past self.

## Hypothesis

Can a simple replay mechanic create interesting puzzles from very few game objects?

## Controls

WASD or Arrow Keys to move. R = restart level. D = toggle debug overlay.

## Phases

**Recording (10s):** Move freely. Every step is recorded.

**Replay:** Ghost spawns and replays your exact moves at the same timing. You control yourself simultaneously.

## Puzzle elements

- **Pressure plates** — latch permanently when stepped on by player OR ghost
- **Doors** — open when all linked plates are latched
- **Goal** — green circle; only player reaching it wins

## Levels

1. Echo intro — learn recording/replay with no puzzles
2. Switch + door — ghost must activate the plate to open the door
3. Walls + planning — you must record the path to reach a plate
4. Two plates — ghost latches one, you latch the other
5. Combined corridors — walls, two plates, one door, longer paths

## What we're testing

- Is the echo concept immediately understandable?
- Is replay visually distinct from player (blue solid vs semi-transparent)?
- Does planning ahead feel satisfying?
- Does the mechanic create "aha" moments?
- Is 10 seconds the right recording window?

## Deliberately excluded

- Combat, economy, progression, multiplayer, backend, procedural generation
- Move counter / optimization pressure (only add if mechanic is validated)
