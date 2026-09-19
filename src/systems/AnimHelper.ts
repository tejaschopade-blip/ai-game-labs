import Phaser from 'phaser'
import { DesignTokens as T } from '../core/DesignTokens'

export type SlideEdge = 'left' | 'right' | 'top' | 'bottom'

const SLIDE_VEC: Record<SlideEdge, { x: number; y: number }> = {
  left:   { x: -1, y:  0 },
  right:  { x:  1, y:  0 },
  top:    { x:  0, y: -1 },
  bottom: { x:  0, y:  1 },
}

export class AnimHelper {
  static fadeIn(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration = 300, delay = 0): void {
    (target as unknown as { alpha: number }).alpha = 0
    scene.tweens.add({ targets: target, alpha: 1, duration, delay, ease: 'Quad.Out' })
  }

  static fadeOut(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, duration = 300, onComplete?: () => void): void {
    scene.tweens.add({ targets: target, alpha: 0, duration, ease: 'Quad.In', onComplete })
  }

  static scalePunch(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, scale = 1.3, duration = 200): void {
    scene.tweens.add({
      targets: target,
      scaleX: scale,
      scaleY: scale,
      duration: duration * 0.4,
      yoyo: true,
      ease: 'Back.Out',
    })
  }

  static bounce(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, amount = 10, duration = 400): void {
    const go = target as unknown as { y: number }
    const startY = go.y
    scene.tweens.add({ targets: target, y: startY - amount, duration: duration / 2, yoyo: true, ease: 'Sine.InOut' })
  }

  static pulse(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, _min = 0.95, max = 1.05): void {
    scene.tweens.add({ targets: target, scaleX: max, scaleY: max, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
  }

  static shake(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, intensity = 5, duration = 300): void {
    const go = target as unknown as { x: number }
    const sx = go.x
    scene.tweens.add({
      targets: target,
      x: { from: sx - intensity, to: sx + intensity },
      duration: 60,
      yoyo: true,
      repeat: Math.floor(duration / 120),
      ease: 'Linear',
      onComplete: () => { go.x = sx },
    })
  }

  static moveTo(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, x: number, y: number, duration = 300, ease = 'Quad.Out'): Promise<void> {
    return new Promise(resolve => scene.tweens.add({ targets: target, x, y, duration, ease, onComplete: () => resolve() }))
  }

  // ── Foundation V3 ─────────────────────────────────────────────────────────
  // These kill in-flight tweens on the target first so repeated calls are safe
  // to interrupt. The helpers above are unchanged and do not do this, because
  // prototypes may already rely on their overlapping behaviour.

  static popIn(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject,
    duration: number = T.duration.normal,
    onComplete?: () => void,
  ): void {
    scene.tweens.killTweensOf(target)
    const go = target as unknown as { alpha: number; scaleX: number; scaleY: number }
    go.alpha = 0
    go.scaleX = 0.6
    go.scaleY = 0.6
    scene.tweens.add({
      targets: target,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration, ease: 'Back.Out', onComplete,
    })
  }

  static popOut(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject,
    duration: number = T.duration.fast,
    onComplete?: () => void,
  ): void {
    scene.tweens.killTweensOf(target)
    scene.tweens.add({
      targets: target,
      alpha: 0, scaleX: 0.6, scaleY: 0.6,
      duration, ease: 'Back.In', onComplete,
    })
  }

  /** Slides in from `from`, ending at the target's current position. */
  static slideIn(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject,
    from: SlideEdge = 'bottom',
    distance = 120,
    duration: number = T.duration.normal,
    onComplete?: () => void,
  ): void {
    scene.tweens.killTweensOf(target)
    const go = target as unknown as { x: number; y: number; alpha: number }
    const endX = go.x
    const endY = go.y
    const v = SLIDE_VEC[from]
    go.x = endX + v.x * distance
    go.y = endY + v.y * distance
    go.alpha = 0
    scene.tweens.add({
      targets: target,
      x: endX, y: endY, alpha: 1,
      duration, ease: 'Quad.Out', onComplete,
    })
  }

  static slideOut(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject,
    to: SlideEdge = 'bottom',
    distance = 120,
    duration: number = T.duration.fast,
    onComplete?: () => void,
  ): void {
    scene.tweens.killTweensOf(target)
    const go = target as unknown as { x: number; y: number }
    const v = SLIDE_VEC[to]
    scene.tweens.add({
      targets: target,
      x: go.x + v.x * distance,
      y: go.y + v.y * distance,
      alpha: 0,
      duration, ease: 'Quad.In', onComplete,
    })
  }

  /** Gentle looping vertical drift. Call killTweensOf(target) to stop. */
  static float(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject,
    amount = 8,
    duration = 2000,
  ): void {
    scene.tweens.killTweensOf(target)
    const go = target as unknown as { y: number }
    scene.tweens.add({
      targets: target,
      y: go.y - amount,
      duration: duration / 2,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
  }
}
