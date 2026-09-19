# Architecture — Foundation V2

## Layer model

```
Prototype (experimental, isolated)
    prototypes/NNN-name/

Foundation (stable, shared)
    src/core/        Constants, GameConfig, DesignTokens, PrototypeConfig
    src/scenes/      BootScene, PreloadScene, PrototypeScene (template)
    src/systems/     InputManager, AudioManager, VFXManager, AnimHelper, CameraManager, EventBus
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
| AnimHelper | `src/systems/AnimHelper.ts` | Static helpers: fadeIn, scalePunch, bounce, pulse, shake, moveTo |
| CameraManager | `src/systems/CameraManager.ts` | Follow, shake, zoom, bounds, fade in/out |
| EventBus | `src/systems/EventBus.ts` | Loose pub/sub between systems |
| UIFactory | `src/ui/UIFactory.ts` | Label, Button, Panel, ProgressBar, Toast |
| DebugOverlay | `src/ui/DebugOverlay.ts` | FPS, scene, prototype, resolution, DPR, orientation, R=restart |
| AssetKeys | `src/utils/AssetKeys.ts` | Typed asset key constants |

---

## Resolution and scaling

- **Design resolution:** 960 × 540 (defined in `Constants.ts`)
- **Scale mode:** `Phaser.Scale.FIT` — fills the viewport while preserving aspect ratio
- **Auto center:** both axes
- The debug overlay shows: Design, Canvas, Viewport, DPR, Orientation
- To support portrait prototypes, create a scene with its own Phaser.Scale config or adjust `GameConfig` for that prototype

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
