import Phaser from 'phaser'
import { DesignTokens } from '../core/DesignTokens'

const T = DesignTokens

export class UIFactory {
  constructor(private scene: Phaser.Scene) {}

  label(x: number, y: number, text: string, style?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, text, {
      color: T.color.text,
      fontSize: T.typography.body.fontSize,
      ...style,
    }).setOrigin(0.5)
  }

  button(
    x: number, y: number,
    label: string,
    onClick: () => void,
    style?: { width?: number; height?: number; color?: number },
  ): Phaser.GameObjects.Container {
    const w = style?.width ?? 200
    const h = style?.height ?? T.ui.buttonHeight
    const bg = this.scene.add.rectangle(0, 0, w, h, style?.color ?? 0x4488ff).setInteractive()
    const txt = this.scene.add.text(0, 0, label, { color: T.color.text, fontSize: T.typography.body.fontSize }).setOrigin(0.5)
    bg.on('pointerover', () => bg.setAlpha(0.8))
    bg.on('pointerout',  () => bg.setAlpha(1))
    bg.on('pointerdown', onClick)
    return this.scene.add.container(x, y, [bg, txt])
  }

  panel(x: number, y: number, width: number, height: number): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(x, y, width, height, 0x1a1a2e).setStrokeStyle(1, 0x333355)
  }

  progressBar(x: number, y: number, width: number, height = 12): {
    container: Phaser.GameObjects.Container
    setValue: (v: number) => void
  } {
    const bg   = this.scene.add.rectangle(0, 0, width, height, 0x333333)
    const fill = this.scene.add.rectangle(-width / 2, 0, 0, height - 2, 0x4488ff).setOrigin(0, 0.5)
    const container = this.scene.add.container(x, y, [bg, fill])
    return { container, setValue: (v: number) => { fill.width = Phaser.Math.Clamp(v, 0, 1) * width } }
  }

  toast(text: string, duration = T.ui.toastDuration): void {
    const cx = this.scene.scale.width / 2
    const cy = this.scene.scale.height - 80
    const t = this.scene.add.text(cx, cy, text, {
      color: T.color.text,
      fontSize: T.typography.small.fontSize,
      backgroundColor: '#000000bb',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9000).setAlpha(0)
    this.scene.tweens.add({ targets: t, alpha: 1, duration: 200 })
    this.scene.time.delayedCall(duration - 300, () =>
      this.scene.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() })
    )
  }
}
