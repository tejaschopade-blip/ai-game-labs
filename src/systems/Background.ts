import Phaser from 'phaser'
import { bakeGraphics } from '../presentation/Draw'

export type BackgroundPattern = 'none' | 'dots' | 'grid'

export interface BackgroundOptions {
  /** Base fill. Also the gradient's top colour when `gradientTo` is set. */
  color?: number
  /** Bottom colour of a subtle vertical gradient. Omit for a flat fill. */
  gradientTo?: number
  pattern?: BackgroundPattern
  patternColor?: number
  patternAlpha?: number
  patternSpacing?: number
  /** Ambient drifting motes. 0 disables. Kept cheap on purpose. */
  particles?: number
  particleColor?: number
  /** Defaults to -10 so gameplay drawn at the default depth stays on top. */
  depth?: number
}

export interface BackgroundHandle {
  objects: Phaser.GameObjects.GameObject[]
  destroy(): void
}

/**
 * Phaser-Graphics-only atmosphere: base colour, optional vertical gradient,
 * optional light pattern, optional slow ambient motes. No image assets.
 *
 * Particle placement is index-derived rather than random, so repeated calls
 * produce the same layout and nothing churns between restarts.
 */
export function createBackground(
  scene: Phaser.Scene,
  opts: BackgroundOptions = {},
): BackgroundHandle {
  const W = scene.scale.width
  const H = scene.scale.height
  const depth = opts.depth ?? -10
  const color = opts.color ?? 0x111122
  const objects: Phaser.GameObjects.GameObject[] = []

  // Base / gradient
  const base = scene.add.graphics().setDepth(depth)
  if (opts.gradientTo !== undefined) {
    base.fillGradientStyle(color, color, opts.gradientTo, opts.gradientTo, 1, 1, 1, 1)
  } else {
    base.fillStyle(color, 1)
  }
  base.fillRect(0, 0, W, H)
  objects.push(base)

  // Pattern. Baked into a texture rather than left as a live Graphics: a dot
  // field is hundreds of fillCircle commands, and Phaser re-walks and
  // re-tessellates a Graphics command list on every frame.
  const pattern = opts.pattern ?? 'none'
  if (pattern !== 'none') {
    const spacing = opts.patternSpacing ?? 64
    const pColor  = opts.patternColor ?? 0xffffff
    const pAlpha  = opts.patternAlpha ?? 0.04

    const img = bakeGraphics(scene, W, H, g => {
      if (pattern === 'dots') {
        g.fillStyle(pColor, pAlpha)
        for (let x = spacing / 2; x < W; x += spacing) {
          for (let y = spacing / 2; y < H; y += spacing) g.fillCircle(x, y, 2)
        }
      } else {
        g.lineStyle(1, pColor, pAlpha)
        for (let x = spacing; x < W; x += spacing) g.lineBetween(x, 0, x, H)
        for (let y = spacing; y < H; y += spacing) g.lineBetween(0, y, W, y)
      }
    })
    img.setPosition(W / 2, H / 2).setDepth(depth + 1)
    objects.push(img)
  }

  // Ambient motes
  const count = opts.particles ?? 0
  const mColor = opts.particleColor ?? 0xffffff
  for (let i = 0; i < count; i++) {
    const x = ((i * 137) % 100) / 100 * W
    const y = ((i * 89)  % 100) / 100 * H
    const r = 2 + (i % 3)
    const mote = scene.add.circle(x, y, r, mColor, 0.14).setDepth(depth + 2)
    scene.tweens.add({
      targets: mote,
      y: y - H * 0.25,
      duration: 9000 + (i % 7) * 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
    objects.push(mote)
  }

  return {
    objects,
    destroy(): void {
      for (const o of objects) {
        scene.tweens.killTweensOf(o)
        o.destroy()
      }
      objects.length = 0
    },
  }
}
