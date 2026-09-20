// Loop Sort — how things are drawn.
//
// Pure drawing functions over a Phaser Graphics. They never touch a scene, a
// tween or game state, which is what lets the scene bake all of them into
// textures (see bakeTexture / bakeGraphics in src/presentation/Draw.ts).
//
// Prototype-scoped: a conveyor made of moulded toy parts is not a foundation
// concern. The generic primitives underneath — rounded cards, layered shadows,
// sheens — come from src/presentation/Draw.ts and are reused here rather than
// re-derived.

import Phaser from 'phaser'
import { drawShadow, drawRoundedCard, type Theme } from '../../src/presentation'
import type { CubeColor } from './LoopSortTypes'
import {
  CUBE_SKIN, CUBE_EMBLEM, MACHINE, OBSTACLE, type CubeEmblem,
} from './LoopSortTheme'

export interface Point { x: number; y: number }

type G = Phaser.GameObjects.Graphics

/** Corner radius as a fraction of a cube's edge. One number, used everywhere. */
const CUBE_RADIUS = 0.27

// ── Cubes ─────────────────────────────────────────────────────────────────────

/** The moulded emblem on a cube face. Low contrast — an impression, not a decal. */
export function drawEmblem(
  g: G, cx: number, cy: number, size: number,
  shape: CubeEmblem, color: number, alpha: number,
): void {
  const r = size * 0.19
  g.fillStyle(color, alpha)
  switch (shape) {
    case 'circle':
      g.fillCircle(cx, cy, r)
      break
    case 'square':
      g.fillRoundedRect(cx - r, cy - r, r * 2, r * 2, r * 0.36)
      break
    case 'triangle':
      g.fillTriangle(cx, cy - r * 1.1, cx + r, cy + r * 0.72, cx - r, cy + r * 0.72)
      break
    case 'diamond':
      g.fillPoints([
        new Phaser.Geom.Point(cx, cy - r * 1.15),
        new Phaser.Geom.Point(cx + r * 1.02, cy),
        new Phaser.Geom.Point(cx, cy + r * 1.15),
        new Phaser.Geom.Point(cx - r * 1.02, cy),
      ], true)
      break
  }
}

/**
 * A soft plastic toy block.
 *
 *   shadow → body → underside shade → top sheen → emblem → specular → rim
 *
 * That stack is the whole visual identity of the game, so it is one function:
 * nothing else in the prototype is allowed to draw a cube.
 */
export function drawToyCube(
  g: G, cx: number, cy: number, size: number, color: CubeColor, t: Theme,
  opts: { shadow?: boolean; emblem?: boolean } = {},
): void {
  const skin = CUBE_SKIN[color]
  const s = size
  const r = s * CUBE_RADIUS
  const x = cx - s / 2
  const y = cy - s / 2

  if (opts.shadow) drawShadow(g, cx, cy, s, s, { radius: r }, t)

  // Body
  g.fillStyle(skin.body, 1)
  g.fillRoundedRect(x, y, s, s, r)

  // Underside — where the block meets the belt.
  const shadeH = s * 0.3
  g.fillStyle(skin.shade, 1)
  g.fillRoundedRect(x, y + s - shadeH, s, shadeH, {
    tl: 0, tr: 0, bl: r, br: r,
  })

  // Top face sheen, inset so the rim stays readable.
  g.fillStyle(0xffffff, 0.24)
  g.fillRoundedRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.4, {
    tl: r * 0.8, tr: r * 0.8, bl: r * 0.45, br: r * 0.45,
  })

  if (opts.emblem !== false) {
    drawEmblem(g, cx, cy + s * 0.05, s, CUBE_EMBLEM[color], skin.emblem, 0.42)
  }

  // Specular: one small soft dot, top-left, where the light is. Kept tight —
  // a large one stops reading as a highlight and starts reading as a hole.
  g.fillStyle(0xffffff, 0.5)
  g.fillEllipse(cx - s * 0.24, cy - s * 0.26, s * 0.15, s * 0.1)

  // Rim last, so nothing above bleeds over the silhouette.
  g.lineStyle(Math.max(2, s * 0.045), skin.rim, 1)
  g.strokeRoundedRect(x, y, s, s, r)
}

