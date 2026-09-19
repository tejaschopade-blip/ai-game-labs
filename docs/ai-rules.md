# AI Development Rules — Foundation V2

**AI should optimize for fast experimentation, not maximum abstraction.**

## Rules

1. **Reuse foundation before creating new systems.** Check `src/systems/`, `src/ui/`, `src/utils/` first.
2. **Do not modify foundation for prototype-specific gameplay.** Keep it in `prototypes/NNN-name/`.
3. **Keep prototype code isolated.** `prototypes/` imports `src/`. `src/` never imports `prototypes/`.
4. **Dependencies flow prototype → foundation only.** Never the reverse.
5. **Do not create abstractions without repeated concrete need.** Two prototypes must actually share it before extracting.
6. **Prefer Phaser-native systems.** Use Phaser tweens, cameras, physics, input — not custom engines.
7. **Keep implementations small and readable.** A new developer should understand it in one read.
8. **Do not sacrifice gameplay iteration speed for architecture.**
9. **If a system is genuinely reused by 2+ prototypes, propose extracting it** after the experiment proves the need — not before.
10. **Prefer the smallest working implementation.** No over-engineering.
11. **Explain architectural changes before making significant ones.** Do not silently redesign.
12. **Avoid unnecessary npm packages.** Only add a dependency if it solves a real, recurring problem.
13. **Mobile-first.** New prototypes default to portrait 1080 × 1920, touch-first and safe-area aware, declared via `applyPrototypeConfig()`. Keyboard stays supported for desktop testing, but do not make WASD the primary interaction. Existing prototypes are **not** retrofitted — never change the global design resolution.
14. **Presentation: small but finished-feeling, not large but unfinished.** Fix hierarchy and spacing before reaching for effects. A prototype that reads clearly with no particles beats a busy one.
15. **Extract a presentation system only when 2+ prototypes actually need it.** Same bar as rule 5 — capability added to an API with no callers is capability spent in the wrong place.

## What belongs in the foundation

- Systems used by 2+ prototypes
- Utilities with no prototype-specific logic
- Configuration and constants
- Generic UI primitives

## What belongs in the prototype

- All gameplay mechanics
- Prototype-specific entities, rules, state
- Prototype-specific assets and asset keys
- Any system that only one prototype uses (even if it looks reusable)

## Adding a new prototype: 3 steps

1. Create `prototypes/NNN-name/YourScene.ts`
2. Register it in `src/core/GameConfig.ts` scene array
3. Set `ACTIVE_SCENE` and `PROTOTYPE_NAME` in `src/core/Constants.ts`

## Explicitly out of scope for Foundation V2

ECS, dependency injection, custom physics, custom animation engine, custom UI framework,
multiplayer, networking, backend, save/cloud, analytics, localization, monetization,
procedural content framework, asset database, editor tooling, plugin architecture,
complex scene manager.

## Asset Rules

Before creating a new asset:
1. Check shared assets (`assets/shared/`) first.
2. Check the current prototype's assets (`assets/prototypes/<name>/`).
3. Prefer an existing asset when appropriate.
4. Use primitive shape placeholders when art is not blocking gameplay.
5. Never block gameplay implementation waiting for art.
6. Record new asset requirements in the prototype's `assets.md`.
7. Record external asset source and license information in `assets.md`.
8. Do not duplicate assets unnecessarily.
9. Always use `AssetKeys` constants — never hardcode key strings in scenes.
10. Load assets explicitly in `PreloadScene` — no automatic discovery.

See `docs/asset-pipeline.md` for the full workflow.
