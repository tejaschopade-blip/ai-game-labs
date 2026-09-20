// Arrows — how things are drawn.
//
// Pure drawing functions over a Phaser Graphics. They never touch a scene, a
// tween or game state, which is what lets the scene bake all of them into
// textures (see bakeTexture / bakeGraphics in src/presentation/Draw.ts).
//
// Prototype-scoped: a slate tray of moulded arrow tiles is not a foundation
// concern. The generic primitives underneath — layered shadows, rounded cards,
// sheens — come from src/presentation/Draw.ts and are reused here rather than
// re-derived.

import Phaser from 'phaser'
import { drawShadow, type Theme } from '../../src/presentation'
import type { Dir } from './ArrowsTypes'
import { ARROW_SKIN, TRAY } from './ArrowsTheme'

type G = Phaser.GameObjects.Graphics

/** Corner radius as a fraction of a tile's edge. One number, used everywhere. */
const TILE_RADIUS = 0.26

/** Screen rotation for each direction. Row 0 is the top, so 'up' is -90°. */
export const DIR_ANGLE: Record<Dir, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
}

// ── Board geometry ────────────────────────────────────────────────────────────

/**
 * Where the board is on screen. Computed once per level by the scene and passed
 * to everything that needs to turn a (col, row) into a point — so there is
 * exactly one place that knows the mapping.
 */
export interface BoardGeometry {
  cols: number
  rows: number
  /** Edge length of one cell, including its share of the gap. */
  cell: number
  /** Centre of cell (0, 0). */
  originX: number
  originY: number
}

export function cellCenter(geo: BoardGeometry, col: number, row: number): { x: number; y: number } {
  return { x: geo.originX + col * geo.cell, y: geo.originY + row * geo.cell }
}

/** Field bounds: the recessed playfield, excluding the tray's outer frame. */
export function fieldRect(geo: BoardGeometry): Phaser.Geom.Rectangle {
  const w = geo.cols * geo.cell
  const h = geo.rows * geo.cell
  return new Phaser.Geom.Rectangle(
    geo.originX - geo.cell / 2, geo.originY - geo.cell / 2, w, h,
  )
}

/**
 * The point on the tray rim an arrow crosses on its way out — where the exit
 * flash belongs. Taken from the cell, not from the arrow, so it is still
 * correct once the arrow has been destroyed.
 */
export function gatePoint(geo: BoardGeometry, col: number, row: number, dir: Dir): { x: number; y: number } {
  const f = fieldRect(geo)
  const c = cellCenter(geo, col, row)
  switch (dir) {
    case 'right': return { x: f.right, y: c.y }
    case 'left':  return { x: f.left,  y: c.y }
    case 'down':  return { x: c.x, y: f.bottom }
    case 'up':    return { x: c.x, y: f.top }
  }
}

// ── Arrow tiles ───────────────────────────────────────────────────────────────

/** Rotates a unit-space point (right-facing) into `dir`, scaled by `s`. */
function rot(px: number, py: number, dir: Dir, s: number): Phaser.Geom.Point {
  const a = DIR_ANGLE[dir]
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return new Phaser.Geom.Point((px * cos - py * sin) * s, (px * sin + py * cos) * s)
}

/**
 * The arrow glyph, in unit space, pointing right. A stem plus a head — a plain
 * chevron reads as a "next" caret, and this game is about a thing that leaves,
 * not about a direction to look in.
 */
const GLYPH: Array<[number, number]> = [
  [ 0.70,  0.00],
  [ 0.10, -0.58],
  [ 0.10, -0.23],
  [-0.64, -0.23],
  [-0.64,  0.23],
  [ 0.10,  0.23],
  [ 0.10,  0.58],
]

/** The moulded glyph on a tile face. Drawn twice: a dark press, then the face. */
export function drawArrowGlyph(
  g: G, cx: number, cy: number, size: number, dir: Dir, color: number, alpha: number,
): void {
  const s = size * 0.5
  const pts = (dx: number, dy: number): Phaser.Geom.Point[] =>
    GLYPH.map(([px, py]) => {
      const p = rot(px, py, dir, s)
      return new Phaser.Geom.Point(cx + p.x + dx, cy + p.y + dy)
    })

  // Impression: the glyph is stamped *into* the plastic, so its top edge is in
  // shadow and its bottom edge catches the light.
  g.fillStyle(0x000000, alpha * 0.18)
  g.fillPoints(pts(0, -size * 0.022), true)
  g.fillStyle(color, alpha)
  g.fillPoints(pts(0, 0), true)
}

