import Phaser from 'phaser'

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
}
