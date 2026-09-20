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

## Presentation rules

See `docs/presentation.md` for the API. These are the rules for using it.

16. **Prototypes should look like games, not debug demonstrations.** A flat
    rectangle in an arbitrary colour is never the finished answer. Use
    `drawRoundedCard` / `drawSoftCircle` / `drawGameTile` so shapes read as
    intentional.
17. **Prefer reusable presentation primitives over recreating common UI and
    feedback.** Before hand-rolling a button, a panel, a shadow, a press
    animation or a particle burst, check `src/presentation/`. Re-implementing
    one of these in a prototype is the most common avoidable mistake here.
18. **Use animation and feedback for meaningful interactions.** Every player
    action gets a response; nothing important teleports. Decorative motion that
    communicates nothing is worse than none — it costs attention and frames.
19. **Keep gameplay logic separate from presentation.** Rules, state and
    win/lose conditions never live inside a draw or juice call. A presentation
    change must never alter what the game does.
20. **Do not add visual complexity unless it improves readability or player
    feedback.** Fix hierarchy and spacing first. If a particle effect does not
    make an outcome clearer, delete it.
21. **Use the theme. Do not hardcode colours or font sizes.** `theme.colors.*`
    and `p.text(role)`. A prototype that hardcodes them cannot change
    personality and will not scale between landscape and portrait.
22. **Bake static art.** A Phaser `Graphics` re-tessellates every frame. Anything
    that does not change per frame goes through `bakeGraphics()`. This is a
    measured multiple-times-frame-rate difference, not a micro-optimisation.
23. **Touch targets are forgiving and fire on release.** Use `p.press(...)`;
    do not call `setInteractive` + `pointerdown` by hand. Keyboard stays
    available for desktop testing but is never the primary interaction.
24. **Camera shake is for important events only.** If everything shakes,
    nothing does.

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