/**
 * A chunky moulded arrow tile.
 *
 *   shadow → body → underside shade → top sheen → glyph → specular → rim
 *
 * That stack is the whole visual identity of the game, so it is one function:
 * nothing else in the prototype is allowed to draw an arrow.
 */
export function drawArrowTile(
  g: G, cx: number, cy: number, size: number, dir: Dir, t: Theme,
  opts: { shadow?: boolean } = {},
): void {
  const skin = ARROW_SKIN[dir]
  const s = size
  const r = s * TILE_RADIUS
  const x = cx - s / 2
  const y = cy - s / 2

  if (opts.shadow) drawShadow(g, cx, cy + s * 0.03, s * 0.94, s * 0.94, { radius: r }, t)

  g.fillStyle(skin.body, 1)
  g.fillRoundedRect(x, y, s, s, r)

  // Underside — where the tile meets the well.
  const shadeH = s * 0.28
  g.fillStyle(skin.shade, 1)
  g.fillRoundedRect(x, y + s - shadeH, s, shadeH, { tl: 0, tr: 0, bl: r, br: r })

  // Top face sheen, inset so the rim stays readable.
  g.fillStyle(0xffffff, 0.22)
  g.fillRoundedRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.38, {
    tl: r * 0.8, tr: r * 0.8, bl: r * 0.45, br: r * 0.45,
  })

  drawArrowGlyph(g, cx, cy, s * 0.82, dir, skin.glyph, 0.95)

  // Specular: one small soft dot, top-left, where the light is. Kept tight — a
  // large one stops reading as a highlight and starts reading as a hole.
  g.fillStyle(0xffffff, 0.45)
  g.fillEllipse(cx - s * 0.25, cy - s * 0.27, s * 0.14, s * 0.09)

  // Rim last, so nothing above bleeds over the silhouette.
  g.lineStyle(Math.max(2, s * 0.04), skin.rim, 1)
  g.strokeRoundedRect(x, y, s, s, r)
}

// ── Tray ──────────────────────────────────────────────────────────────────────

/**
 * An empty cell: a moulded well in the field, lit from below.
 *
 * Inverted lighting — dark top, lit bottom — is the exact opposite of a tile,
 * so an empty cell can never be mistaken for a piece even at a glance.
 */
export function drawCellWell(g: G, cx: number, cy: number, size: number): void {
  const s = size
  const r = s * TILE_RADIUS
  const x = cx - s / 2
  const y = cy - s / 2

  // Low contrast against the field on purpose. An empty cell that is as loud as
  // a tile makes a nearly-cleared board look nearly full, which is the opposite
  // of the only progress signal this game has.
  g.fillStyle(TRAY.wellDark, 0.55)
  g.fillRoundedRect(x, y, s, s, r)
  g.fillStyle(0x000000, 0.1)
  g.fillRoundedRect(x, y, s, s * 0.26, { tl: r, tr: r, bl: 0, br: 0 })
  g.fillStyle(0xffffff, 0.07)
  g.fillRoundedRect(x, y + s - s * 0.16, s, s * 0.16, { tl: 0, tr: 0, bl: r, br: r })
}

/**
 * The tray: an outer moulded frame around a recessed field, with a lipped exit
 * notch cut into the rim opposite every row and every column.
 *
 * Those notches do a lot of work for one baked texture. Before a player has
 * tapped anything they say: things leave this board, and they leave along the
 * lines. That is the whole rule, stated in the furniture.
 */
