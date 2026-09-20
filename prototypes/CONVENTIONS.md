# Prototype Conventions

Reference for building new prototypes. Read this instead of the foundation source files.

---

## Canvas

```typescript
// Design resolution (constant — never changes)
DESIGN_WIDTH  = 960
DESIGN_HEIGHT = 540

// Access at runtime
const W = this.scale.width   // 960
const H = this.scale.height  // 540
```

---

## Adding a New Prototype

### 1. Create files

```
prototypes/
└── 0NN-name/
    ├── YourScene.ts
    ├── README.md
    └── assets.md
```

### 2. `src/core/Constants.ts` — update active scene

```typescript
export const PROTOTYPE_NAME = '0NN-name'
export const ACTIVE_SCENE   = 'YourScene'
```

### 3. `src/core/GameConfig.ts` — register scene

```typescript
// Add import:
import { YourScene } from '../../prototypes/0NN-name/YourScene'

// Add to scene array (append at end):
scene: [..., YourScene],
```

### 4. `src/scenes/GameSelectScene.ts` — add menu card

```typescript
// Append to PROTOTYPES array:
{
  key: 'YourScene',
  number: '0NN',
  name: 'Display Name',
  description: 'One line description shown in the menu',
  color: 0xrrggbb,   // accent color for the card stripe
}
```

### 5. Scene class boilerplate

Start every new prototype from the presentation layer — see
`docs/presentation.md` for the full API.

```typescript
import Phaser from 'phaser'
import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'
import { createPresentation, Presentation } from '../../src/presentation'
import { fadeIn } from '../../src/systems/Transitions'
import { DebugOverlay } from '../../src/ui/DebugOverlay'

export class YourScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private p!: Presentation

  constructor() { super({ key: 'YourScene' }) }

  create(): void {
    // New prototypes are portrait 1080x1920. Declare it FIRST — the
    // presentation layer scales its geometry to the current design space.
    applyPrototypeConfig(this, {
      name: '0NN-name', sceneKey: 'YourScene', orientation: 'portrait',
    })

    this.p = createPresentation(this, { theme: 'cozy', background: true })

    this.overlay = new DebugOverlay(this, '0NN-name')
    this.overlay.addWatch('Label', () => String(this.someValue))

    // Pieces: draw through Draw helpers, then bake anything static.
    // UI: this.p.ui.createButton / createPanel / createBadge / createLabel
    // Text: this.add.text(x, y, 'Score', this.p.text('heading'))
    // Touch: this.p.press(tile, { hitRadius: 60, onPress: () => ... })
    // Feedback: this.p.juice.success(x, y, { target: tile })

    fadeIn(this)
  }

  update(): void {
    this.overlay.update()  // always call — handles R/D/ESC keys
  }
}
```

> **Do not** hand-roll buttons, panels, shadows, press animations or particle
> bursts inside a prototype. Check `src/presentation/` first — see rules 16–24
> in `docs/ai-rules.md`.

> **Bake static art.** A Phaser `Graphics` re-tessellates its whole command list
> every frame. Anything that does not change per frame goes through
> `bakeGraphics(scene, w, h, draw)`, which returns an `Image`. Measured on this
> repo: 20fps → 36fps in prototype 009, 25fps → 56fps on the menu.

---

## DebugOverlay

```typescript
// Constructor
new DebugOverlay(scene: Phaser.Scene, prototypeName: string)

// Register a live watch (called every frame)
overlay.addWatch(label: string, fn: () => string): void
overlay.removeWatch(label: string): void

// Call in update() — mandatory
overlay.update(): void
```

**Built-in keys (automatic — do NOT re-register):**
- `R` → `scene.restart()`
- `D` → toggle overlay visibility
- `ESC` → fade out → `scene.start('GameSelectScene')`

**Display:** top-left, depth 10000, `setScrollFactor(0)` (always fixed).

---

## VFXManager

```typescript
// Constructor
new VFXManager(scene: Phaser.Scene)

// Particle burst at (x, y)
vfx.burst(x: number, y: number, color = 0x00ff88, count = 12): void

// Floating score/text popup — rises and fades over 1200ms
vfx.floatingText(x: number, y: number, text: string, color = '#ffffff', fontSize = '20px'): void

// Scale punch on any GameObject
vfx.scalePunch(target: Phaser.GameObjects.GameObject, scale = 1.4, duration = 200): void

// Camera shake
vfx.screenShake(intensity = 8, duration = 200): void
// intensity is in screen pixels (converted internally to 0–1 range)

// Camera flash (white)
vfx.flash(duration = 200): void

// Fade a GameObject in/out
vfx.fadeIn(target: Phaser.GameObjects.GameObject, duration = 300): void
vfx.fadeOut(target: Phaser.GameObjects.GameObject, duration = 300, onComplete?: () => void): void

// Fade the camera in on scene start
vfx.fadeTransition(duration = 400): void
```

