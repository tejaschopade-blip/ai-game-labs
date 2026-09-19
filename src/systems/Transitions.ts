import Phaser from 'phaser'
import { DesignTokens as T } from '../core/DesignTokens'

/**
 * Scene-level transitions. Short and responsive — no cinematic sequencing.
 *
 * Object-level slide/pop lives in AnimHelper (slideIn/slideOut/popIn/popOut);
 * it is not duplicated here. Camera-scroll-based slides are deliberately
 * omitted: GameSelectScene drives cameras.main.scrollY for its own list
 * scrolling, and a transition that also owned camera scroll would fight it.
 */

export function fadeIn(
  scene: Phaser.Scene,
  duration: number = T.duration.normal,
  onComplete?: () => void,
): void {
  scene.cameras.main.fadeIn(duration, 0, 0, 0)
  if (onComplete) scene.cameras.main.once('camerafadeincomplete', onComplete)
}

export function fadeOut(
  scene: Phaser.Scene,
  duration: number = T.duration.normal,
  onComplete?: () => void,
): void {
  scene.cameras.main.fadeOut(duration, 0, 0, 0)
  if (onComplete) scene.cameras.main.once('camerafadeoutcomplete', onComplete)
}

/** Fade out, then start `sceneKey`. The common prototype-to-menu move. */
export function transitionTo(
  scene: Phaser.Scene,
  sceneKey: string,
  duration: number = T.duration.normal,
): void {
  fadeOut(scene, duration, () => scene.scene.start(sceneKey))
}
