import Phaser from 'phaser'
import { InputManager } from '../systems/InputManager'
import { AudioManager } from '../systems/AudioManager'
import { DebugOverlay } from '../ui/DebugOverlay'
import { PROTOTYPE_NAME } from '../core/Constants'

export class PrototypeScene extends Phaser.Scene {
  private keys!: InputManager
  private audio!: AudioManager
  private debug!: DebugOverlay

  constructor() { super({ key: 'PrototypeScene' }) }

  create(): void {
    this.keys = new InputManager(this)
    this.audio = new AudioManager(this)
    this.debug = new DebugOverlay(this, PROTOTYPE_NAME)

    this.add.text(
      this.scale.width / 2,
      this.scale.height / 2,
      'AI Game Lab — Foundation\nArrows / WASD to move\nR to restart',
      { color: '#ffffff', fontSize: '18px', align: 'center' }
    ).setOrigin(0.5)
  }

  update(): void {
    // keys and audio available for prototype use; debug overlay updates every frame
    void this.keys
    void this.audio
    this.debug.update()
  }
}
