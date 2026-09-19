import Phaser from 'phaser'
import { DesignTokens as T } from '../core/DesignTokens'

export interface ShadowTarget {
  x: number
  y: number
  width?: number
  height?: number
}

export interface ShadowOptions {
  offsetX?: number
  offsetY?: number
  alpha?: number
  radius?: number
  color?: number
  depth?: number
}

/**
 * Returns a standalone shadow Graphics positioned under `target`.
 *
 * Deliberately does NOT reparent the target, create a Container, or touch the
 * display list around it — several prototypes redraw their Graphics wholesale
 * on resize, and a shadow system that owned structure would fight them.
 * The caller owns this object: reposition it with setPosition(), and destroy()
 * it yourself.
 *
 * The shape is drawn around local origin, so setPosition() moves it correctly.
 */
export function addShadow(
  scene: Phaser.Scene,
  target: ShadowTarget,
  opts: ShadowOptions = {},
): Phaser.GameObjects.Graphics {
  const offsetX = opts.offsetX ?? T.shadow.offsetX
  const offsetY = opts.offsetY ?? T.shadow.offsetY
  const alpha   = opts.alpha   ?? T.shadow.alpha
  const color   = opts.color   ?? T.shadow.color
  const w       = target.width  ?? 0
  const h       = target.height ?? 0

  const g = scene.add.graphics()
  g.fillStyle(color, alpha)

  if (w > 0 && h > 0) {
    const radius = Math.min(opts.radius ?? T.radius.md, Math.min(w, h) / 2)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
  } else {
    g.fillCircle(0, 0, opts.radius ?? T.radius.lg)
  }

  g.setPosition(target.x + offsetX, target.y + offsetY)
  if (opts.depth !== undefined) g.setDepth(opts.depth)
  return g
}
