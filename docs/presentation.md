# Presentation Layer

**Goal: a new prototype should look like a small mobile game on day one, not like a
developer test scene.**

The presentation layer is a thin set of primitives over Phaser — theme, shape
drawing, animation, VFX, touch feedback, backgrounds and a juice facade. It is
not an engine, it owns no game state, and it never knows what your prototype is.

---

## One-call setup

```ts
import { createPresentation } from '../../src/presentation'

create() {
  const p = createPresentation(this, {
    theme: 'cozy',          // 'cozy' | 'arcade' | 'puzzle' | 'minimal' | 'toy'
    background: true,       // or { preset: 'dots', vignette: 0.3 }
  })

  p.ui.createButton({ x, y, text: 'Play', onPress: () => this.start() })
  p.anim.pop(tile)
  p.juice.success(x, y, { target: tile, text: '+1' })
  p.vfx.burst(x, y)
  p.press(tile, { hitRadius: 40, onPress: () => this.pick(tile) })
  p.layout.safeTopCenter(40)
  this.add.text(x, y, 'Score', p.text('heading'))
}
```

`createPresentation` returns a flat bundle — `theme`, `layout`, `ui`, `anim`,
`vfx`, `juice`, `press()`, `text()`, `fontPx()`, `px()`. It registers its own
`SHUTDOWN` cleanup, so a background cannot leak across a scene restart.

Everything is also importable individually if you only want one piece.

---

## Architecture

```
src/presentation/
├── Theme.ts         5 personalities, colours, typography ramp, motion, scaling
├── Draw.ts          rounded cards, soft circles, tiles, shadows, rings, baking
├── Anim.ts          pop / punch / bounce / shake / wobble / float / spin / spring / …
├── Vfx.ts           burst / spark / ring / glow / confetti / trail / floatingText
├── Touch.ts         makePressable() — the press→release lifecycle + forgiving hits
├── Backgrounds.ts   themed presets + vignette / waves / paper
├── Juice.ts         select / success / fail / collect / destroy / impact / levelComplete
└── index.ts         createPresentation() bundle + re-exports
```

It builds on the existing foundation rather than replacing it: `Layout`,
`AnimHelper`, `VFXManager`, `AudioManager`, `Background`, `Transitions`,
`CameraManager` and `UIFactory` are all still the implementation underneath.
`GameJuice` is now a compatibility facade over `Juice`.

```
Prototype
    │
    ▼
createPresentation()  ──►  Theme  (personality: palette, radius, motion, intensity)
    │
    ├── ui      → UIFactory   (themed) ─┐
    ├── anim    → AnimHelper           ├─► Draw  (rounded / soft / baked shapes)
    ├── vfx     → Phaser tweens        │
    ├── juice   → anim + vfx + audio ──┘
    ├── layout  → Layout      (safe areas, anchors)
    └── press   → Touch
```

---

## Theme

Five personalities. Each changes palette, corner radius, shadow weight, stroke
width, sheen/bevel strength, animation intensity and default background — never
layout or behaviour.

| Theme | Feel | Background | Intensity |
|---|---|---|---|
| `puzzle` | dark lab, cool blues — the default | soft gradient | 1.0 |
| `cozy` | warm paper, rounded, gentle | paper | 0.8 |
| `arcade` | neon on near-black, punchy | grid | 1.35 |
| `minimal` | light, flat, restrained | solid | 0.55 |
| `toy` | bright, chunky, candy | dots | 1.2 |

```ts
theme.colors.primary / surface / background / text / muted / success / warning / danger
theme.radius.sm | md | lg | pill
theme.spacing.xs | sm | md | lg | xl
theme.shadows.card | floating
theme.duration.micro | fast | normal | dramatic
theme.intensity          // multiplies animation displacement and particle counts
```

Start from one and adjust rather than inventing a palette:

```ts
import { customizeTheme } from '../../src/presentation'
const theme = customizeTheme('cozy', { colors: { primary: 0x4f8ef7 } })
```

### Typography

