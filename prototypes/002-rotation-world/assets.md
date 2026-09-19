# Asset Requirements — 002 Rotation World

This prototype uses a 1×1 pixel texture tinted at runtime for all shapes.
No external assets are required.

## Status

| Asset | Type | Status | Source |
|---|---|---|---|
| Player | Tinted pixel rectangle (blue, 46×46) | placeholder | Code-generated |
| Walls | Tinted pixel rectangles (gray) | placeholder | Code-generated |
| Goal | Tinted pixel rectangle (green, 48×48) | placeholder | Code-generated |
| Rotation feedback | Tween animation on container | implemented | — |
| SFX rotation | Short whoosh sound | missing | — |
| SFX goal reached | Short chime/success sound | missing | — |

## If Mechanic Is Validated

If rotation-world is promoted to a real game, consider:
- Distinct player sprite with visible facing direction
- Tile-based wall graphics with visual weight
- Particle burst on world rotation
- SFX: rotation whoosh (~0.3s), goal reached chime (~0.5s)

## Visual Style (if polished)

- Style: clean flat vector or simple pixel art
- Perspective: top-down
- Palette: dark bg + bright accent colors (matches current DesignTokens)

## Source / License

| Asset | Source | License | Attribution | URL |
|---|---|---|---|---|
| All current assets | Code-generated (Phaser Graphics API) | — | No | — |
