import Phaser from 'phaser'

export class VFXManager {
  constructor(private scene: Phaser.Scene) {}

  screenShake(intensity = 8, duration = 200): void {
    this.scene.cameras.main.shake(duration, intensity / 1000)
  }

  flash(duration = 200): void {
    this.scene.cameras.main.flash(duration, 255, 255, 255, false)
  }

  floatingText(x: number, y: number, text: string, color = '#ffffff', fontSize = '20px'): void {
    const t = this.scene.add.text(x, y, text, { fontSize, color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2000)
    this.scene.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 1200,
      ease: 'Quad.Out',
      onComplete: () => t.destroy(),
    })
  }

  scalePunch(target: Phaser.GameObjects.GameObject, scale = 1.4, duration = 200): void {
    this.scene.tweens.add({
      targets: target,
      scaleX: scale,
      scaleY: scale,
      duration: duration * 0.4,
      yoyo: true,
      ease: 'Back.Out',
    })
  }

  fadeIn(target: Phaser.GameObjects.GameObject, duration = 300): void {
    (target as unknown as { alpha: number }).alpha = 0
    this.scene.tweens.add({ targets: target, alpha: 1, duration, ease: 'Quad.Out' })
  }

  fadeOut(target: Phaser.GameObjects.GameObject, duration = 300, onComplete?: () => void): void {
    this.scene.tweens.add({ targets: target, alpha: 0, duration, ease: 'Quad.In', onComplete })
  }

  burst(x: number, y: number, color = 0x00ff88, count = 12): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const speed = Phaser.Math.Between(60, 120)
      const size  = Phaser.Math.Between(3, 7)
      const p = this.scene.add.circle(x, y, size, color).setDepth(1500)
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: Phaser.Math.Between(400, 700),
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      })
    }
  }

  fadeTransition(duration = 400): void {
    this.scene.cameras.main.fadeIn(duration)
  }
}