Seven roles: `display`, `heading`, `subheading`, `body`, `caption`, `button`,
`score`. Sizes are authored once against the 1080-wide portrait reference and
resolved per scene:

```ts
this.add.text(x, y, 'Level 3', p.text('heading'))
this.add.text(x, y, 'tap to begin', p.text('caption', theme.colors.muted))
```

A landscape 960×540 scene resolves at 0.5×, portrait 1080×1920 at 1×, so the
same call reads at the same visual weight in both. **Do not hardcode font sizes
in prototypes.**

The default family is Nunito, loaded in `index.html` and awaited in `main.ts`
before the game boots. Phaser's own default is Courier — which is most of why
untouched prototypes read as debug scenes.

### Scaling

`createPresentation` pre-scales the theme's *geometry* (radius, spacing, stroke,
shadow offsets) into the scene's design space via `scaleThemeToScene`. Font sizes
stay at reference and are scaled at the point of use by `p.text()` / `p.fontPx()`.
Use `p.px(n)` for your own reference-authored lengths.

---

## Draw — making primitives look intentional

The recipe that separates a game surface from a coloured rectangle:

```
soft shadow  →  base fill  →  top sheen  →  bottom bevel  →  stroke
```

```ts
drawRoundedCard(g, x, y, w, h, { fill, radius, stroke, strokeWidth, inset })
drawRoundedButton(g, x, y, w, h, { fill })
drawSoftCircle(g, x, y, r, { fill })        // specular + rim = a ball, not a dot
drawGameTile(g, x, y, size, { fill })       // moulded face with an inset lip
drawPill(g, x, y, w, h, { fill })
drawShadow(g, x, y, w, h, { dy, spread, layers })
drawShadowCircle(g, x, y, r)
drawHighlight(g, x, y, w, h, radius, strength)
drawSelectionRing(g, x, y, r, color)
drawSelectionBox(g, x, y, w, h, color)
```

All helpers draw **centred on (x, y)**. Pass `0, 0` when the Graphics object is
itself positioned.

Depth comes from stacked cheap fills, not lighting:

```
       ┌──────────────┐   ← sheen (top 42%, theme highlight)
       │    OBJECT    │
       └──────────────┘   ← bevel (bottom 38%, black)
          ▓▓▓▓▓▓▓▓        ← 3 fading layers = a blur you can afford
```

### Bake static art — this is not optional at scale

A Phaser `Graphics` object is immediate mode: it re-walks its command list and
**re-tessellates every arc, on the CPU, on every frame.** These helpers spend
4–7 fills per object to get their depth, which multiplies that cost.

```ts
bakeGraphics(this, w, h, (g, w, h) => {
  drawRoundedCard(g, w / 2, h / 2, cardW, cardH, { fill })
}).setPosition(x, y)
```

Returns an `Image` — one quad — and releases its texture automatically when the
Image is destroyed. Size the canvas to include shadow offset and spread or it
clips. `fillGradientStyle` flattens when baked, so keep gradients live.

When many objects share the same art — a board of identically-drawn pieces, a
repeated shadow — use the **named** variant instead, so one texture backs all of
them:

```ts
const key = bakeTexture(this, `cube_${color}_${size}`, w, h, (g, w, h) => { ... })
this.add.image(x, y, key)
```

It returns immediately if the key exists, so it is safe to call per object in a
build loop. The caller owns the texture's lifetime: put anything that changes
the art (size, colour, variant) in the key, and `scene.textures.remove(key)` when
rebuilding at a different size.

Measured in this repo under software rendering: the menu ran at 25fps with 11
live card Graphics and 56fps with the same art baked; prototype 009 went from
20fps to 36fps.

**Rule: if it does not change every frame, bake it.**

---

## Animation

