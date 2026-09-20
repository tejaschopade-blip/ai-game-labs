// Loop Sort — design tokens.
//
// Every colour, radius, shadow and duration the prototype uses lives here.
// Nothing downstream picks a hex literal; if a value appears twice in the
// scene, it belongs in this file.
//
// Prototype-scoped on purpose (docs/ai-rules.md rules 2 and 5): these are the
// tokens of one visual direction, not a second foundation theme. The generic
// machinery — personalities, typography ramp, motion scale — stays in
// src/presentation/Theme.ts and is built on here.

import { customizeTheme, type Theme } from '../../src/presentation'
import type { CubeColor } from './LoopSortTypes'

// ── Visual direction ──────────────────────────────────────────────────────────
//
//   "Soft Toy Factory" — a small sorting machine built out of moulded plastic
//   toy parts, sitting on a warm paper desk.
//
//   cream paper ground  ·  pastel blue-grey machine  ·  saturated soft cubes
//
// The machine is deliberately the *least* saturated thing on screen. Cubes are
// the only strongly coloured objects, which is what makes them read as the
// subject rather than as decoration.

/** One cube's full material: body, underside, rim and specular. */
export interface CubeSkin {
  body: number
  /** Underside / far-side shading. */
  shade: number
  /** Edge rim, slightly darker than the body. */
  rim: number
  /** Emblem tint. Always light — it is a moulded impression, not a sticker. */
  emblem: number
}

/**
 * Emblem shape per colour. Redundant with hue on purpose: red/green is the
 * common confusion, and a moulded shape on a toy block is both an accessibility
 * affordance and a period-correct detail.
 */
export type CubeEmblem = 'circle' | 'square' | 'triangle' | 'diamond'

export const CUBE_SKIN: Record<CubeColor, CubeSkin> = {
  // Coral rather than fire-engine red — saturated enough to lead, soft enough
  // to sit next to three other colours without shouting.
  red:    { body: 0xff6b6b, shade: 0xd94f54, rim: 0xe25a5f, emblem: 0xffffff },
  blue:   { body: 0x4d9bf5, shade: 0x2f74c8, rim: 0x3a83d9, emblem: 0xffffff },
  // Teal-leaning green: separates from coral under deuteranopia far better
  // than a true green, and keeps the palette cohesive.
  green:  { body: 0x36c6a8, shade: 0x21987f, rim: 0x2aa98f, emblem: 0xffffff },
  yellow: { body: 0xffc93c, shade: 0xe0a316, rim: 0xeeb422, emblem: 0x7a5a10 },
}

export const CUBE_EMBLEM: Record<CubeColor, CubeEmblem> = {
  red: 'circle', blue: 'square', green: 'triangle', yellow: 'diamond',
}

/** Machine parts. Low saturation by design — the cubes carry the colour. */
export const MACHINE = {
  /** Outer moulded platform. */
  casing:      0xc3cee0,
  casingLight: 0xdde5f1,
  casingDark:  0x9fadc4,
  /** Recessed belt channel the cubes sit in. */
  channel:     0x8b9cb8,
  channelDark: 0x76889f,
  /** Empty slot well. */
  slot:        0x7f92ae,
  slotRim:     0xaebbd0,
  /** Tread marks across the belt. */
  tread:       0xffffff,
  /** Intake marker and other "the machine is telling you something" accents. */
  accent:      0xff9f43,
  accentDark:  0xe07f1f,
} as const

/** Paper ground the machine sits on. */
export const GROUND = {
  paper:     0xf7f1e6,
  paperDeep: 0xe6d9c2,
  ink:       0x4a4036,
  inkSoft:   0x9a8e7e,
  card:      0xfffdf8,
  cardEdge:  0xe3d8c6,
} as const

export const STATUS = {
  ok:      0x36c6a8,
  warn:    0xffb020,
  danger:  0xf0605f,
} as const

/** Obstacle materials. */
export const OBSTACLE = {
  curtain:      0xa98bdd,
  curtainDark:  0x8468bd,
  curtainSlat:  0x6d54a0,
  ice:          0xbfe8ff,
  iceDeep:      0x8fcdf0,
  iceRim:       0xe8f8ff,
  barrier:      0xff9f43,
  barrierDark:  0xd97a1c,
  crate:        0xcdbb9e,
  crateDark:    0xa8946f,
} as const

/**
 * Motion vocabulary. Named by *what happens*, not by duration, so a call site
 * reads as intent and a retune happens in one place.
 */
export const MOTION = {
  /** Batch card press / release. */
  press: 90,
  /** A cube flying from the tray into the belt. */
  enter: 320,
  /** A cube sliding along the belt to compact. */
  slide: 240,
  /** Landing squash. */
  land: 150,
  /** Matched cubes drawing together before they pop. */
  attract: 150,
  /** The held beat between "they connected" and "they cleared". */
  anticipate: 95,
  /** The pop itself. */
  clear: 260,
  /** Obstacle state changes — deliberately the slowest thing on screen. */
  obstacle: 460,
  /** Board settle before an end-of-level panel. */
  settle: 420,
} as const

/**
 * The foundation theme Loop Sort runs on: `cozy` re-coloured to the ground and
 * machine palette above. Everything the presentation layer draws by default —
 * panels, buttons, badges, shadows — picks these up automatically.
 */
export function loopSortTheme(): Theme {
  return customizeTheme('cozy', {
    colors: {
      background:    GROUND.paper,
      backgroundAlt: GROUND.paperDeep,
      surface:       GROUND.card,
      surfaceAlt:    0xf3ebdd,
      border:        GROUND.cardEdge,
      primary:       MACHINE.accent,
      secondary:     0x7f92ae,
      accent:        MACHINE.accent,
      text:          GROUND.ink,
      muted:         GROUND.inkSoft,
      success:       STATUS.ok,
      warning:       STATUS.warn,
      danger:        STATUS.danger,
      shadow:        0x6b5a42,
      highlight:     0xffffff,
    },
    radius: { sm: 14, md: 26, lg: 44, pill: 999 },
    // Soft plastic: a generous, low-contrast shadow rather than a hard drop.
    shadows: {
      card:     { dy: 8,  spread: 5, alpha: 0.13, layers: 3 },
      floating: { dy: 18, spread: 9, alpha: 0.16, layers: 3 },
    },
    surfaceDepth: { highlight: 0.2, bevel: 0.07 },
    intensity: 0.95,
    background: 'paper',
  })
}
