import Phaser from 'phaser'

export class DebugOverlay {
  private text: Phaser.GameObjects.Text
  private restartKey: Phaser.Input.Keyboard.Key
  private toggleKey: Phaser.Input.Keyboard.Key
  private watches = new Map<string, () => string>()
  private visible = true

  constructor(private scene: Phaser.Scene, private prototypeName: string) {
    this.text = scene.add.text(8, 8, '', {
      color: '#00ff88',
      fontSize: '11px',
      backgroundColor: '#000000cc',
      padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(10000)

    const kb = scene.input.keyboard!
    this.restartKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.restartKey.on('down', () => scene.scene.restart())

    // D toggles overlay visibility (clean playtesting)
    this.toggleKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    this.toggleKey.on('down', () => {
      this.visible = !this.visible
      this.text.setVisible(this.visible)
    })
  }

  // Register a watch: called every frame, value displayed in overlay
  addWatch(label: string, fn: () => string): void {
    this.watches.set(label, fn)
  }

  removeWatch(label: string): void {
    this.watches.delete(label)
  }

  update(): void {
    if (!this.visible) return

    const fps    = Math.round(this.scene.game.loop.actualFps)
    const sc     = this.scene.scale
    const dpr    = window.devicePixelRatio ?? 1
    const orient = sc.orientation === Phaser.Scale.Orientation.LANDSCAPE ? 'landscape' : 'portrait'

    const lines = [
      `FPS: ${fps}`,
      `Scene: ${this.scene.scene.key}`,
      `Prototype: ${this.prototypeName}`,
      `Design: ${sc.gameSize.width}×${sc.gameSize.height}`,
      `Canvas: ${this.scene.game.canvas.width}×${this.scene.game.canvas.height}`,
      `Viewport: ${sc.displaySize.width | 0}×${sc.displaySize.height | 0}`,
      `DPR: ${dpr.toFixed(1)}  Orient: ${orient}`,
    ]

    if (this.watches.size > 0) {
      lines.push('─────────────')
      for (const [label, fn] of this.watches) {
        lines.push(`${label}: ${fn()}`)
      }
    }

    lines.push('─────────────')
    lines.push('R=restart  D=toggle')

    this.text.setText(lines)
  }
}
