import Phaser from 'phaser'

/**
 * Visual personalities. A theme changes palette, corner radius, shadow weight,
 * animation intensity and default background — nothing structural. Prototypes
 * pick one; the presentation primitives read it.
 */
export type ThemeName = 'cozy' | 'arcade' | 'puzzle' | 'minimal' | 'toy'

export type TextRole =
  | 'display' | 'heading' | 'subheading' | 'body' | 'caption' | 'button' | 'score'

/** Declared here rather than in Backgrounds.ts so Theme stays dependency-free. */
export type BackgroundPreset =
  | 'solid' | 'gradient' | 'softGradient' | 'dots' | 'grid'
  | 'paper' | 'waves' | 'ambient'

export interface ThemeColors {
  background: number
  backgroundAlt: number
  surface: number
  surfaceAlt: number
  border: number
  primary: number
  secondary: number
  accent: number
  text: number
  muted: number
  success: number
  warning: number
  danger: number
  shadow: number
  /** Colour of the specular sheen drawn on top of filled shapes. */
  highlight: number
}

export interface ShadowSpec {
  /** Vertical offset in design units at the 1080-wide reference. */
  dy: number
  /** How far each successive soft layer grows. 0 = hard edge. */
  spread: number
  alpha: number
  /** Number of stacked layers used to fake a blur. 1–4. */
  layers: number
}

export interface Theme {
  name: ThemeName
  colors: ThemeColors
  radius:  { sm: number; md: number; lg: number; pill: number }
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number }
  stroke:  { thin: number; base: number; thick: number }
  shadows: { card: ShadowSpec; floating: ShadowSpec }
  /** Sheen / bevel strength applied by Draw. 0 disables the 3D read. */
  surfaceDepth: { highlight: number; bevel: number }
  /**
   * Font sizes at the 1080-wide portrait reference. These are NOT pre-scaled —
   * resolve them through `fontPx()` / `textStyle()` (or `presentation.text()`),
   * which apply the scene's font scale. Geometry (`radius`, `spacing`, `stroke`,
   * `shadows`) IS pre-scaled by `scaleThemeToScene`, which `createPresentation`
   * applies for you.
   */
  fontSize: Record<TextRole, number>
  fontWeight: Record<TextRole, 'normal' | 'bold'>
  fontFamily: string
  duration: { micro: number; fast: number; normal: number; dramatic: number }
  ease: { in: string; out: string; inOut: string; overshoot: string; settle: string }
  /** Multiplies animation displacement and particle counts. 0.5 = restrained, 1.4 = loud. */
  intensity: number
  background: BackgroundPreset
}

// ── Colour helpers ────────────────────────────────────────────────────────────

