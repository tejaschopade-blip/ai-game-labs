import Phaser from 'phaser'

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }) }

  preload(): void {
    // Load prototype assets here
    // Example: this.load.image('key', 'assets/images/file.png')
  }

  create(): void {
    this.scene.start('FoundationTestScene')
  }
}
