import Phaser from 'phaser'

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }) }

  preload(): void {
    // Load shared and prototype assets here
    // Example: this.load.image('key', 'assets/shared/images/file.png')
  }

  create(): void {
    this.scene.start('GameSelectScene')
  }
}