/**
 * Frost shell over a frozen cube. `stage` 0..2 adds cracks rather than changing
 * the ice itself, so the player reads progress toward the break.
 */
export function drawIceShell(
  g: G, cx: number, cy: number, size: number, stage: 0 | 1 | 2,
): void {
  const s = size * 1.06
  const r = s * CUBE_RADIUS
  const x = cx - s / 2
  const y = cy - s / 2

  g.fillStyle(OBSTACLE.ice, 0.52)
  g.fillRoundedRect(x, y, s, s, r)
  g.fillStyle(0xffffff, 0.3)
  g.fillRoundedRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.3, r * 0.6)
  g.lineStyle(Math.max(3, s * 0.06), OBSTACLE.iceRim, 0.95)
  g.strokeRoundedRect(x, y, s, s, r)

  // Cracks accumulate; each stage keeps the previous ones.
  const crack = (pts: Array<[number, number]>): void => {
    g.lineStyle(Math.max(2, s * 0.035), 0xffffff, 0.9)
    g.beginPath()
    g.moveTo(cx + pts[0][0] * s, cy + pts[0][1] * s)
    for (let i = 1; i < pts.length; i++) g.lineTo(cx + pts[i][0] * s, cy + pts[i][1] * s)
    g.strokePath()
  }
  if (stage >= 1) crack([[-0.3, -0.34], [-0.08, -0.06], [-0.16, 0.16]])
  if (stage >= 2) {
    crack([[0.32, -0.28], [0.06, 0.0], [0.22, 0.3]])
    crack([[-0.08, -0.06], [0.24, 0.1]])
  }
}

// ── Belt ──────────────────────────────────────────────────────────────────────

/** Strokes a closed path, offset by (dx, dy). */
function strokePath(
  g: G, path: Point[], dx: number, dy: number,
  width: number, color: number, alpha: number,
): void {
  if (path.length < 2) return
  g.lineStyle(width, color, alpha)
  g.beginPath()
  g.moveTo(path[0].x + dx, path[0].y + dy)
  for (let i = 1; i < path.length; i++) g.lineTo(path[i].x + dx, path[i].y + dy)
  g.closePath()
  g.strokePath()
}

/** Walks a dense path at fixed arc-length intervals, yielding point + normal. */
export function walkPath(
  path: Point[], spacing: number,
  fn: (p: Point, nx: number, ny: number, dist: number) => void,
): void {
  let carry = 0
  let travelled = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 0.0001) continue
    const ux = dx / len
    const uy = dy / len
    let d = carry
    while (d < len) {
      fn({ x: a.x + ux * d, y: a.y + uy * d }, -uy, ux, travelled + d)
      d += spacing
    }
    carry = d - len
    travelled += len
  }
}

/**
 * The machine itself, in one pass:
 *
 *   ground shadow → outer platform → platform top-light → recessed channel
 *   → channel inner shade → tread marks
 *
 * Six strokes along a ~400 point path. Baked once; never drawn per frame.
 */
export function drawConveyor(
  g: G, path: Point[], dx: number, dy: number, cubeSize: number,
): void {
  const casing  = cubeSize + 46
  const channel = cubeSize + 18

  // Contact shadow on the paper.
  strokePath(g, path, dx, dy + 14, casing + 6, 0x6b5a42, 0.1)
  strokePath(g, path, dx, dy + 7, casing, 0x6b5a42, 0.09)

  // Moulded platform, lit from above.
  strokePath(g, path, dx, dy, casing, MACHINE.casingDark, 1)
  strokePath(g, path, dx, dy - 4, casing - 6, MACHINE.casing, 1)
  strokePath(g, path, dx, dy - 7, casing - 22, MACHINE.casingLight, 0.5)

  // Recessed channel. Darker at the top edge is what makes it read as a groove
  // rather than a painted stripe.
  strokePath(g, path, dx, dy, channel + 6, MACHINE.channelDark, 1)
  strokePath(g, path, dx, dy + 3, channel, MACHINE.channel, 1)

  // Tread marks across the lane.
  const half = channel / 2 - 4
  g.lineStyle(5, MACHINE.tread, 0.16)
  walkPath(path, 46, (p, nx, ny) => {
    g.lineBetween(
      p.x + dx - nx * half, p.y + dy - ny * half,
      p.x + dx + nx * half, p.y + dy + ny * half,
    )
  })
}