/** `0x4488ff` → `'#4488ff'`. Phaser text styles need strings; Graphics needs numbers. */
export function hex(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`
}

/** Lighten (pct > 0) or darken (pct < 0). `pct` is a 0..1 fraction of full range. */
export function shade(color: number, pct: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color)
  const f = (v: number): number => Phaser.Math.Clamp(Math.round(v + 255 * pct), 0, 255)
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue))
}

/** Blend `a` toward `b` by `t` (0..1). */
export function mix(a: number, b: number, t: number): number {
  const ca = Phaser.Display.Color.IntegerToColor(a)
  const cb = Phaser.Display.Color.IntegerToColor(b)
  const f = (x: number, y: number): number => Math.round(x + (y - x) * t)
  return Phaser.Display.Color.GetColor(f(ca.red, cb.red), f(ca.green, cb.green), f(ca.blue, cb.blue))
}

// ── Shared defaults ───────────────────────────────────────────────────────────

const FONT_STACK = '"Nunito", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'

const BASE_FONT_SIZE: Record<TextRole, number> = {
  display: 108, heading: 72, subheading: 52, body: 44, caption: 32, button: 46, score: 80,
}

const BASE_FONT_WEIGHT: Record<TextRole, 'normal' | 'bold'> = {
  display: 'bold', heading: 'bold', subheading: 'bold',
  body: 'normal', caption: 'normal', button: 'bold', score: 'bold',
}

const BASE_DURATION = { micro: 100, fast: 160, normal: 240, dramatic: 460 }

const BASE_EASE = {
  in:        'Quad.In',
  out:       'Quad.Out',
  inOut:     'Sine.InOut',
  overshoot: 'Back.Out',
  settle:    'Elastic.Out',
}

const BASE_SPACING = { xs: 8, sm: 16, md: 28, lg: 48, xl: 80 }

function theme(partial: Omit<Theme, 'fontSize' | 'fontWeight' | 'fontFamily' | 'duration' | 'ease' | 'spacing'> & Partial<Theme>): Theme {
  return {
    fontSize: BASE_FONT_SIZE,
    fontWeight: BASE_FONT_WEIGHT,
    fontFamily: FONT_STACK,
    duration: BASE_DURATION,
    ease: BASE_EASE,
    spacing: BASE_SPACING,
    ...partial,
  } as Theme
}

// ── Personalities ─────────────────────────────────────────────────────────────

const PUZZLE: Theme = theme({
  name: 'puzzle',
  colors: {
    background: 0x0d1020, backgroundAlt: 0x1a2040,
    surface: 0x1e2440, surfaceAlt: 0x2b3259, border: 0x3a4272,
    primary: 0x5b8cff, secondary: 0x8a6cff, accent: 0x4fd6c4,
    text: 0xeef1ff, muted: 0x8a93bd,
    success: 0x3ddc84, warning: 0xffb347, danger: 0xff5c6e,
    shadow: 0x000000, highlight: 0xffffff,
  },
  radius: { sm: 8, md: 16, lg: 28, pill: 999 },
  stroke: { thin: 2, base: 3, thick: 5 },
  shadows: {
    card:     { dy: 8,  spread: 3, alpha: 0.30, layers: 3 },
    floating: { dy: 18, spread: 6, alpha: 0.38, layers: 3 },
  },
  surfaceDepth: { highlight: 0.10, bevel: 0.14 },
  intensity: 1,
  background: 'softGradient',
})

const COZY: Theme = theme({
  name: 'cozy',
  colors: {
    background: 0xf3e7d0, backgroundAlt: 0xe4d2b0,
    surface: 0xfff9ee, surfaceAlt: 0xf2e3c8, border: 0xd3b98f,
    primary: 0xe08a52, secondary: 0x7fae6b, accent: 0xd9a441,
    text: 0x4a3a2c, muted: 0x9a866f,
    success: 0x6fae5e, warning: 0xdfa23c, danger: 0xd4644e,
    shadow: 0x6b5236, highlight: 0xffffff,
  },
  radius: { sm: 12, md: 24, lg: 40, pill: 999 },
  stroke: { thin: 2, base: 4, thick: 6 },
  shadows: {
    card:     { dy: 7,  spread: 4, alpha: 0.16, layers: 3 },
    floating: { dy: 16, spread: 7, alpha: 0.20, layers: 3 },
  },
  surfaceDepth: { highlight: 0.16, bevel: 0.08 },
  intensity: 0.8,
  background: 'paper',
})

const ARCADE: Theme = theme({
  name: 'arcade',
  colors: {
    background: 0x0a0618, backgroundAlt: 0x210c44,
    surface: 0x231046, surfaceAlt: 0x371b6b, border: 0x6a35c0,
    primary: 0xff3d8b, secondary: 0x22e0ff, accent: 0xffe14d,
    text: 0xffffff, muted: 0x9b86d6,
    success: 0x2bf5a0, warning: 0xffb020, danger: 0xff3355,
    shadow: 0x000000, highlight: 0xffffff,
  },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  stroke: { thin: 2, base: 4, thick: 6 },
  shadows: {
    card:     { dy: 8,  spread: 2, alpha: 0.45, layers: 2 },
    floating: { dy: 16, spread: 4, alpha: 0.50, layers: 3 },
  },
  surfaceDepth: { highlight: 0.14, bevel: 0.20 },
  intensity: 1.35,
  background: 'grid',
})

const MINIMAL: Theme = theme({
  name: 'minimal',
  colors: {
    background: 0xf4f5f7, backgroundAlt: 0xe7eaef,
    surface: 0xffffff, surfaceAlt: 0xeef1f5, border: 0xd4d9e1,
    primary: 0x2f6fed, secondary: 0x5b6474, accent: 0x111318,
    text: 0x1a1d23, muted: 0x79818f,
    success: 0x18a957, warning: 0xd08700, danger: 0xe0453a,
    shadow: 0x1a1d23, highlight: 0xffffff,
  },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  stroke: { thin: 1, base: 2, thick: 3 },
  shadows: {
    card:     { dy: 4,  spread: 3, alpha: 0.08, layers: 3 },
    floating: { dy: 12, spread: 6, alpha: 0.12, layers: 3 },
  },
  surfaceDepth: { highlight: 0.04, bevel: 0.04 },
  intensity: 0.55,
  background: 'solid',
})

const TOY: Theme = theme({
  name: 'toy',
  colors: {
    background: 0x62c6f0, backgroundAlt: 0xa6e2f8,
    surface: 0xffffff, surfaceAlt: 0xffe9a8, border: 0xffffff,
    primary: 0xff7a5c, secondary: 0x5ad1a0, accent: 0xffd447,
    text: 0x3a2f4a, muted: 0x8d7fa3,
    success: 0x4ecb71, warning: 0xffb02e, danger: 0xff5d5d,
    shadow: 0x1c3a4a, highlight: 0xffffff,
  },
  radius: { sm: 16, md: 28, lg: 44, pill: 999 },
  stroke: { thin: 3, base: 5, thick: 8 },
  shadows: {
    card:     { dy: 10, spread: 3, alpha: 0.22, layers: 3 },
    floating: { dy: 20, spread: 6, alpha: 0.26, layers: 3 },
  },
  surfaceDepth: { highlight: 0.22, bevel: 0.12 },
  intensity: 1.2,
  background: 'dots',
})

export const Themes: Record<ThemeName, Theme> = {
  puzzle: PUZZLE, cozy: COZY, arcade: ARCADE, minimal: MINIMAL, toy: TOY,
}

/** Resolves a name, a full theme, or undefined (→ `puzzle`). */
export function resolveTheme(t?: ThemeName | Theme): Theme {
  if (!t) return PUZZLE
  return typeof t === 'string' ? Themes[t] : t
}

/** Shallow-merges overrides onto a base personality. Colours merge one level deep. */
export function customizeTheme(base: ThemeName | Theme, overrides: Partial<Theme>): Theme {
  const b = resolveTheme(base)
  return {
    ...b, ...overrides,
    colors: { ...b.colors, ...(overrides.colors ?? {}) },
  }
}

// ── Typography scaling ────────────────────────────────────────────────────────

/**
 * Design spaces differ per prototype (960×540 landscape, 1080×1920 portrait), so
 * font sizes are authored once against the 1080 reference and scaled by the
 * scene's *smaller* dimension. That keeps text the same visual weight in both:
 * landscape lands at 0.5×, portrait at 1×.
 */
export function fontScale(scene: Phaser.Scene): number {
  const s = Math.min(scene.scale.gameSize.width, scene.scale.gameSize.height)
  return Math.max(0.3, s / 1080)
}

/** Resolved pixel size for a text role in this scene's design space. */
export function fontPx(scene: Phaser.Scene, role: TextRole, t?: ThemeName | Theme): number {
  return Math.round(resolveTheme(t).fontSize[role] * fontScale(scene))
}

/** A ready-to-use Phaser text style for a role. */
export function textStyle(
  scene: Phaser.Scene,
  role: TextRole,
  t?: ThemeName | Theme,
  color?: number,
): Phaser.Types.GameObjects.Text.TextStyle {
  const th = resolveTheme(t)
  return {
    fontFamily: th.fontFamily,
    fontSize: `${fontPx(scene, role, th)}px`,
    fontStyle: th.fontWeight[role],
    color: hex(color ?? th.colors.text),
  }
}

/** Scales a design-unit length (authored at the 1080 reference) into this scene. */
export function px(scene: Phaser.Scene, value: number): number {
  return Math.round(value * fontScale(scene))
}

/**
 * Scales a theme's geometry into a scene's design space.
 *
 * Themes are authored once against 1080×1920 portrait. A landscape 960×540
 * prototype has half the short dimension, so an unscaled 16px corner radius and
 * an 8px shadow offset land twice as heavy there as intended. This rescales
 * radius, spacing, stroke and shadow metrics; font sizes are deliberately left
 * at reference and scaled at the point of use by `fontPx` / `textStyle`.
 *
 * Returns the theme unchanged at 1:1, so portrait prototypes pay nothing.
 */
export function scaleThemeToScene(scene: Phaser.Scene, t: Theme): Theme {
  const k = fontScale(scene)
  if (Math.abs(k - 1) < 0.001) return t

  const r = (n: number): number => Math.max(1, Math.round(n * k))
  const spec = (s: ShadowSpec): ShadowSpec => ({
    ...s,
    dy: Math.max(1, s.dy * k),
    spread: Math.max(0.5, s.spread * k),
  })

  return {
    ...t,
    radius:  { sm: r(t.radius.sm), md: r(t.radius.md), lg: r(t.radius.lg), pill: t.radius.pill },
    spacing: {
      xs: r(t.spacing.xs), sm: r(t.spacing.sm), md: r(t.spacing.md),
      lg: r(t.spacing.lg), xl: r(t.spacing.xl),
    },
    stroke: {
      thin: Math.max(1, t.stroke.thin * k),
      base: Math.max(1, t.stroke.base * k),
      thick: Math.max(1, t.stroke.thick * k),
    },
    shadows: { card: spec(t.shadows.card), floating: spec(t.shadows.floating) },
  }
}
