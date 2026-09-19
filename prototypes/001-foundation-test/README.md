# 001 — Foundation Test

**Question being tested:** Does the full foundation (input, physics, debug overlay, restart) work in a real gameplay context?

## What it tests
- BootScene → PreloadScene → FoundationTestScene lifecycle
- InputManager (WASD + arrows + pointer click-to-move)
- Arcade physics collisions (player vs obstacles)
- Arcade physics overlap (player vs goal)
- DebugOverlay (FPS, scene, prototype name)
- R-key and auto-restart after goal

## How to play
- WASD or arrow keys to move
- Click/tap anywhere to set a move target
- Reach the green ★ square to win
- R to restart at any time
