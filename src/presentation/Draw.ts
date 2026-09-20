import Phaser from 'phaser'
import { Theme, ThemeName, resolveTheme, shade } from './Theme'

/**
 * Shape primitives that make Phaser Graphics read as *designed* rather than
 * debug. Every helper is a handful of fills — no shaders, no render textures.
 *
 * The recipe that does the work:
 *   soft shadow  →  base fill  →  top sheen  →  bottom bevel  →  stroke
 *
 * All helpers draw **centred on (x, y)**, matching how the repo already
 * positions Graphics objects (`gfx.setPosition(cx, cy)` then draw around 0,0).
 * Pass `x = y = 0` when the Graphics object itself is positioned.
 */

export type CornerRadius = Phaser.Types.GameObjects.Graphics.RoundedRectRadius

export interface SurfaceStyle {
  fill: number
  fillAlpha?: number
  stroke?: number
  strokeWidth?: number
  strokeAlpha?: number
  radius?: number
  /** Top sheen strength, 0..1. Defaults to the theme's `surfaceDepth.highlight`. */
  highlight?: number
  /** Bottom darkening, 0..1. Defaults to the theme's `surfaceDepth.bevel`. */
  bevel?: number
  /** Inset hairline just inside the edge — reads as a machined rim. */
  inset?: boolean
}

export interface ShadowStyle {
  dy?: number
  spread?: number
  alpha?: number
  layers?: number
  color?: number
  radius?: number
}

function clampRadius(r: number, w: number, h: number): number {
  return Math.max(0, Math.min(r, Math.min(w, h) / 2))
}

/** Rounded rect with independent corners, centred on (x, y). */
function roundedRect(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  radius: number | CornerRadius,
): void {
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius)
}

// ── Shadows ───────────────────────────────────────────────────────────────────

/**
 * Layered drop shadow. Successive layers grow by `spread` and fade, which reads
 * as a blur at a fraction of the cost of one. 3 layers is plenty.
 */
export function drawShadow(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  s: ShadowStyle = {},
  t?: ThemeName | Theme,
): void {
  const th     = resolveTheme(t)
  const spec   = th.shadows.card
  const dy     = s.dy ?? spec.dy
  const spread = s.spread ?? spec.spread
  const layers = Math.max(1, s.layers ?? spec.layers)
  const alpha  = s.alpha ?? spec.alpha
  const color  = s.color ?? th.colors.shadow
  const radius = s.radius ?? th.radius.md

  for (let i = layers - 1; i >= 0; i--) {
    const grow = spread * i
    const a    = (alpha / layers) * (1 + i * 0.15)
    g.fillStyle(color, a)
    roundedRect(g, x, y + dy, w + grow * 2, h + grow * 2,
      clampRadius(radius + grow, w + grow * 2, h + grow * 2))
  }
}

/** Layered drop shadow for a circular object. */
export function drawShadowCircle(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, r: number,
  s: ShadowStyle = {},
  t?: ThemeName | Theme,
): void {
  const th     = resolveTheme(t)
  const spec   = th.shadows.card
  const dy     = s.dy ?? spec.dy
  const spread = s.spread ?? spec.spread
  const layers = Math.max(1, s.layers ?? spec.layers)
  const alpha  = s.alpha ?? spec.alpha
  const color  = s.color ?? th.colors.shadow

  for (let i = layers - 1; i >= 0; i--) {
    g.fillStyle(color, (alpha / layers) * (1 + i * 0.15))
    // Slightly flattened — a contact shadow on a ground plane, not a clone.
    g.fillEllipse(x, y + dy, (r + spread * i) * 2, (r + spread * i) * 1.72)
  }
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

/**
 * The workhorse. A rounded panel/card with a top sheen and bottom bevel, which
 * is what separates "a game surface" from "a coloured rectangle".
 */
export function drawRoundedCard(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  style: SurfaceStyle,
  t?: ThemeName | Theme,
): void {
  const th   = resolveTheme(t)
  const r    = clampRadius(style.radius ?? th.radius.md, w, h)
  const hi   = style.highlight ?? th.surfaceDepth.highlight
  const bev  = style.bevel ?? th.surfaceDepth.bevel

  g.fillStyle(style.fill, style.fillAlpha ?? 1)
  roundedRect(g, x, y, w, h, r)

  if (bev > 0) {
    const bh = h * 0.38
    g.fillStyle(0x000000, bev)
    g.fillRoundedRect(x - w / 2, y + h / 2 - bh, w, bh, {
      tl: 0, tr: 0, bl: Math.min(r, bh), br: Math.min(r, bh),
    })
  }

  if (hi > 0) {
    const sh = h * 0.42
    g.fillStyle(th.colors.highlight, hi)
    g.fillRoundedRect(x - w / 2, y - h / 2, w, sh, {
      tl: r, tr: r, bl: Math.min(r, sh) * 0.35, br: Math.min(r, sh) * 0.35,
    })
  }

  if (style.inset) {
    g.lineStyle(1, th.colors.highlight, hi * 1.6)
    g.strokeRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4,
      clampRadius(r - 2, w, h))
  }

  const sw = style.strokeWidth ?? 0
  if (style.stroke !== undefined && sw > 0) {
    g.lineStyle(sw, style.stroke, style.strokeAlpha ?? 1)
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r)
  }
}

