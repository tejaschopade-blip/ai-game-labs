import Phaser from 'phaser'

export class DebugOverlay {
  private text: Phaser.GameObjects.Text
  private restartKey: Phaser.Input.Keyboard.Key

  constructor(private scene: Phaser.Scene, private prototypeName: string) {
    this.text = scene.add.text(8, 8, '', {
      color: '#00ff88',
      fontSize: '12px',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(1000)

    this.restartKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.restartKey.on('down', () => scene.scene.restart())
  }

  update(): void {
    const fps = Math.round(this.scene.game.loop.actualFps)
    this.text.setText([
      `FPS: ${fps}`,
      `Scene: ${this.scene.scene.key}`,
      `Prototype: ${this.prototypeName}`,
      `R = restart`,
    ])
  }
}
