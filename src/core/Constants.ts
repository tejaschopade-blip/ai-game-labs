// Boot design resolution. Prototypes 001-010 were authored against this and
// inherit it from GameConfig — do not change it.
export const DESIGN_WIDTH  = 960
export const DESIGN_HEIGHT = 540
export const PROTOTYPE_NAME = '010-cozy-maze'
export const ACTIVE_SCENE   = 'CozyMazeScene'

// Aliases for backward compatibility with existing prototypes
export const GAME_WIDTH  = DESIGN_WIDTH
export const GAME_HEIGHT = DESIGN_HEIGHT

// Foundation V3 — per-prototype design spaces. A scene opts in via
// applyPrototypeConfig(); nothing is applied globally.
export const LANDSCAPE_WIDTH  = 960
export const LANDSCAPE_HEIGHT = 540
export const PORTRAIT_WIDTH   = 1080
export const PORTRAIT_HEIGHT  = 1920
