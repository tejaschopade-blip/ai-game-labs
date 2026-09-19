# Architecture

## Layer model

```
Foundation (stable)          src/core/, src/scenes/
Reusable Systems             src/systems/, src/ui/, src/utils/
Prototype Code               prototypes/NNN-name/
```

## Scene flow

BootScene → PreloadScene → PrototypeScene

Add more scenes (MenuScene, GameScene, ResultScene) only when a prototype needs them.

## Systems

| System | Purpose |
|---|---|
| EventBus | Loose coupling between systems |
| InputManager | Keyboard, pointer, and touch input |
| AudioManager | SFX and music playback |
| DebugOverlay | FPS, scene, prototype name, restart shortcut |

## Prototype organisation

Each prototype lives under `prototypes/NNN-name/`. A prototype can import from `src/` but the core foundation must not be modified to suit one prototype.
