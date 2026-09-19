import Phaser from 'phaser'

export class CameraManager {
  private cam: Phaser.Cameras.Scene2D.Camera

  constructor(private scene: Phaser.Scene) {
    this.cam = scene.cameras.main
  }

  follow(target: Phaser.GameObjects.GameObject, lerp = 0.1): void {
    this.cam.startFollow(target, true, lerp, lerp)
  }

  stopFollow(): void { this.cam.stopFollow() }

  setBounds(x: number, y: number, width: number, height: number): void {
    this.cam.setBounds(x, y, width, height)
  }

  shake(intensity = 8, duration = 200): void {
    this.cam.shake(duration, intensity / 1000)
  }

  zoom(value: number, duration = 300): void {
    this.scene.tweens.add({ targets: this.cam, zoom: value, duration, ease: 'Quad.Out' })
  }

  resetZoom(duration = 300): void { this.zoom(1, duration) }

  fadeIn(duration = 300): void { this.cam.fadeIn(duration) }

  fadeOut(duration = 300, callback?: () => void): void {
    this.cam.fadeOut(duration)
    if (callback) this.cam.once('camerafadeoutcomplete', callback)
  }
}
