// Arrows — design tokens.
//
// Every colour, radius, shadow and duration the prototype uses lives here.
// Nothing downstream picks a hex literal; if a value appears twice in the
// scene or the visuals, it belongs in this file.
//
// Prototype-scoped on purpose (docs/ai-rules.md rules 2 and 5): these are the
// tokens of one visual direction, not a second foundation theme. The generic
// machinery — personalities, typography ramp, motion scale — stays in
// src/presentation/Theme.ts and is built on here.

import { customizeTheme, type Theme } from '../../src/presentation'
import type { Dir } from './ArrowsTypes'

// ── Visual direction ──────────────────────────────────────────────────────────
//
//   "Departure Board" — a slate puzzle tray lying on warm paper, holding four
//   colours of chunky moulded arrow tile that want to leave.
//
//   cream paper ground  ·  cool slate tray  ·  four saturated arrow hues
//
// The tray is deliberately the least saturated thing on screen and the *only*
// cool surface. Arrows are the only strongly coloured objects, which is what
// makes them read as the subject rather than as decoration — and what makes a
// board that is half empty read as progress at a glance.

/** One arrow's full material: body, underside, rim, and the glyph moulded into it. */
export interface ArrowSkin {
  body: number
  /** Underside / far-side shading. */
  shade: number
  /** Edge rim, slightly darker than the body. */
  rim: number
  /** Glyph tint. Always light — it is a moulded impression, not a sticker. */
  glyph: number
}

/**
 * Hue per direction. Redundant with the glyph's rotation on purpose: level 4
 * ("read the shape, not the colour") deliberately tests direction reading, so
 * colour must never be the only cue — but on a 49-tile board at phone size it
 * is what lets you scan a whole row without focusing on each tile.
 *
 * The four hues are spread around the wheel rather than paired, so no two
 * directions collapse under the common colour-vision deficiencies.
 */
export const ARROW_SKIN: Record<Dir, ArrowSkin> = {
  right: { body: 0xff7a5c, shade: 0xd2543c, rim: 0xe36448, glyph: 0xffffff },
  left:  { body: 0xa07cf0, shade: 0x7553c4, rim: 0x8a63dc, glyph: 0xffffff },
  up:    { body: 0x36c6a8, shade: 0x1f9080, rim: 0x2aa98f, glyph: 0xffffff },
  down:  { body: 0x4d9bf5, shade: 0x2f74c8, rim: 0x3a83d9, glyph: 0xffffff },
}

/** The tray the arrows sit in. Low saturation by design — the tiles carry the colour. */
export const TRAY = {
  /** Outer moulded frame. */
  frame:      0x8699b6,
  frameLight: 0xa9bad4,
  frameDark:  0x697c9b,
  /** Recessed playfield the cells are cut into. */
  field:      0x7889a6,
  fieldDark:  0x64758f,
  /** An empty cell. */
  well:       0x6f8099,
  wellDark:   0x5d6d85,
  wellLip:    0x9aabc4,
  /** Hairline grid ink across the field. */
  grid:       0x5f7089,
  /** The lipped notch in the rim an arrow leaves through. */
  gate:       0x9fb2cc,
} as const

/** Paper ground the tray sits on. */
export const GROUND = {
  paper:     0xf6efe3,
  paperDeep: 0xe4d7c1,
  ink:       0x46403a,
  inkSoft:   0x93897c,
  card:      0xfffdf8,
  cardEdge:  0xe3d8c6,
} as const

export const STATUS = {
  ok:     0x36c6a8,
  warn:   0xf7b32b,
  danger: 0xf0605f,
} as const

/** UI accent. Amber rather than a fifth arrow hue, so UI never reads as a piece. */
export const ACCENT = 0xf7b32b

/**
 * Motion vocabulary. Named by *what happens*, not by duration, so a call site
 * reads as intent and a retune happens in one place.
 */
export const MOTION = {
  /** Tile press / release. */
  press: 90,
  /** The wind-up before a freed arrow launches — the anticipation beat. */
  wind: 110,
  /** The flight off the board. Scaled by distance at the call site. */
  flight: 240,
  /** A blocked arrow lunging into its blocker and rebounding. */
  bump: 120,
  /** The blocker's reply. */
  recoil: 220,
  /** A nudged arrow sliding to rest behind its blocker. */
  slide: 220,
  /** Per-tile delay when the board deals itself in. */
  deal: 26,
  /** Board settle before an end-of-level panel. */
  settle: 380,
} as const

/** How long the runway preview stays up after a tap resolves. */
export const PREVIEW_FADE = 180

/**
 * The foundation theme Arrows runs on: `cozy` re-coloured to the ground and
 * tray palette above. Everything the presentation layer draws by default —
 * panels, buttons, badges, shadows — picks these up automatically.
 */
export function arrowsTheme(): Theme {
  return customizeTheme('cozy', {
    colors: {
      background:    GROUND.paper,
      backgroundAlt: GROUND.paperDeep,
      surface:       GROUND.card,
      surfaceAlt:    0xf2e9da,
      border:        GROUND.cardEdge,
      primary:       ACCENT,
      secondary:     TRAY.frame,
      accent:        ACCENT,
      text:          GROUND.ink,
      muted:         GROUND.inkSoft,
      success:       STATUS.ok,
      warning:       STATUS.warn,
      danger:        STATUS.danger,
      shadow:        0x6b5a42,
      highlight:     0xffffff,
    },
    radius: { sm: 14, md: 26, lg: 44, pill: 999 },
    // Soft moulded plastic: a generous, low-contrast shadow rather than a hard drop.
    shadows: {
      card:     { dy: 8,  spread: 5, alpha: 0.13, layers: 3 },
      floating: { dy: 18, spread: 9, alpha: 0.16, layers: 3 },
    },
    surfaceDepth: { highlight: 0.2, bevel: 0.07 },
    intensity: 0.95,
    background: 'paper',
  })
}