export function drawTray(
  g: G, cx: number, cy: number, geo: BoardGeometry, t: Theme,
): void {
  const fw = geo.cols * geo.cell
  const fh = geo.rows * geo.cell
  const lip = geo.cell * 0.34
  const w = fw + lip * 2
  const h = fh + lip * 2
  const R = t.radius.lg

  drawShadow(g, cx, cy, w, h, { radius: R, dy: 16, spread: 9, alpha: 0.16, layers: 3 }, t)

  // Outer frame, lit from above.
  g.fillStyle(TRAY.frameDark, 1)
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, R)
  g.fillStyle(TRAY.frame, 1)
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h - 5, R)
  g.fillStyle(TRAY.frameLight, 0.45)
  g.fillRoundedRect(cx - w / 2 + 6, cy - h / 2 + 5, w - 12, h * 0.16, {
    tl: R, tr: R, bl: 0, br: 0,
  })

  // Exit notches, before the field so the field's rim covers their inner end.
  //
  // A channel per lane, running from the field's edge out through the rim. It
  // has to *touch* the lane to read as an exit: a capsule floating in the
  // middle of the frame reads as a rivet, which is what the first pass did.
  //
  const inset = 6
  const depth = lip - inset
  const across = geo.cell * 0.22
  const slot = (sx: number, sy: number, sw: number, sh: number): void => {
    const r = Math.min(sw, sh) * 0.45
    // Flat and quiet. Every extra highlight here turned it back into a bead:
    // this is furniture, and it is repeated up to 28 times around one board.
    g.fillStyle(TRAY.frameDark, 0.5)
    g.fillRoundedRect(sx, sy, sw, sh, r)
  }
  for (let c = 0; c < geo.cols; c++) {
    const x = cx - fw / 2 + (c + 0.5) * geo.cell
    slot(x - across / 2, cy - fh / 2 - depth, across, depth)
    slot(x - across / 2, cy + fh / 2, across, depth)
  }
  for (let r = 0; r < geo.rows; r++) {
    const y = cy - fh / 2 + (r + 0.5) * geo.cell
    slot(cx - fw / 2 - depth, y - across / 2, depth, across)
    slot(cx + fw / 2, y - across / 2, depth, across)
  }

  // Recessed field. Darker at the top edge is what makes it read as a well
  // rather than a painted panel.
  const fr = t.radius.md
  g.fillStyle(TRAY.fieldDark, 1)
  g.fillRoundedRect(cx - fw / 2, cy - fh / 2, fw, fh, fr)
  g.fillStyle(TRAY.field, 1)
  g.fillRoundedRect(cx - fw / 2, cy - fh / 2 + 4, fw, fh - 4, fr)
  g.fillStyle(0x000000, 0.1)
  g.fillRoundedRect(cx - fw / 2, cy - fh / 2, fw, Math.min(14, fh * 0.05), {
    tl: fr, tr: fr, bl: 0, br: 0,
  })

  // Hairline grid. Faint on purpose — it aligns the eye along rows and columns,
  // which is the axis the whole mechanic runs on, without drawing a table.
  g.lineStyle(1.5, TRAY.grid, 0.45)
  for (let c = 1; c < geo.cols; c++) {
    const x = cx - fw / 2 + c * geo.cell
    g.lineBetween(x, cy - fh / 2 + 8, x, cy + fh / 2 - 8)
  }
  for (let r = 1; r < geo.rows; r++) {
    const y = cy - fh / 2 + r * geo.cell
    g.lineBetween(cx - fw / 2 + 8, y, cx + fw / 2 - 8, y)
  }
}

// ── Transient overlays ────────────────────────────────────────────────────────

/**
 * The runway preview: what lies between this arrow and the edge it points at.
 *
 * Shown while a tile is *held*, never before. Legality is the puzzle, so the
 * board must not advertise which arrows are free — but once the player has
 * committed to a tile, showing them why it did or did not leave is how the rule
 * gets taught without a line of text.
 */
export function drawRunway(
  g: G, geo: BoardGeometry,
  cells: Array<{ col: number; row: number }>,
  dir: Dir, color: number,
  blockedAt: number,
): void {
  const s = geo.cell
  cells.forEach((c, i) => {
    const p = cellCenter(geo, c.col, c.row)
    const blocked = blockedAt >= 0 && i >= blockedAt
    if (blocked) return
    // Fade along the run so the eye travels outward rather than pooling.
    const a = 0.5 * (1 - i / (cells.length + 1))
    g.fillStyle(color, a)
    g.fillRoundedRect(p.x - s * 0.3, p.y - s * 0.3, s * 0.6, s * 0.6, s * 0.18)
    drawArrowGlyph(g, p.x, p.y, s * 0.42, dir, color, a + 0.2)
  })
}

/** The "this one is in your way" marker. Danger-coloured, corner ticks, no fill. */
export function drawBlockerRing(
  g: G, cx: number, cy: number, size: number, color: number,
): void {
  const s = size * 1.14
  const r = s * TILE_RADIUS
  g.lineStyle(Math.max(4, s * 0.055), color, 0.95)
  g.strokeRoundedRect(cx - s / 2, cy - s / 2, s, s, r)
  const tick = s * 0.19
  g.lineStyle(Math.max(6, s * 0.08), color, 1)
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

/** The lit gate an arrow is leaving through. A bar across the rim notch. */
export function drawGateFlash(
  g: G, cx: number, cy: number, dir: Dir, cell: number, color: number,
): void {
  const long = cell * 0.44
  const thick = cell * 0.16
  const horizontal = dir === 'up' || dir === 'down'
  const w = horizontal ? long : thick
  const h = horizontal ? thick : long
  g.fillStyle(color, 1)
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2)
}