```ts
p.anim.pop(target)                    // appear, with overshoot
p.anim.popOut(target)
p.anim.punch(target, 1.18)            // the workhorse — use on anything acted on
p.anim.bounce(target, 14)
p.anim.shake(target, 8)               // failure
p.anim.wobble(target, 7)              // "no", without leaving the slot
p.anim.squash(target, 0.14)           // impact: flatten, stretch, spring back
p.anim.anticipate(target, 0.1, { onComplete })  // wind-up, fires on release
p.anim.float(target)                  // looping idle drift
p.anim.pulse(target)                  // looping attention
p.anim.spin(target, 1)
await p.anim.spring(target, x, y)     // move + elastic settle
await p.anim.moveTo(target, x, y)     // move + small overshoot
p.anim.slideIn(target, 'bottom')
p.anim.fadeIn(target) / fadeOut(target)
p.anim.stagger(targets, 45)           // group entrance
p.anim.stop(target)
```

Durations come from the theme:

```
micro     100ms   press / release
fast      160ms   selection, small state changes
normal    240ms   movement, placement
dramatic  460ms   level transitions
```

Displacement scales with `theme.intensity`, so switching to `minimal` calms
every animation without touching call sites. Avoid linear easing.

The objective is not *more* animation. It is **better perceived responsiveness**.

---

## VFX

```ts
p.vfx.burst(x, y, { color, intensity: 'small' | 'medium' | 'large' })
p.vfx.spark(x, y)                 // streaks — impact
p.vfx.ring(x, y, radius)          // expanding pulse
p.vfx.glow(x, y, radius)
p.vfx.confetti()                  // level completion only
const stop = p.vfx.trail(target)  // caller MUST call stop()
p.vfx.floatingText(x, y, '+10')
p.vfx.screenShake(3, 140)
p.vfx.flash()
```

Counts scale with `theme.intensity` and are hard-capped at 48 particles per call.
Travel distances are scaled to the scene's design space. Every particle destroys
itself in its tween's `onComplete` — never call `tweens.killAll()` (see
`prototypes/CONVENTIONS.md`).

---

## Touch feedback

```ts
const h = p.press(tile, {
  hitRadius: 40,          // or hitSize: { width, height }
  hitPadding: 16,         // design units, on every side — default 16
  pressScale: 0.94,
  onPress: () => this.pick(tile),
})
h.setEnabled(false)
h.reject()                // "not allowed" shake, without firing onPress
h.destroy()
```

```
IDLE → (pointerdown) PRESSED → (pointerup over target) RELEASE → onPress
                           └── (pointer leaves / cancels) → IDLE
```

Two things matter more than they look:

1. **`onPress` fires on release over the target, never on press.** Firing on
   press removes the player's ability to cancel by sliding off, and double-fires
   on several mobile browsers.
2. **The hit area is padded beyond the visual.** A target that needs a
   pixel-accurate tap feels broken even when it works.

Pointer events are used throughout, so mouse testing on desktop behaves
identically. Keyboard stays available for development, but must not be the
primary interaction.

---

## Juice

One call per *meaning*, not per effect.

```ts
p.juice.select(target)                                  // tap acknowledged
p.juice.tap(target)                                     // menu / toggle
p.juice.success(x, y, { target, text: '+10' })
p.juice.fail(x, y, { target })
p.juice.collect(x, y, { target, to: scoreCounter })
p.juice.destroy(x, y, { target })
p.juice.impact(x, y)
p.juice.levelComplete({ targets: tiles })
```

Each composes animation + particles + optional sound + optional floating text +
a restrained camera nudge. Per-call `intensity` (`'small' | 'medium' | 'large'`)
multiplies against the theme's. Pass `shake: false` to suppress the camera.

Audio is optional throughout: a sound plays only when an `AudioManager` was
supplied **and** the key is actually loaded, so this repo's zero audio assets are
a silent no-op, not a crash.

```ts
const p = createPresentation(this, {
  audio: new AudioManager(this),
  sounds: { select: 'sfx_click', success: 'sfx_good', complete: 'sfx_win' },
})
```

Slots: `click`, `select`, `move`, `match`, `chain`, `success`, `fail`,
`collect`, `impact`, `destroy`, `complete`.

`juice.play('match')` is the semantic call — the prototype names the *event*,
and what it sounds like is a property of the sound map, not of the call site.

