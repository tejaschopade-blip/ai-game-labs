# Architecture — Foundation V2

## Layer model

```
Prototype (experimental, isolated)
    prototypes/NNN-name/

Foundation (stable, shared)
    src/core/        Constants, GameConfig, DesignTokens, PrototypeConfig
    src/scenes/      BootScene, PreloadScene, PrototypeScene (template)
    src/systems/     InputManager, AudioManager, VFXManager, AnimHelper, CameraManager, EventBus
    src/presentation/ Theme, Draw, Anim, Vfx, Touch, Backgrounds, Juice
    src/ui/          DebugOverlay, UIFactory
    src/utils/       AssetKeys
```

**Dependency direction: Prototype → Foundation only. Foundation never imports Prototype.**

---

## Scene flow

```
BootScene → PreloadScene → [ACTIVE_SCENE from Constants.ts]
```

To switch the active prototype, set `ACTIVE_SCENE` and `PROTOTYPE_NAME` in `src/core/Constants.ts`.

---

## Foundation systems

| System | File | Purpose |
|---|---|---|
| DesignTokens | `src/core/DesignTokens.ts` | Central colors, typography, spacing, UI constants |
| InputManager | `src/systems/InputManager.ts` | Semantic actions (MoveUp, PrimaryAction…) mapped to keyboard/pointer |
| AudioManager | `src/systems/AudioManager.ts` | SFX + music with volume/mute control |
| VFXManager | `src/systems/VFXManager.ts` | Screen shake, flash, burst particles, floating text, fade transitions |
| AnimHelper | `src/systems/AnimHelper.ts` | Static helpers: fadeIn, scalePunch, bounce, pulse, shake, moveTo, popIn/Out, slideIn/Out, float |
| CameraManager | `src/systems/CameraManager.ts` | Follow, shake, zoom, bounds, fade in/out |
| EventBus | `src/systems/EventBus.ts` | Loose pub/sub between systems |
| UIFactory | `src/ui/UIFactory.ts` | Label, Button, Panel, ProgressBar, Toast, Icon |
| DebugOverlay | `src/ui/DebugOverlay.ts` | FPS, scene, prototype, resolution, DPR, orientation, R=restart |
| AssetKeys | `src/utils/AssetKeys.ts` | Typed asset key constants |
| Layout *(V3)* | `src/systems/Layout.ts` | Responsive anchors + safe-area insets |
| GameJuice *(V3)* | `src/systems/GameJuice.ts` | success/fail/collect/select/destroy/levelComplete feedback |
| Shadow *(V3)* | `src/systems/Shadow.ts` | `addShadow()` — standalone drop shadow for flat primitives |
| Background *(V3)* | `src/systems/Background.ts` | Gradient, pattern and ambient-mote atmosphere (Graphics only) |
| Transitions *(V3)* | `src/systems/Transitions.ts` | Scene fadeIn/fadeOut/transitionTo |

### Presentation layer *(V4)*

| System | File | Purpose |
|---|---|---|
| Theme | `src/presentation/Theme.ts` | 5 visual personalities, typography ramp, per-scene scaling |
| Draw | `src/presentation/Draw.ts` | Rounded cards, soft circles, tiles, layered shadows, rings, `bakeGraphics` |
| Anim | `src/presentation/Anim.ts` | pop/punch/bounce/shake/wobble/float/pulse/spin/spring/slide/fade/stagger |
| Vfx | `src/presentation/Vfx.ts` | burst/spark/ring/glow/confetti/trail/floatingText |
| Touch | `src/presentation/Touch.ts` | `makePressable()` — press lifecycle + forgiving hit areas |
| Backgrounds | `src/presentation/Backgrounds.ts` | Themed presets + vignette / waves / paper |
| Juice | `src/presentation/Juice.ts` | select/success/fail/collect/destroy/impact/levelComplete |
| — | `src/presentation/index.ts` | `createPresentation(scene, opts)` one-call bundle |

`createPresentation()` is the entry point for new prototypes. `GameJuice` is now
a compatibility facade over `Juice`; `UIFactory` renders through `Draw` and is
theme-aware. Full guide: **`docs/presentation.md`**.

---

## Resolution and scaling

- **Boot resolution:** 960 × 540 (defined in `Constants.ts`, applied by `GameConfig`)
- **Scale mode:** `Phaser.Scale.FIT` — fills the viewport while preserving aspect ratio
- **Auto center:** both axes
- The debug overlay shows: Design, Canvas, Viewport, DPR, Orientation
- Per-prototype design space is opt-in — see **Mobile-first (V3)** below

---

## Mobile-first (Foundation V3)

New prototypes target **portrait 1080 × 1920**, touch-first. Existing prototypes
(001–010) were authored for landscape 960 × 540 and are **not retrofitted** — a
global flip would leave them compiling while looking broken.

Orientation is therefore declared **per prototype**, never globally:

