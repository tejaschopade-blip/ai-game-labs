import Phaser from 'phaser'
import { createBackground } from '../systems/Background'
import type { BackgroundHandle } from '../systems/Background'
import { Theme, ThemeName, BackgroundPreset, resolveTheme, mix, shade } from './Theme'
import { bakeGraphics } from './Draw'

/**
 * Themed backgrounds, layered under gameplay at depth -10.
 *
 * `createBackground()` already covers base colour, vertical gradient, dot/grid
 * patterns and ambient motes; this adds the themed presets on top of it plus
 * three extras it does not do — a vignette, sine waves and paper speckle.
 *
 * A vignette is the cheapest depth trick available: four edge gradients pulling
 * the frame darker so the centre of the board reads as lit. `fillGradientStyle`
 * only honours its four corner tints on `fillRect`, which is exactly what this
 * uses — do not switch these to rounded rects.
 */

export interface BackgroundOptions {
  preset?: BackgroundPreset
  /** Overrides the theme's base colour. */
  color?: number
  /** Overrides the gradient's second colour. */
  colorAlt?: number
  /** Edge darkening, 0..1. Defaults on for every preset except `solid`. */
  vignette?: number
  /** Ambient drifting motes. Defaults to 0 — they compete with gameplay. */
  particles?: number
  patternAlpha?: number
  patternSpacing?: number
  depth?: number
}

export type { BackgroundHandle }

export function applyBackground(
  scene: Phaser.Scene,
  opts: BackgroundOptions = {},
  theme?: ThemeName | Theme,
): BackgroundHandle {
  const t: Theme = resolveTheme(theme)
  const preset = opts.preset ?? t.background
  const depth  = opts.depth ?? -10
  const W = scene.scale.gameSize.width
  const H = scene.scale.gameSize.height

  const base = opts.color ?? t.colors.background
  const alt  = opts.colorAlt ?? t.colors.backgroundAlt
  const light = isLight(base)

  // Pattern ink: darker on light themes, lighter on dark ones. A white grid on
  // a cream background is invisible; this is why the preset is theme-aware.
  const ink = light ? shade(base, -0.55) : 0xffffff

  const spec: Parameters<typeof createBackground>[1] = {
    color: base,
    depth,
    particles: opts.particles ?? 0,
    particleColor: light ? shade(base, -0.3) : t.colors.highlight,
    patternColor: ink,
    patternSpacing: opts.patternSpacing ?? 72,
  }

  switch (preset) {
    case 'solid':
      break
    case 'gradient':
      spec.gradientTo = alt
      break
    case 'softGradient':
      spec.gradientTo = mix(base, alt, 0.55)
      break
    case 'dots':
      spec.gradientTo = mix(base, alt, 0.7)
      spec.pattern = 'dots'
      spec.patternAlpha = opts.patternAlpha ?? (light ? 0.07 : 0.05)
      break
    case 'grid':
      spec.gradientTo = mix(base, alt, 0.7)
      spec.pattern = 'grid'
      spec.patternAlpha = opts.patternAlpha ?? (light ? 0.08 : 0.06)
      break
    case 'paper':
      spec.gradientTo = mix(base, alt, 0.4)
      spec.pattern = 'dots'
      spec.patternAlpha = opts.patternAlpha ?? 0.05
      spec.patternSpacing = opts.patternSpacing ?? 26
      break
    case 'waves':
      spec.gradientTo = mix(base, alt, 0.75)
      break
    case 'ambient':
      spec.gradientTo = mix(base, alt, 0.6)
      spec.particles = opts.particles ?? 14
      break
  }

  const handle = createBackground(scene, spec)
  const extra: Phaser.GameObjects.GameObject[] = []

  if (preset === 'waves') {
    extra.push(drawWaves(scene, W, H, ink, depth + 1))
  }

  const vig = opts.vignette ?? (preset === 'solid' ? 0 : 0.3)
  if (vig > 0) extra.push(drawVignette(scene, W, H, vig, light ? shade(base, -0.4) : 0x000000, depth + 3))

  return {
    objects: [...handle.objects, ...extra],
    destroy(): void {
      handle.destroy()
      for (const o of extra) {
        scene.tweens.killTweensOf(o)
        o.destroy()
      }
      extra.length = 0
    },
  }
}

function isLight(color: number): boolean {
  const c = Phaser.Display.Color.IntegerToColor(color)
  return (c.red * 0.299 + c.green * 0.587 + c.blue * 0.114) > 140
}

/** Four edge gradients. Cheaper and more portable than a radial mask. */
function drawVignette(
  scene: Phaser.Scene,
  W: number, H: number,
  strength: number, color: number, depth: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth)
  const bandV = H * 0.32
  const bandH = W * 0.28

  g.fillGradientStyle(color, color, color, color, strength, strength, 0, 0)
  g.fillRect(0, 0, W, bandV)
  g.fillGradientStyle(color, color, color, color, 0, 0, strength, strength)
  g.fillRect(0, H - bandV, W, bandV)
  g.fillGradientStyle(color, color, color, color, strength, 0, strength, 0)
  g.fillRect(0, 0, bandH, H)
  g.fillGradientStyle(color, color, color, color, 0, strength, 0, strength)
  g.fillRect(W - bandH, 0, bandH, H)

  return g
}

/** Three stacked sine bands. Drawn once, never animated — this is scenery. */
function drawWaves(
  scene: Phaser.Scene,
  W: number, H: number,
  ink: number, depth: number,
): Phaser.GameObjects.Image {
  const step = Math.max(12, W / 60)
  return bakeGraphics(scene, W, H, g => {
  for (let band = 0; band < 3; band++) {
    const baseY = H * (0.58 + band * 0.14)
    const amp   = H * 0.035 * (1 + band * 0.3)
    const freq  = (Math.PI * 2) / (W / (1.4 + band * 0.4))
    g.fillStyle(ink, 0.035 + band * 0.012)
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x <= W; x += step) {
      g.lineTo(x, baseY + Math.sin(x * freq + band * 1.7) * amp)
    }
    g.lineTo(W, H)
    g.closePath()
    g.fillPath()
  }
  }).setPosition(W / 2, H / 2).setDepth(depth)
}
