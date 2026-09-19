import Phaser from 'phaser'
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './Constants'
import { DesignTokens } from './DesignTokens'
import { BootScene } from '../scenes/BootScene'
import { PreloadScene } from '../scenes/PreloadScene'
import { PrototypeScene } from '../scenes/PrototypeScene'
import { FoundationTestScene } from '../../prototypes/001-foundation-test/FoundationTestScene'
import { RotationWorldScene } from '../../prototypes/002-rotation-world/RotationWorldScene'

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: DesignTokens.color.bg,
  scene: [BootScene, PreloadScene, PrototypeScene, FoundationTestScene, RotationWorldScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
}
