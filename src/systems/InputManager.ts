import Phaser from 'phaser'

export class InputManager {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  pointer!: Phaser.Input.Pointer

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!
    this.cursors = kb.createCursorKeys()
    this.wasd = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.pointer = scene.input.activePointer
  }

  get up(): boolean { return this.cursors.up.isDown || this.wasd.up.isDown }
  get down(): boolean { return this.cursors.down.isDown || this.wasd.down.isDown }
  get left(): boolean { return this.cursors.left.isDown || this.wasd.left.isDown }
  get right(): boolean { return this.cursors.right.isDown || this.wasd.right.isDown }

  isKeyDown(key: Phaser.Input.Keyboard.Key): boolean { return key.isDown }

  addKey(keyCode: number): Phaser.Input.Keyboard.Key {
    return this.scene.input.keyboard!.addKey(keyCode)
  }
}
