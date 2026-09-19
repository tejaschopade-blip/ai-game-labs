import Phaser from 'phaser'

export class DebugOverlay {
  private text: Phaser.GameObjects.Text
  private restartKey: Phaser.Input.Keyboard.Key

  constructor(private scene: Phaser.Scene, private prototypeName: string) {
    this.text = scene.add.text(8, 8, '', {
      color: '#00ff88',
      fontSize: '11px',
      backgroundColor: '#000000cc',
      padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(10000)

    this.restartKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.restartKey.on('down', () => scene.scene.restart())
  }

  update(): void {
    const fps    = Math.round(this.scene.game.loop.actualFps)
    const sc     = this.scene.scale
    const dpr    = window.devicePixelRatio ?? 1
    const orient = sc.orientation === Phaser.Scale.Orientation.LANDSCAPE ? 'landscape' : 'portrait'
    this.text.setText([
      `FPS: ${fps}`,
      `Scene: ${this.scene.scene.key}`,
      `Prototype: ${this.prototypeName}`,
      `Design: ${sc.gameSize.width}×${sc.gameSize.height}`,
      `Canvas: ${this.scene.game.canvas.width}×${this.scene.game.canvas.height}`,
      `Viewport: ${sc.displaySize.width | 0}×${sc.displaySize.height | 0}`,
      `DPR: ${dpr.toFixed(1)}  Orient: ${orient}`,
      `R = restart`,
    ])
  }
}
