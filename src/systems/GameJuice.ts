import Phaser from 'phaser'
import { AudioManager } from './AudioManager'
import { Juice, JuiceSounds as ThemedSounds } from '../presentation/Juice'
import { ThemeName, Theme } from '../presentation/Theme'

/**
 * Foundation V3 compatibility facade over `presentation/Juice`.
 *
 * The positional signatures below are what prototypes 009–011 were written
 * against and are kept exactly. New prototypes should use `Juice` (or
 * `createPresentation(...).juice`) directly — it is themed, takes an options
 * object, and supports per-call intensity.
 */

export interface JuiceSounds {
  success?: string
  fail?: string
  collect?: string
  select?: string
  destroy?: string
  levelComplete?: string
}

export interface GameJuiceOptions {
  audio?: AudioManager
  sounds?: JuiceSounds
  theme?: ThemeName | Theme
}

export class GameJuice {
  private inner: Juice

  constructor(scene: Phaser.Scene, opts: GameJuiceOptions = {}) {
    const s = opts.sounds ?? {}
    const mapped: ThemedSounds = {
      success: s.success,
      fail: s.fail,
      collect: s.collect,
      select: s.select,
      destroy: s.destroy,
      complete: s.levelComplete,
    }
    this.inner = new Juice(scene, { audio: opts.audio, sounds: mapped, theme: opts.theme })
  }

  /** Escape hatch to the themed API without constructing a second instance. */
  get juice(): Juice { return this.inner }

  success(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    text?: string,
    sound?: string,
  ): void {
    this.inner.success(x, y, { target, text, sound })
  }

  fail(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    text?: string,
    sound?: string,
  ): void {
    this.inner.fail(x, y, { target, text, sound })
  }

  collect(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    text?: string,
    sound?: string,
  ): void {
    this.inner.collect(x, y, { target, text, sound })
  }

  select(target: Phaser.GameObjects.GameObject, sound?: string): void {
    this.inner.select(target, { sound })
  }

  destroy(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    sound?: string,
  ): void {
    this.inner.destroy(x, y, { target, sound })
  }

  levelComplete(sound?: string): void {
    this.inner.levelComplete({ sound })
  }
}
