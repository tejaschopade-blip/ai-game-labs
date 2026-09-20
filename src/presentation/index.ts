import Phaser from 'phaser'
import { Layout } from '../systems/Layout'
import { AudioManager } from '../systems/AudioManager'
import { UIFactory } from '../ui/UIFactory'
import {
  Theme, ThemeName, TextRole, resolveTheme, scaleThemeToScene,
  textStyle, fontPx, px, hex, shade, mix,
} from './Theme'
import { Anim } from './Anim'
import { Vfx } from './Vfx'
import { Juice, JuiceSounds } from './Juice'
import { applyBackground, BackgroundOptions, BackgroundHandle } from './Backgrounds'
import { makePressable, PressableOptions, PressableHandle } from './Touch'

/**
 * One import, one call, everything a prototype needs to look like a game:
 *
 *     const p = createPresentation(this, { theme: 'cozy', background: true })
 *     p.ui.createButton({ ... })
 *     p.anim.pop(tile)
 *     p.juice.success(x, y, { target: tile, text: '+1' })
 *     p.vfx.burst(x, y)
 *     p.layout.safeTopCenter(40)
 *     p.press(tile, { hitRadius: 40, onPress: () => ... })
 *
 * Flat on purpose — an AI agent (or a human at 2am) should be able to guess
 * every call from the file names. There is no registry, no service locator and
 * nothing to register; `destroy()` is only needed if a background was applied.
 */
export interface PresentationOptions {
  theme?: ThemeName | Theme
  /** `true` uses the theme's default preset; an object overrides it; omit for none. */
  background?: boolean | BackgroundOptions
  audio?: AudioManager
  sounds?: JuiceSounds
}

export interface Presentation {
  theme: Theme
  layout: Layout
  ui: UIFactory
  anim: Anim
  vfx: Vfx
  juice: Juice
  background?: BackgroundHandle
  /** Attach press feedback + a forgiving hit area to any GameObject. */
  press(
    target: Phaser.GameObjects.GameObject,
    opts?: PressableOptions,
  ): PressableHandle
  /** Phaser text style for a typography role, scaled to this scene's design space. */
  text(role: TextRole, color?: number): Phaser.Types.GameObjects.Text.TextStyle
  /** Resolved pixel size for a typography role. */
  fontPx(role: TextRole): number
  /** Scales a length authored at the 1080 reference into this scene's design space. */
  px(value: number): number
  /** Releases anything this bundle owns. Only the background needs it. */
  destroy(): void
}

export function createPresentation(
  scene: Phaser.Scene,
  opts: PresentationOptions = {},
): Presentation {
  // Geometry is rescaled into this scene's design space up front, so every
  // primitive downstream reads correct radii/shadows without knowing the
  // orientation. See scaleThemeToScene.
  const theme = scaleThemeToScene(scene, resolveTheme(opts.theme))

  const background = opts.background
    ? applyBackground(scene, opts.background === true ? {} : opts.background, theme)
    : undefined

  const p: Presentation = {
    theme,
    layout: new Layout(scene),
    ui: new UIFactory(scene, theme),
    anim: new Anim(scene, theme),
    vfx: new Vfx(scene, theme),
    juice: new Juice(scene, { theme, audio: opts.audio, sounds: opts.sounds }),
    background,
    press: (target, pressOpts = {}) => makePressable(scene, target, pressOpts, theme),
    text: (role, color) => textStyle(scene, role, theme, color),
    fontPx: role => fontPx(scene, role, theme),
    px: value => px(scene, value),
    destroy: () => { background?.destroy() },
  }

  // Backgrounds outlive create() but not the scene; wiring this once here means
  // a prototype cannot forget it and leak a Graphics per restart.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => p.destroy())

  return p
}

export * from './Theme'
export * from './Draw'
export { Anim } from './Anim'
export { Vfx } from './Vfx'
export type { Intensity, BurstOptions, FloatTextOptions } from './Vfx'
export { Juice } from './Juice'
export type { JuiceSounds, JuiceOptions, FeedbackOptions, CollectOptions, SoundSlot } from './Juice'
export { applyBackground } from './Backgrounds'
export type { BackgroundOptions, BackgroundHandle } from './Backgrounds'
export { makePressable } from './Touch'
export type { PressableOptions, PressableHandle } from './Touch'
export { hex, shade, mix }
