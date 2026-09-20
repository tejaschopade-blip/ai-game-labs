import Phaser from 'phaser'
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './Constants'
import { Themes } from '../presentation/Theme'
import { hex } from '../presentation/Theme'
import { BootScene } from '../scenes/BootScene'
import { PreloadScene } from '../scenes/PreloadScene'
import { PrototypeScene } from '../scenes/PrototypeScene'
import { FoundationTestScene } from '../../prototypes/001-foundation-test/FoundationTestScene'
import { RotationWorldScene } from '../../prototypes/002-rotation-world/RotationWorldScene'
import { LaserMirrorScene } from '../../prototypes/003-laser-mirrors/LaserMirrorScene'
import { TimeEchoScene } from '../../prototypes/004-time-echo/TimeEchoScene'
import { ChainReactionScene } from '../../prototypes/005-chain-reaction/ChainReactionScene'
import { StealPropertiesScene } from '../../prototypes/006-steal-properties/StealPropertiesScene'
import { SokobanScene } from '../../prototypes/007-sokoban-dna/SokobanScene'
import { BlockPlacementScene } from '../../prototypes/008-block-placement/BlockPlacementScene'
import { SortLabScene } from '../../prototypes/009-sort-lab/SortLabScene'
import { CozyMazeScene } from '../../prototypes/010-cozy-maze/CozyMazeScene'
import { LoopSortScene } from '../../prototypes/011-loop-sort/LoopSortScene'
import { GameSelectScene } from '../scenes/GameSelectScene'

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  // Matches the default `puzzle` theme so the letterbox around a FIT-scaled
  // canvas blends with the game rather than framing it in a different black.
  backgroundColor: hex(Themes.puzzle.colors.background),
  scene: [BootScene, PreloadScene, GameSelectScene, PrototypeScene, FoundationTestScene, RotationWorldScene, LaserMirrorScene, TimeEchoScene, ChainReactionScene, StealPropertiesScene, SokobanScene, BlockPlacementScene, SortLabScene, CozyMazeScene, LoopSortScene],
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
