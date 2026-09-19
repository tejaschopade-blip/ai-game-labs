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

/** Resets to the landscape boot size. Used by GameSelectScene. */
export function applyLandscapeDesign(scene: Phaser.Scene): void {
  applyPrototypeConfig(scene, {
    name: 'menu',
    sceneKey: scene.scene.key,
    orientation: 'landscape',
  })
}