/** A card with a pill-ish radius and a stronger sheen — reads as pressable. */
export function drawRoundedButton(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  style: SurfaceStyle,
  t?: ThemeName | Theme,
): void {
  const th = resolveTheme(t)
  drawRoundedCard(g, x, y, w, h, {
    radius: th.radius.md,
    highlight: th.surfaceDepth.highlight * 1.5,
    bevel: th.surfaceDepth.bevel * 0.7,
    ...style,
  }, th)
}

/** Circle with a top-left specular and a bottom rim — a ball, not a dot. */
export function drawSoftCircle(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, r: number,
  style: SurfaceStyle,
  t?: ThemeName | Theme,
): void {
  const th  = resolveTheme(t)
  const hi  = style.highlight ?? th.surfaceDepth.highlight
  const bev = style.bevel ?? th.surfaceDepth.bevel

  g.fillStyle(style.fill, style.fillAlpha ?? 1)
  g.fillCircle(x, y, r)

  if (bev > 0) {
    g.fillStyle(0x000000, bev * 0.8)
    g.fillEllipse(x, y + r * 0.42, r * 1.55, r * 1.05)
    g.fillStyle(style.fill, style.fillAlpha ?? 1)
    g.fillCircle(x, y - r * 0.06, r * 0.93)
  }

  if (hi > 0) {
    g.fillStyle(th.colors.highlight, hi * 2.2)
    g.fillEllipse(x - r * 0.28, y - r * 0.36, r * 0.82, r * 0.58)
    g.fillStyle(th.colors.highlight, hi * 0.9)
    g.fillEllipse(x - r * 0.1, y - r * 0.15, r * 1.25, r * 0.95)
  }

  const sw = style.strokeWidth ?? 0
  if (style.stroke !== undefined && sw > 0) {
    g.lineStyle(sw, style.stroke, style.strokeAlpha ?? 1)
    g.strokeCircle(x, y, r)
  }
}

/**
 * Square-ish playfield tile: rounded card plus an inner inset face, which is
 * what makes grid pieces look manufactured instead of drawn.
 */
export function drawGameTile(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, size: number,
  style: SurfaceStyle,
  t?: ThemeName | Theme,
): void {
  const th = resolveTheme(t)
  const r  = clampRadius(style.radius ?? th.radius.md, size, size)

  drawRoundedCard(g, x, y, size, size, { ...style, radius: r, highlight: 0, bevel: 0 }, th)

  // Raised face, inset by ~9% — the lip left behind is the "moulded" read.
  const inset = size * 0.09
  const face  = size - inset * 2
  g.fillStyle(shade(style.fill, 0.07), 1)
  g.fillRoundedRect(x - face / 2, y - face / 2 - inset * 0.25, face, face,
    clampRadius(r * 0.72, face, face))

  const hi = style.highlight ?? th.surfaceDepth.highlight
  if (hi > 0) {
    g.fillStyle(th.colors.highlight, hi)
    g.fillRoundedRect(x - face / 2, y - face / 2 - inset * 0.25, face, face * 0.4, {
      tl: r * 0.72, tr: r * 0.72, bl: 0, br: 0,
    })
  }

  const sw = style.strokeWidth ?? 0
  if (style.stroke !== undefined && sw > 0) {
    g.lineStyle(sw, style.stroke, style.strokeAlpha ?? 1)
    g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, r)
  }
}

