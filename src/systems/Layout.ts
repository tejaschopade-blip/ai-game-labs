import Phaser from 'phaser'

export interface SafeInsets { top: number; right: number; bottom: number; left: number }

export interface Point { x: number; y: number }

// Minimum inset as a fraction of the logical design space, applied when the
// device reports no safe area (desktop, most browsers). Keeps UI off the edge.
const MIN_INSET_V = 0.02
const MIN_INSET_H = 0.02

const ZERO: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Reads CSS env(safe-area-inset-*) via a hidden probe element.
 * Returns CSS pixels, or zeros when unsupported. Never throws.
 */
function readCssSafeInsets(): SafeInsets {
  try {
    if (typeof document === 'undefined' || !document.body) return ZERO

    const probe = document.createElement('div')
    probe.style.cssText = [
      'position:fixed',
      'visibility:hidden',
      'pointer-events:none',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'padding-top:env(safe-area-inset-top,0px)',
      'padding-right:env(safe-area-inset-right,0px)',
      'padding-bottom:env(safe-area-inset-bottom,0px)',
      'padding-left:env(safe-area-inset-left,0px)',
    ].join(';')

    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    const insets: SafeInsets = {
      top:    parseFloat(cs.paddingTop)    || 0,
      right:  parseFloat(cs.paddingRight)  || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left:   parseFloat(cs.paddingLeft)   || 0,
    }
    probe.remove()
    return insets
  } catch {
    return ZERO
  }
}

/**
 * Responsive anchors and safe-area insets in logical design units.
 *
 * All anchors return logical coordinates for the CURRENT game size, so a scene
 * that calls applyPrototypeConfig() first gets portrait coordinates and one
 * that does not gets landscape ones.
 */
export class Layout {
  private _insets: SafeInsets = ZERO
  private _w = -1
  private _h = -1
  private _dw = -1
  private _dh = -1

  constructor(private scene: Phaser.Scene) {
    this.refresh()
  }

  get width(): number  { return this.scene.scale.gameSize.width }
  get height(): number { return this.scene.scale.gameSize.height }

  get insets(): SafeInsets {
    const sc = this.scene.scale
    // Self-healing: recompute when either the logical or displayed size moved.
    if (
      sc.gameSize.width  !== this._w  || sc.gameSize.height    !== this._h ||
      sc.displaySize.width !== this._dw || sc.displaySize.height !== this._dh
    ) {
      this.refresh()
    }
    return this._insets
  }

  /** Recompute safe-area insets. Called automatically when the size changes. */
  refresh(): void {
    const sc = this.scene.scale
    const lw = sc.gameSize.width
    const lh = sc.gameSize.height
    const dw = sc.displaySize.width  || lw
    const dh = sc.displaySize.height || lh

    // logical units per CSS pixel
    const sx = lw / dw
    const sy = lh / dh

    const css = readCssSafeInsets()

    this._insets = {
      top:    Math.max(css.top    * sy, lh * MIN_INSET_V),
      bottom: Math.max(css.bottom * sy, lh * MIN_INSET_V),
      left:   Math.max(css.left   * sx, lw * MIN_INSET_H),
      right:  Math.max(css.right  * sx, lw * MIN_INSET_H),
    }

    this._w = lw
    this._h = lh
    this._dw = sc.displaySize.width
    this._dh = sc.displaySize.height
  }

  // ── Full-bounds anchors ───────────────────────────────────────────────────

  center(dx = 0, dy = 0): Point       { return { x: this.width / 2 + dx, y: this.height / 2 + dy } }

  topLeft(dx = 0, dy = 0): Point      { return { x: dx,                  y: dy } }
  topCenter(dx = 0, dy = 0): Point    { return { x: this.width / 2 + dx, y: dy } }
  topRight(dx = 0, dy = 0): Point     { return { x: this.width + dx,     y: dy } }

  left(dx = 0, dy = 0): Point         { return { x: dx,                  y: this.height / 2 + dy } }
  right(dx = 0, dy = 0): Point        { return { x: this.width + dx,     y: this.height / 2 + dy } }

  bottomLeft(dx = 0, dy = 0): Point   { return { x: dx,                  y: this.height + dy } }
  bottomCenter(dx = 0, dy = 0): Point { return { x: this.width / 2 + dx, y: this.height + dy } }
  bottomRight(dx = 0, dy = 0): Point  { return { x: this.width + dx,     y: this.height + dy } }

  // ── Safe-area-aware ───────────────────────────────────────────────────────

  safeTop(dy = 0): number    { return this.insets.top + dy }
  safeBottom(dy = 0): number { return this.height - this.insets.bottom + dy }
  safeLeft(dx = 0): number   { return this.insets.left + dx }
  safeRight(dx = 0): number  { return this.width - this.insets.right + dx }

  safeTopCenter(dy = 0): Point    { return { x: this.width / 2, y: this.safeTop(dy) } }
  safeBottomCenter(dy = 0): Point { return { x: this.width / 2, y: this.safeBottom(dy) } }

  get safeRect(): { x: number; y: number; width: number; height: number } {
    const i = this.insets
    return {
      x: i.left,
      y: i.top,
      width:  this.width  - i.left - i.right,
      height: this.height - i.top  - i.bottom,
    }
  }

  // ── Convenience ───────────────────────────────────────────────────────────

  place<T extends Phaser.GameObjects.GameObject>(go: T, p: Point): T {
    const positionable = go as unknown as { setPosition?: (x: number, y: number) => unknown }
    positionable.setPosition?.(p.x, p.y)
    return go
  }
}
