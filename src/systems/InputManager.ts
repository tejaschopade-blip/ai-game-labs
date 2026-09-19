import Phaser from 'phaser'

export enum GameAction {
  MoveUp          = 'MoveUp',
  MoveDown        = 'MoveDown',
  MoveLeft        = 'MoveLeft',
  MoveRight       = 'MoveRight',
  PrimaryAction   = 'PrimaryAction',
  SecondaryAction = 'SecondaryAction',
  Pause           = 'Pause',
  Restart         = 'Restart',
}

interface ActionBinding { keys: number[] }

const DEFAULT_BINDINGS: Record<GameAction, ActionBinding> = {
  [GameAction.MoveUp]:          { keys: [Phaser.Input.Keyboard.KeyCodes.W,     Phaser.Input.Keyboard.KeyCodes.UP]    },
  [GameAction.MoveDown]:        { keys: [Phaser.Input.Keyboard.KeyCodes.S,     Phaser.Input.Keyboard.KeyCodes.DOWN]  },
  [GameAction.MoveLeft]:        { keys: [Phaser.Input.Keyboard.KeyCodes.A,     Phaser.Input.Keyboard.KeyCodes.LEFT]  },
  [GameAction.MoveRight]:       { keys: [Phaser.Input.Keyboard.KeyCodes.D,     Phaser.Input.Keyboard.KeyCodes.RIGHT] },
  [GameAction.PrimaryAction]:   { keys: [Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.Z]    },
  [GameAction.SecondaryAction]: { keys: [Phaser.Input.Keyboard.KeyCodes.X,     Phaser.Input.Keyboard.KeyCodes.SHIFT] },
  [GameAction.Pause]:           { keys: [Phaser.Input.Keyboard.KeyCodes.ESC,   Phaser.Input.Keyboard.KeyCodes.P]    },
  [GameAction.Restart]:         { keys: [Phaser.Input.Keyboard.KeyCodes.R]                                          },
}

export class InputManager {
  private actionKeys = new Map<GameAction, Phaser.Input.Keyboard.Key[]>()
  pointer: Phaser.Input.Pointer

  constructor(scene: Phaser.Scene, bindings: Record<GameAction, ActionBinding> = DEFAULT_BINDINGS) {
    const kb = scene.input.keyboard!
    for (const [action, binding] of Object.entries(bindings) as [GameAction, ActionBinding][]) {
      this.actionKeys.set(action, binding.keys.map(k => kb.addKey(k)))
    }
    this.pointer = scene.input.activePointer
  }

  isDown(action: GameAction): boolean {
    return this.actionKeys.get(action)?.some(k => k.isDown) ?? false
  }

  isJustDown(action: GameAction): boolean {
    return this.actionKeys.get(action)?.some(k => Phaser.Input.Keyboard.JustDown(k)) ?? false
  }

  // Convenience getters — backward compatible with existing prototypes
  get up():    boolean { return this.isDown(GameAction.MoveUp)    }
  get down():  boolean { return this.isDown(GameAction.MoveDown)  }
  get left():  boolean { return this.isDown(GameAction.MoveLeft)  }
  get right(): boolean { return this.isDown(GameAction.MoveRight) }
}
