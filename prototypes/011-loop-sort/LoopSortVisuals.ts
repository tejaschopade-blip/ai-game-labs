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
import { CUBE_SKIN, CUBE_EMBLEM, MACHINE, type CubeEmblem } from './LoopSortTheme'

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
 *   → channel inner shade
 *
 * Five strokes along a ~400 point path. Baked once; never drawn per frame.
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

  // No tread marks are painted here on purpose: they are separate objects that
  // travel with the belt (see LoopSortScene.buildTreads). A moving machine
  // cannot have its motion cue baked into a static texture.
}

/**
 * Empty socket: a moulded well in the belt, lit from below.
 *
 * Wells are *belt* features, so the scene draws one per cell and moves them
 * with the rotation rather than baking them into the track. An empty cell you
 * can watch travelling around the loop is most of what tells a new player that
 * the machine is running.
 */
export function drawSlotWell(g: G, cx: number, cy: number, size: number): void {
  const s = size
  const r = s * CUBE_RADIUS
  const x = cx - s / 2
  const y = cy - s / 2

  g.fillStyle(MACHINE.slot, 0.85)
  g.fillRoundedRect(x, y, s, s, r)
  // Inverted lighting: dark top, lit bottom. The exact opposite of a cube, so
  // an empty slot can never be mistaken for a piece.
  g.fillStyle(0x000000, 0.1)
  g.fillRoundedRect(x, y, s, s * 0.34, { tl: r, tr: r, bl: 0, br: 0 })
  g.fillStyle(0xffffff, 0.12)
  g.fillRoundedRect(x, y + s - s * 0.2, s, s * 0.2, { tl: 0, tr: 0, bl: r, br: r })
  g.lineStyle(3, MACHINE.slotRim, 0.55)
  g.strokeRoundedRect(x, y, s, s, r)
}

/** One tread bar across the lane, drawn horizontally and rotated into place. */
export function drawTread(g: G, cx: number, cy: number, length: number): void {
  g.fillStyle(MACHINE.tread, 0.17)
  g.fillRoundedRect(cx - 3, cy - length / 2, 6, length, 3)
}

/**
 * The intake chute: a funnel bolted to the outside of the belt, mouth facing
 * the tray. Fixed in screen space — it is the one thing that does not move,
 * which is exactly why *when* you tap decides *where* a cube lands.
 */
export function drawChute(g: G, cx: number, cy: number, w: number, h: number): void {
  const topW = w
  const botW = w * 1.42

  g.fillStyle(0x6b5a42, 0.1)
  g.fillTriangle(cx - botW / 2, cy + h / 2 + 8, cx + botW / 2, cy + h / 2 + 8, cx, cy - h / 2 + 8)

  g.fillStyle(MACHINE.casingDark, 1)
  g.fillPoints([
    new Phaser.Geom.Point(cx - topW / 2, cy - h / 2),
    new Phaser.Geom.Point(cx + topW / 2, cy - h / 2),
    new Phaser.Geom.Point(cx + botW / 2, cy + h / 2),
    new Phaser.Geom.Point(cx - botW / 2, cy + h / 2),
  ], true)
  g.fillStyle(MACHINE.casing, 1)
  g.fillPoints([
    new Phaser.Geom.Point(cx - topW / 2 + 7, cy - h / 2),
    new Phaser.Geom.Point(cx + topW / 2 - 7, cy - h / 2),
    new Phaser.Geom.Point(cx + botW / 2 - 9, cy + h / 2 - 6),
    new Phaser.Geom.Point(cx - botW / 2 + 9, cy + h / 2 - 6),
  ], true)

  // Throat: the dark gap a cube actually comes out of.
  g.fillStyle(MACHINE.channelDark, 1)
  g.fillRoundedRect(cx - topW / 2 + 16, cy - h / 2 - 4, topW - 32, 18, 8)

  // Hazard stripes on the lip — the one loud marking on the machine.
  g.fillStyle(MACHINE.accent, 0.85)
  for (let i = -2; i <= 2; i++) {
    g.fillRoundedRect(cx + i * 26 - 7, cy + h / 2 - 20, 14, 13, 4)
  }
}

