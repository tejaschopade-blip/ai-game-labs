import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from './Constants'
import { BootScene } from '../scenes/BootScene'
import { PreloadScene } from '../scenes/PreloadScene'
import { PrototypeScene } from '../scenes/PrototypeScene'
import { FoundationTestScene } from '../../prototypes/001-foundation-test/FoundationTestScene'
import { RotationWorldScene } from '../../prototypes/002-rotation-world/RotationWorldScene'

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#111111',
  scene: [BootScene, PreloadScene, PrototypeScene, FoundationTestScene, RotationWorldScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
}
