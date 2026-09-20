import Phaser from 'phaser'
import {
  LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT,
  PORTRAIT_WIDTH, PORTRAIT_HEIGHT,
} from './Constants'

export interface PrototypeConfig {
  name: string
  sceneKey: string
  orientation?: 'portrait' | 'landscape' | 'auto'
  designWidth?: number
  designHeight?: number
}

export const LANDSCAPE_DESIGN = { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT }
export const PORTRAIT_DESIGN  = { width: PORTRAIT_WIDTH,  height: PORTRAIT_HEIGHT  }

function resolveDesignSize(cfg: PrototypeConfig): { width: number; height: number } | null {
  if (cfg.designWidth && cfg.designHeight) {
    return { width: cfg.designWidth, height: cfg.designHeight }
  }
  if (cfg.orientation === 'portrait')  return PORTRAIT_DESIGN
  if (cfg.orientation === 'landscape') return LANDSCAPE_DESIGN
  return null  // 'auto' or unspecified — keep whatever is currently set
}

/**
 * Applies a prototype's design resolution. Call first thing in the scene's create().
 * Scenes that never call this keep whatever size is currently set, which is why
 * prototypes 001-010 are unaffected.
 */
export function applyPrototypeConfig(scene: Phaser.Scene, cfg: PrototypeConfig): void {
  const size = resolveDesignSize(cfg)
  if (!size) return

  const current = scene.scale.gameSize
  if (current.width === size.width && current.height === size.height) return

  scene.scale.setGameSize(size.width, size.height)
}

/** Resets to the landscape boot size. */
export function applyLandscapeDesign(scene: Phaser.Scene): void {
  applyPrototypeConfig(scene, {
    name: 'menu',
    sceneKey: scene.scene.key,
    orientation: 'landscape',
  })
}

/**
 * Design size for the menu, which — unlike a prototype — has no authored aspect
 * ratio. It is a list, so it adopts the viewport's own shape and always fills
 * the screen.
 *
 * This matters a lot. A fixed 960x540 menu FITs into a 420x880 phone as a
 * 420x236 strip: 64-unit cards land at 28 CSS px, the text is ~6px, and the
 * whole app reads as unusable even though the hit areas are technically live.
 *
 * Portrait uses a 1080 logical width with the height derived from the actual
 * aspect, so there is no letterbox at all. Landscape and desktop keep the
 * original 960x540 exactly.
 */
export function applyMenuDesign(scene: Phaser.Scene): void {
  let vw = 0
  let vh = 0
  try {
    vw = window.innerWidth
    vh = window.innerHeight
  } catch {
    // Non-browser or locked-down environment — fall through to landscape.
  }

  if (!vw || !vh || vw / vh >= 0.85) {
    applyLandscapeDesign(scene)
    return
  }

  applyPrototypeConfig(scene, {
    name: 'menu',
    sceneKey: scene.scene.key,
    designWidth: PORTRAIT_WIDTH,
    designHeight: Math.round(Phaser.Math.Clamp(PORTRAIT_WIDTH * vh / vw, 1400, 2600)),
  })
}