```ts
import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'

create() {
  applyPrototypeConfig(this, {
    name: '011-example', sceneKey: 'ExampleScene', orientation: 'portrait',
  })
}
```

Phaser's scale config is fixed at boot, so this calls `scale.setGameSize()`.
Resolution order: explicit `designWidth`/`designHeight` → `orientation` → leave
unchanged. It returns early when the size already matches, so it never fires a
needless resize. A scene that never calls it keeps whatever size is current —
which is exactly why 001–010 are unaffected.

Because game size persists across scene transitions, `GameSelectScene` calls
`applyLandscapeDesign()` on entry; without it, returning from a portrait
prototype would render the menu at 9:16.

### Safe area

`Layout` reads the CSS `env(safe-area-inset-*)` values through a probe element
and converts them to logical units, combining them with a 2%-of-design-space
floor so UI never sits flush to the edge even on desktop.

> `index.html` must carry `viewport-fit=cover` in its viewport meta. Without it
> iOS reports all insets as zero and notch handling silently does nothing.

```ts
const layout = new Layout(this)
layout.center()             // { x, y }
layout.safeTopCenter(24)    // inset-aware
layout.safeRect             // { x, y, width, height }
```

### Presentation systems

`GameJuice` composes VFXManager + AnimHelper + camera + AudioManager into
`success` / `fail` / `collect` / `select` / `destroy` / `levelComplete`. Audio is
optional throughout: a sound plays only when an `AudioManager` was supplied *and*
the key is actually loaded, so the repo's zero audio assets are a no-op, not a
crash.

`addShadow()` returns a **standalone, caller-owned** Graphics. It never reparents
the target or creates a Container — several prototypes redraw their Graphics
wholesale on resize, and a shadow system that owned display-list structure would
fight them. Reposition it with `setPosition()`, and `destroy()` it yourself.

---

## Input architecture

`InputManager` maps semantic `GameAction` enums to key codes:

```ts
import { InputManager, GameAction } from '../systems/InputManager'

const input = new InputManager(this)
input.isDown(GameAction.PrimaryAction)  // Space or Z
input.isJustDown(GameAction.Restart)    // R
input.up / input.down / input.left / input.right  // convenience getters
```

Gameplay code never references raw key codes — only `GameAction` values.

---

## UI architecture

`UIFactory` produces Phaser-native objects styled via `DesignTokens`:

```ts
const ui = new UIFactory(this)
ui.label(cx, cy, 'Score: 0')
ui.button(cx, cy, 'Restart', () => this.scene.restart())
ui.toast('Level complete!')
const bar = ui.progressBar(cx, cy, 200)
bar.setValue(0.75)
```

---

## Audio architecture

```ts
const audio = new AudioManager(this)
audio.playMusic('shared_music_gameplay')
audio.playSfx('shared_sfx_click')
audio.setMasterVolume(0.8)
audio.mute()
```

Keys must be loaded in `PreloadScene.preload()` before use. Use `AssetKeys.shared.*` constants for shared keys.

---

## VFX and animation

```ts
const vfx = new VFXManager(this)
vfx.burst(player.x, player.y)            // particle burst
vfx.screenShake()                         // camera shake
vfx.floatingText(x, y, '+100')           // floating score
vfx.scalePunch(sprite)                    // punch scale on hit
vfx.fadeTransition()                      // fade-in on scene start

AnimHelper.bounce(this, sprite)           // static helper — no class instance needed
AnimHelper.pulse(this, sprite)
await AnimHelper.moveTo(this, sprite, x, y)
```

---

## Asset structure

```
assets/
├── shared/
│   ├── images/       PNG/JPG/WebP used across multiple prototypes
│   ├── audio/        SFX and music used across multiple prototypes
│   ├── fonts/        Bitmap or web fonts
│   └── effects/      Particle textures, atlas sheets
│
└── prototypes/
    ├── 001-foundation-test/   Assets specific to this prototype
    └── 002-rotation-world/    Assets specific to this prototype
```

**Rule:** shared assets live in `shared/`. Prototype-specific assets live in `prototypes/NNN-name/`.

---

## Asset naming convention

```
shared_pixel           shared_player          shared_enemy
shared_sfx_click       shared_sfx_success     shared_music_gameplay
proto001_tile_wall     proto001_player_idle
```

Use `AssetKeys.shared.*` for shared keys. Define prototype-specific keys locally in the prototype's scene file.

---

## How to add a new prototype

1. Create `prototypes/NNN-name/YourScene.ts` — all gameplay code here
2. Add `import { YourScene } from '../../prototypes/NNN-name/YourScene'` to `src/core/GameConfig.ts` and add `YourScene` to the `scene` array
3. Update `src/core/Constants.ts`:
   - `PROTOTYPE_NAME = 'NNN-name'`
   - `ACTIVE_SCENE = 'YourScene'`

That's it. Run `npm run dev`.
