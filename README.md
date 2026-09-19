# AI Game Lab

A lightweight, reusable game prototyping foundation for rapid hackathon and indie game development.

## Why

The goal is to go from **IDEA → PROTOTYPE → PLAYTEST → ITERATE → POLISH** as fast as possible, using AI-assisted development throughout.

This is not a game engine. It is a thin, stable foundation that stays out of the way.

## Technology

| Tool | Purpose |
|---|---|
| Phaser 3 | 2D game framework |
| TypeScript | Type safety, editor support |
| Vite | Fast dev server and bundler |
| npm | Package management |

## Architecture

```
src/
├── core/          GameConfig, Constants
├── scenes/        BootScene → PreloadScene → PrototypeScene
├── systems/       EventBus, InputManager, AudioManager
├── ui/            DebugOverlay (more as needed)
├── entities/      (add per-prototype or when reuse is clear)
├── utils/         (add when needed)
└── main.ts

prototypes/
└── 001-foundation/

docs/
├── architecture.md
├── ai-rules.md
└── prototype-process.md
```

## Install and run

```bash
npm install
npm run dev    # starts dev server at localhost:3000
npm run build  # production build to dist/
```

## Prototypes

Each prototype lives under `prototypes/NNN-name/`. They import from `src/` but do not modify core foundation files.

Start a new prototype by copying the folder structure and updating `PROTOTYPE_NAME` in `src/core/Constants.ts`.

## AI collaboration rules

See `docs/ai-rules.md`. The short version: smallest working implementation, no premature abstractions, iterate fast.

## What is intentionally NOT built yet

- No menus or UI framework
- No save/load system
- No cards, combat, inventory, dialogue, pathfinding
- No multiplayer
- No backend
- No ECS
- No state machine framework

These will be added only when an actual prototype needs them.
