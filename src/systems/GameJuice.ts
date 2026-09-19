import Phaser from 'phaser'
import { VFXManager } from './VFXManager'
import { AnimHelper } from './AnimHelper'
import { AudioManager } from './AudioManager'
import { DesignTokens as T } from '../core/DesignTokens'

/**
 * Sound keys for each juice action. All optional — the repo ships no audio
 * assets, so anything unset (or not yet loaded) silently plays nothing.
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
}

/**
 * Thin composer over VFXManager + AnimHelper + camera + AudioManager so
 * prototypes stop reimplementing the same feedback. Not an effects framework:
 * every method is a handful of calls to systems that already exist.
 *
 * Camera shake is deliberately restrained throughout.
 */
export class GameJuice {
  private vfx: VFXManager
  private audio?: AudioManager
  private sounds: JuiceSounds

  constructor(private scene: Phaser.Scene, opts: GameJuiceOptions = {}) {
    this.vfx    = new VFXManager(scene)
    this.audio  = opts.audio
    this.sounds = opts.sounds ?? {}
  }

  /** No-ops unless an AudioManager was supplied AND the key is actually loaded. */
  private play(key?: string): void {
    if (!key || !this.audio) return
    if (!this.scene.cache.audio.exists(key)) return
    this.audio.playSfx(key)
  }

  success(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    text?: string,
    sound?: string,
  ): void {
    if (target) AnimHelper.scalePunch(this.scene, target, 1.25, T.duration.normal)
    this.vfx.burst(x, y, 0x00ff88, 10)
    if (text) this.vfx.floatingText(x, y, text, T.color.success)
    this.play(sound ?? this.sounds.success)
  }

  fail(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    text?: string,
    sound?: string,
  ): void {
    if (target) AnimHelper.shake(this.scene, target, 6, T.duration.normal)
    this.vfx.burst(x, y, 0xff4455, 6)
    if (text) this.vfx.floatingText(x, y, text, T.color.danger)
    this.vfx.screenShake(3, 120)
    this.play(sound ?? this.sounds.fail)
  }

  collect(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    text?: string,
    sound?: string,
  ): void {
    if (target) AnimHelper.scalePunch(this.scene, target, 1.35, T.duration.fast)
    this.vfx.burst(x, y, 0xffcc44, 8)
    if (text) this.vfx.floatingText(x, y, text, '#ffcc44')
    this.play(sound ?? this.sounds.collect)
  }

  select(target: Phaser.GameObjects.GameObject, sound?: string): void {
    AnimHelper.scalePunch(this.scene, target, 1.12, T.duration.fast)
    this.play(sound ?? this.sounds.select)
  }

  destroy(
    x: number, y: number,
    target?: Phaser.GameObjects.GameObject,
    sound?: string,
  ): void {
    this.vfx.burst(x, y, 0xffffff, 12)
    if (target) AnimHelper.popOut(this.scene, target, T.duration.fast)
    this.vfx.screenShake(2, 100)
    this.play(sound ?? this.sounds.destroy)
  }

  levelComplete(sound?: string): void {
    this.vfx.screenShake(5, 320)
    this.vfx.flash(180)
    this.play(sound ?? this.sounds.levelComplete)
  }
}