/**
 * The landing marker: a bright ring around the cell that is under the chute
 * right now. It snaps from cell to cell as the belt turns, which is the single
 * most important readout in the game — it is the answer to "where will this
 * batch go if I tap NOW".
 */
export function drawTargetRing(g: G, cx: number, cy: number, size: number, color: number): void {
  const s = size * 1.2
  const r = s * CUBE_RADIUS
  g.lineStyle(6, color, 0.95)
  g.strokeRoundedRect(cx - s / 2, cy - s / 2, s, s, r)
  // Corner ticks — reads as a targeting bracket rather than a selection box.
  const tick = s * 0.2
  g.lineStyle(9, color, 1)
  const corners: Array<[number, number, number, number]> = [
    [-1, -1, 1, 0], [-1, -1, 0, 1], [1, -1, -1, 0], [1, -1, 0, 1],
    [-1, 1, 1, 0], [-1, 1, 0, -1], [1, 1, -1, 0], [1, 1, 0, -1],
  ]
  for (const [sx, sy, dx, dy] of corners) {
    const x = cx + (sx * s) / 2
    const y = cy + (sy * s) / 2
    g.lineBetween(x, y, x + dx * tick, y + dy * tick)
  }
}

// ── Loop track ────────────────────────────────────────────────────────────────

export interface TrackSample { x: number; y: number; angle: number }

/**
 * A closed path that can be sampled at any fraction of its length.
 *
 * This is what makes the belt continuous rather than stepped: a cell's position
 * is `at(fraction)` of a real arc-length parameterisation, so a cube crossing a
 * corner keeps a constant speed instead of accelerating through the arc.
 */
export class LoopTrack {
  readonly path: Point[]
  private cum: number[] = [0]
  readonly length: number

  constructor(path: Point[]) {
    this.path = path
    for (let i = 1; i < path.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y))
    }
    this.length = this.cum[this.cum.length - 1]
  }

  /** `t` is a loop fraction; values outside [0,1) wrap. */
  at(t: number): TrackSample {
    const f = t - Math.floor(t)
    const d = f * this.length

    let lo = 1
    let hi = this.cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] < d) lo = mid + 1
      else hi = mid
    }
    const a = this.path[lo - 1]
    const b = this.path[lo]
    const seg = this.cum[lo] - this.cum[lo - 1]
    const k = seg > 0 ? (d - this.cum[lo - 1]) / seg : 0
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }
  }
}

/**
 * Dense rounded-rectangle path, starting at top-centre and running clockwise.
 * Sampled finely enough that LoopTrack's linear interpolation is invisible.
 */
export function buildLoopTrack(
  cx: number, cy: number, w: number, h: number, r: number,
): LoopTrack {
  const hw = w / 2
  const hh = h / 2
  const rad = Math.min(r, hw, hh)
  const path: Point[] = []

  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const steps = 16
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      path.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t })
    }
  }
  const arc = (ax: number, ay: number, a0: number, a1: number): void => {
    const steps = 20
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps)
      path.push({ x: ax + Math.cos(a) * rad, y: ay + Math.sin(a) * rad })
    }
  }

  const HALF_PI = Math.PI / 2
  line(cx, cy - hh, cx + hw - rad, cy - hh)
  arc(cx + hw - rad, cy - hh + rad, -HALF_PI, 0)
  line(cx + hw, cy - hh + rad, cx + hw, cy + hh - rad)
  arc(cx + hw - rad, cy + hh - rad, 0, HALF_PI)
  line(cx + hw - rad, cy + hh, cx - hw + rad, cy + hh)
  arc(cx - hw + rad, cy + hh - rad, HALF_PI, Math.PI)
  line(cx - hw, cy + hh - rad, cx - hw, cy - hh + rad)
  arc(cx - hw + rad, cy - hh + rad, Math.PI, Math.PI * 1.5)
  line(cx - hw + rad, cy - hh, cx, cy - hh)

  return new LoopTrack(path)
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