`levelComplete` is deliberately the loudest thing in the library. Everything else
is restrained so that it lands.

---

## Backgrounds

```ts
createPresentation(this, { background: { preset: 'dots', vignette: 0.3 } })
// or standalone:
const bg = applyBackground(this, { preset: 'waves' }, theme)
bg.destroy()
```

Presets: `solid`, `gradient`, `softGradient`, `dots`, `grid`, `paper`, `waves`,
`ambient`. Omitting `preset` uses the theme's default.

`light: 0..1` adds a soft radial bloom behind the play area (`lightY` moves it,
`lightColor` tints it). It is the cheapest way to make a background read as
*composed* rather than *filled* — the board sits in a pool of light instead of
on an even sheet. Baked, so it costs one quad.

Pattern ink is theme-aware (dark on light themes, light on dark ones). The
vignette — four edge gradients pulling the frame darker so the centre reads as
lit — is the cheapest depth trick available and is on by default everywhere
except `solid`.

Ambient motes default to **0**. They compete with gameplay; turn them on only
when the board is quiet.

---

## Responsive layout

Default target: **1080 × 1920 portrait, touch-first.** Existing prototypes
001–010 are landscape 960 × 540 and are never retrofitted.

```ts
p.layout.center()              // { x, y }
p.layout.topCenter() / bottomCenter() / topLeft() / bottomRight() / …
p.layout.safeTop(24) / safeBottom() / safeLeft() / safeRight()
p.layout.safeTopCenter(40) / safeBottomCenter(-40)
p.layout.safeRect              // { x, y, width, height }
p.layout.insets                // { top, right, bottom, left }
```

Insets come from CSS `env(safe-area-inset-*)` via a hidden probe, combined with a
2%-of-design-space floor so UI never sits flush to the edge on desktop either.
`index.html` must keep `viewport-fit=cover` or iOS reports zero.

Verified at 360×800, 390×844, 412×915 and 1080×1920.

---

## UI components

`p.ui` is a themed `UIFactory`.

```ts
p.ui.createButton({ x, y, text, onPress, width, height, color,
                    selectedColor, state, minTouch })
p.ui.createPanel({ x, y, width, height, title, fill, stroke, shadow })
p.ui.createLabel({ x, y, text, textScale, color, align, outline, wordWrapWidth })
p.ui.createBadge({ x, y, text, color })        // pill chip, sizes to its text
p.ui.createDots({ x, y, count, active })       // progress dots, e.g. 3 of 5
p.ui.createProgressBar({ x, y, width, value })
p.ui.createIcon({ x, y, glyph | draw, onPress })
p.ui.toast('Level complete!')
```

Buttons support `normal` / `pressed` / `disabled` / `selected`, fire on release,
sink on press and overshoot back on release. The default hit area is
`DesignTokens.button.minTouch` (120 units ≈ 44 CSS px at 1080 wide); pass
`minTouch: 0` in a dense landscape layout where the padding would steal taps.

---

## Transitions and camera

```ts
import { fadeIn, fadeOut, transitionTo } from '../../src/systems/Transitions'
fadeIn(this)
transitionTo(this, 'GameSelectScene')

const cam = new CameraManager(this)
cam.follow(player); cam.zoom(1.2); cam.shake(); cam.setBounds(...)
```

Camera shake is subtle by default. Reserve it for important events — if
everything shakes, nothing does.

---

## How to build a new prototype with this

1. `createPresentation(this, { theme, background: true })` as the first line of
   `create()`.
2. Pick a personality. Do not hand-pick colours; use `theme.colors.*`.
3. Lay out with `p.layout` anchors and safe areas — no magic screen numbers.
4. Draw pieces with `Draw` helpers, then **bake** anything static.
5. Make everything tappable with `p.press(...)`, with padded hit areas.
6. Use `p.juice.*` for feedback. One call per meaning.
7. Use `p.text(role)` for every string.
8. Fix hierarchy and spacing *before* reaching for particles.

A prototype that reads clearly with no particles beats a busy one.
