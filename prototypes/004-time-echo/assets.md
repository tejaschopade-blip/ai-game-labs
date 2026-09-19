# Asset Requirements — 004 Time Echo

All visuals are generated via Phaser Graphics. No external assets required for the prototype.

## Status

| Asset | Type | Status | Source |
|---|---|---|---|
| Player | Rectangle, blue (#4488ff) | placeholder | Code-generated |
| Ghost | Rectangle, semi-transparent blue (#88aaff, alpha 0.55) | placeholder | Code-generated |
| Walls | Filled rectangles, gray (#555566) | placeholder | Code-generated |
| Border cells | Filled rectangles, dark gray (#444455) | placeholder | Code-generated |
| Pressure plate (inactive) | Filled square, dark orange (#443300) | placeholder | Code-generated |
| Pressure plate (latched) | Filled square, bright orange (#ffaa00) | placeholder | Code-generated |
| Door (closed) | Filled rectangle, brown (#885533) | placeholder | Code-generated |
| Door (open) | Faint outlined rectangle | placeholder | Code-generated |
| Goal | Circle, green (#00cc77) with white center | placeholder | Code-generated |
| Grid lines | Phaser Graphics lines | placeholder | Code-generated |
| Burst VFX | Procedural circles via VFXManager | placeholder | Code-generated |
| Floating text | Phaser text via VFXManager | placeholder | Code-generated |
| Audio | sfx_record_start, sfx_move, sfx_plate, sfx_door, sfx_win | missing | — |

## If Mechanic Is Validated

- Distinct player sprite with walk animation frames
- Ghost with particle trail, ghostly transparency pulsing
- Animated pressure plate (glowing ring when latched)
- Door open/close animation with particles
- SFX: footsteps, plate click, door creak, ghost whoosh, win jingle
- Background: subtle grid-themed tile