/** Pill / chip. Used for badges, HUD chips and segmented controls. */
export function drawPill(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  style: SurfaceStyle,
  t?: ThemeName | Theme,
): void {
  drawRoundedCard(g, x, y, w, h, { ...style, radius: h / 2 }, t)
}

/** Standalone top sheen, for compositing onto a shape drawn elsewhere. */
export function drawHighlight(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  radius: number,
  strength = 0.12,
  t?: ThemeName | Theme,
): void {
  const th = resolveTheme(t)
  const r  = clampRadius(radius, w, h)
  const sh = h * 0.42
  g.fillStyle(th.colors.highlight, strength)
  g.fillRoundedRect(x - w / 2, y - h / 2, w, sh, {
    tl: r, tr: r, bl: Math.min(r, sh) * 0.35, br: Math.min(r, sh) * 0.35,
  })
}

/**
 * Focus / selection ring. Two strokes — a crisp inner line and a wide soft
 * outer one — read as a glow without a blur pass.
 */
export function drawSelectionRing(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, r: number,
  color: number,
  t?: ThemeName | Theme,
): void {
  const th = resolveTheme(t)
  g.lineStyle(th.stroke.thick * 2, color, 0.14)
  g.strokeCircle(x, y, r + th.stroke.thick)
  g.lineStyle(th.stroke.base, color, 0.95)
  g.strokeCircle(x, y, r)
}

/** Rounded selection ring, for cards and tiles. */
export function drawSelectionBox(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number,
  radius?: number,
  t?: ThemeName | Theme,
): void {
  const th = resolveTheme(t)
  const r  = clampRadius(radius ?? th.radius.md, w, h)
  g.lineStyle(th.stroke.thick * 2, color, 0.14)
  g.strokeRoundedRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, r + 4)
  g.lineStyle(th.stroke.base, color, 0.95)
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r)
}

export { shade }

// ── Baking ────────────────────────────────────────────────────────────────────

let bakeSeq = 0

/**
 * Renders a drawing once into a texture and returns an Image showing it.
 *
 * **Use this for anything static.** A Phaser `Graphics` object is immediate
 * mode: it re-walks its command list and re-tessellates every arc, on the CPU,
 * on every single frame. That is fine for one or two shapes and ruinous for a
 * screenful — and the helpers above spend 4–7 fills per object precisely to get
 * their depth, which multiplies the cost. A baked Image is one quad.
 *
 * Measured on this repo's prototype 009 under software rendering: 20fps with
 * live Graphics for the board, tray and pieces, 55fps with the same art baked.
 *
 * The `draw` callback receives a detached Graphics and the canvas size; draw
 * centred on `(w / 2, h / 2)`, because the returned Image has origin 0.5.
 * Size the canvas to include shadow offset and spread, or it will clip.
 * The texture is released automatically when the Image is destroyed.
 *
 * Canvas-renderer caveat: `fillGradientStyle` degrades to a flat fill when
 * baked, so keep gradients (backgrounds, vignettes) as live Graphics.
 */
export function bakeGraphics(
  scene: Phaser.Scene,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics, w: number, h: number) => void,
): Phaser.GameObjects.Image {
  const key = bakeTexture(scene, `__bake_${++bakeSeq}`, width, height, draw)
  const img = scene.add.image(0, 0, key).setOrigin(0.5)
  img.once(Phaser.GameObjects.Events.DESTROY, () => {
    if (scene.textures.exists(key)) scene.textures.remove(key)
  })
  return img
}

/**
 * Bakes a drawing into a **named, shared** texture and returns the key.
 *
 * Use this instead of `bakeGraphics` when many objects show the same art — a
 * board full of identically-drawn pieces, a repeated shadow. One texture backs
 * every `scene.add.image(x, y, key)`, so thirteen crates cost one bake.
 *
 * Returns immediately if the key already exists, which makes it safe to call
 * per object in a build loop.
 *
 * Unlike `bakeGraphics`, the caller owns the texture's lifetime: include any
 * size or variant that affects the art in the key, and call
 * `scene.textures.remove(key)` when rebuilding at a different size.
 */
export function bakeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics, w: number, h: number) => void,
): string {
  if (scene.textures.exists(key)) return key

  const w = Math.max(1, Math.ceil(width))
  const h = Math.max(1, Math.ceil(height))
  const g = scene.make.graphics({}, false)
  draw(g, w, h)
  g.generateTexture(key, w, h)
  g.destroy()
  return key
}