---

## Level reload safety pattern

When reloading a level inside a scene (not a full scene restart), cancel in-flight
timers and tweens **first** — but do **not** use `tweens.killAll()`:

```typescript
private loadLevel(): void {
  // Kill only tweens on objects THIS scene owns and is about to destroy.
  this.tweens.killTweensOf(this.myCubes)
  this.tweens.killTweensOf(this.myShadows)

  this.time.removeAllEvents()  // cancels delayed callbacks from previous level
  // ... reset state and rebuild
}
```

> **Why not `killAll()`.** Phaser's `TweenManager.killAll()` calls `tween.destroy()`
> on every tween, and `destroy()` does **not** fire `onComplete`. `VFXManager.burst()`
> and `floatingText()` destroy their GameObjects *only* in `onComplete`, and the scene
> holds no reference to them. So a `killAll()` fired while a burst is mid-flight
> strands those particles on screen permanently, with nothing able to clean them up.
>
> Kill tweens per owned object instead, and let transient VFX finish and self-clean —
> it is short-lived by definition. Prototypes 004, 005 and 007 still use the old
> `killAll()` form and can strand particles on a fast restart.

Guard any delayed callback that touches an object which may be destroyed before it
fires. A monotonic token is the cheapest way:

```typescript
private runToken = 0

private loadLevel(): void {
  this.runToken++                      // invalidates every pending callback
  const token = this.runToken
  this.time.delayedCall(300, () => {
    if (token !== this.runToken) return  // stale — the level moved on
    // ... safe to touch scene objects
  })
}
```

Tag all level-specific UI elements so they can be destroyed on reload:

```typescript
someText.setData('levelUI', true)

// Cleanup before rebuilding:
;(this.children.list.slice() as Phaser.GameObjects.GameObject[])
  .filter(c => (c as { getData?: (k: string) => unknown }).getData?.('levelUI'))
  .forEach(c => c.destroy())
```

---

## Phaser patterns used across prototypes

### Discrete keyboard input (puzzle/grid games)

```typescript
// In create():
const cursors = this.input.keyboard!.createCursorKeys()
const keyW = this.input.keyboard!.addKey('W')

// In update():
if (Phaser.Input.Keyboard.JustDown(cursors.left)) { /* move */ }
```

### Tween with typed target (TypeScript safe)

```typescript
const obj = { v: 0 }
this.tweens.add({
  targets: obj,
  v: 1,
  duration: 300,
  onUpdate: (tween: Phaser.Tweens.Tween) => {
    const val = (tween.targets[0] as { v: number }).v
    // use val
  },
})
```

### Graphics: draw a triangle

```typescript
const g = this.add.graphics()
g.fillStyle(0xff4444, 1)
g.fillTriangle(cx, cy - r, cx - r, cy + r, cx + r, cy + r)
```

### Scrollable camera menu

```typescript
// Fixed elements (header, footer):
element.setScrollFactor(0).setDepth(100)

// Scrollable content: default scrollFactor = 1 (no call needed)

// Camera bounds:
this.cameras.main.setBounds(0, 0, W, Math.max(H, contentH))

// Mouse wheel:
this.input.on('wheel', (_p, _o, _dx, deltaY) => {
  cam.scrollY = Phaser.Math.Clamp(cam.scrollY + deltaY * 0.6, 0, maxScroll)
})
```

---

## Prototype numbering

| # | Name | Scene key |
|---|---|---|
| 001 | Foundation Test | `FoundationTestScene` |
| 002 | Rotation World | `RotationWorldScene` |
| 003 | Laser Mirrors | `LaserMirrorScene` |
| 004 | Time Echo | `TimeEchoScene` |
| 005 | Chain Reaction | `ChainReactionScene` |
| 006 | Steal Properties | `StealPropertiesScene` |
| 007 | Sokoban DNA | `SokobanScene` |
| 008 | Block Placement | `BlockPlacementScene` |
| 009 | Sort Lab | `SortLabScene` |
| 010 | Cozy Maze | `CozyMazeScene` |
| 011 | Loop Sort DNA | `LoopSortScene` |
| **012** | **next** | — |

---

## TypeScript gotchas

- Use `enum` not `const enum` (esbuild strips `const enum` incorrectly)
- `setData` returns `GameObject` — call separately: `obj.setData('key', val)`; do not chain after it for typed properties
- `posKey` is a reserved-looking name in scenes that extend `Phaser.Scene` — rename to `toKey`, `cellKey`, etc.
- Guard early-frame watches with optional chaining: `() => this.player?.x?.toFixed(0) ?? '-'`
- `getData` is not typed on all GameObjects — cast: `(go as { getData?: (k: string) => unknown }).getData?.('levelUI')`