/** Empty socket: a moulded well in the belt, lit from below. */
export function drawSlotWell(
  g: G, cx: number, cy: number, size: number, blocked: boolean,
): void {
  const s = size
  const r = s * CUBE_RADIUS
  const x = cx - s / 2
  const y = cy - s / 2

  g.fillStyle(blocked ? MACHINE.channelDark : MACHINE.slot, blocked ? 1 : 0.85)
  g.fillRoundedRect(x, y, s, s, r)
  // Inverted lighting: dark top, lit bottom. The exact opposite of a cube, so
  // an empty slot can never be mistaken for a piece.
  g.fillStyle(0x000000, blocked ? 0.2 : 0.1)
  g.fillRoundedRect(x, y, s, s * 0.34, { tl: r, tr: r, bl: 0, br: 0 })
  g.fillStyle(0xffffff, blocked ? 0.04 : 0.12)
  g.fillRoundedRect(x, y + s - s * 0.2, s, s * 0.2, { tl: 0, tr: 0, bl: r, br: r })
  g.lineStyle(3, blocked ? MACHINE.channelDark : MACHINE.slotRim, blocked ? 0.5 : 0.55)
  g.strokeRoundedRect(x, y, s, s, r)
}

/** Chevron pointing along travel — the flow indicator on the belt. */
export function drawChevron(g: G, cx: number, cy: number, size: number, color: number, alpha: number): void {
  const w = size * 0.5
  const h = size * 0.3
  g.lineStyle(Math.max(3, size * 0.11), color, alpha)
  g.beginPath()
  g.moveTo(cx - w / 2, cy - h / 2)
  g.lineTo(cx + w / 2, cy)
  g.lineTo(cx - w / 2, cy + h / 2)
  g.strokePath()
}

// ── Batch cards ───────────────────────────────────────────────────────────────

export type CardState = 'idle' | 'pressed' | 'disabled'

/** A physical card sitting on the desk. Shadow is drawn in, not added after. */
export function drawBatchCard(
  g: G, cx: number, cy: number, w: number, h: number, t: Theme,
  state: CardState,
): void {
  const pressed = state === 'pressed'
  const alpha = state === 'disabled' ? 0.45 : 1

  drawShadow(g, cx, cy, w, h, {
    radius: t.radius.md,
    dy: pressed ? 5 : 12,
    spread: pressed ? 3 : 6,
    alpha: (pressed ? 0.1 : 0.15) * alpha,
  }, t)

  drawRoundedCard(g, cx, cy, w, h, {
    fill: t.colors.surface,
    fillAlpha: alpha,
    radius: t.radius.md,
    stroke: t.colors.border,
    strokeWidth: t.stroke.thin,
    strokeAlpha: alpha,
    highlight: 0.5,
    bevel: 0.05,
  }, t)
}

/** Recessed tray the batch cards sit in. */
export function drawTray(
  g: G, cx: number, cy: number, w: number, h: number, t: Theme,
): void {
  drawRoundedCard(g, cx, cy, w, h, {
    fill: 0xece2d2,
    radius: t.radius.lg,
    stroke: 0xdccfb8,
    strokeWidth: t.stroke.thin,
    highlight: 0,
    bevel: 0.05,
  }, t)
  g.fillStyle(0x6b5a42, 0.06)
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h * 0.16, {
    tl: t.radius.lg, tr: t.radius.lg, bl: 0, br: 0,
  })
}
