import Phaser from 'phaser'
import { AudioManager } from '../systems/AudioManager'
import { Anim } from './Anim'
import { Vfx, Intensity } from './Vfx'
import { Theme, ThemeName, resolveTheme } from './Theme'

/**
 * One call per *meaning*, not per effect.
 *
 *     juice.success(x, y, { target, text: '+10' })
 *     juice.fail(x, y, { target })
 *     juice.levelComplete()
 *
 * Each action composes animation + particles + optional sound + optional
 * floating text + a restrained camera nudge, all weighted by the theme's
 * intensity and an optional per-call `intensity`. Nothing here is required:
 * every option is opt-in, and every effect degrades to silence when the
 * ingredient is missing (no AudioManager, no loaded sound, no target).
 *
 * Deliberately not an event system. Prototypes call it directly.
 */

export type SoundSlot =
  | 'click' | 'select' | 'success' | 'fail' | 'collect' | 'impact' | 'destroy' | 'complete'

export type JuiceSounds = Partial<Record<SoundSlot, string>>

export interface JuiceOptions {
  audio?: AudioManager
  sounds?: JuiceSounds
  theme?: ThemeName | Theme
}

export interface FeedbackOptions {
  target?: Phaser.GameObjects.GameObject
  text?: string
  intensity?: Intensity
  color?: number
  sound?: string
  /** Suppress the camera nudge for this call. */
  shake?: boolean
}

export interface CollectOptions extends FeedbackOptions {
  /** Fly the target here before it disappears — a score counter, an inventory slot. */
  to?: { x: number; y: number }
}

export class Juice {
  readonly anim: Anim
  readonly vfx: Vfx
  private t: Theme
  private audio?: AudioManager
  private sounds: JuiceSounds

  constructor(private scene: Phaser.Scene, opts: JuiceOptions = {}) {
    this.t = resolveTheme(opts.theme)
    this.anim = new Anim(scene, this.t)
    this.vfx = new Vfx(scene, this.t)
    this.audio = opts.audio
    this.sounds = opts.sounds ?? {}
  }

  setTheme(theme: ThemeName | Theme): void {
    this.t = resolveTheme(theme)
    this.anim.setTheme(this.t)
    this.vfx.setTheme(this.t)
  }

  /** Silently does nothing unless an AudioManager was supplied AND the key is loaded. */
  play(slot: SoundSlot, override?: string): void {
    const key = override ?? this.sounds[slot]
    if (!key || !this.audio) return
    if (!this.scene.cache.audio.exists(key)) return
    this.audio.playSfx(key)
  }

  /** Tap acknowledged. Fires on *every* tap, so it stays deliberately small. */
  select(target?: Phaser.GameObjects.GameObject, o: FeedbackOptions = {}): void {
    if (target) this.anim.punch(target, 1.1, { duration: this.t.duration.fast })
    this.play('select', o.sound)
  }

  /** Non-committal acknowledgement with no state change — menu taps, toggles. */
  tap(target?: Phaser.GameObjects.GameObject, o: FeedbackOptions = {}): void {
    if (target) this.anim.punch(target, 1.06, { duration: this.t.duration.micro })
    this.play('click', o.sound)
  }

  /** The move worked. */
  success(x: number, y: number, o: FeedbackOptions = {}): void {
    const color = o.color ?? this.t.colors.success
    if (o.target) this.anim.punch(o.target, 1.2)
    this.vfx.burst(x, y, { color, intensity: o.intensity ?? 'medium' })
    this.vfx.ring(x, y, 34, { color })
    if (o.text) this.vfx.floatingText(x, y, o.text, { color })
    this.play('success', o.sound)
  }

  /** The move was rejected. Shake the object, not the world. */
  fail(x: number, y: number, o: FeedbackOptions = {}): void {
    const color = o.color ?? this.t.colors.danger
    if (o.target) this.anim.shake(o.target, 8)
    this.vfx.burst(x, y, { color, intensity: o.intensity ?? 'small', distance: 90 })
    if (o.text) this.vfx.floatingText(x, y, o.text, { color })
    if (o.shake !== false) this.vfx.screenShake(2.5, 120)
    this.play('fail', o.sound)
  }

  /** Something was picked up. Optionally flies to a destination first. */
  collect(x: number, y: number, o: CollectOptions = {}): void {
    const color = o.color ?? this.t.colors.accent
    this.play('collect', o.sound)

    if (o.target && o.to) {
      this.anim.moveTo(o.target, o.to.x, o.to.y, { duration: this.t.duration.dramatic })
        .then(() => {
          this.vfx.burst(o.to!.x, o.to!.y, { color, intensity: o.intensity ?? 'small' })
          this.anim.popOut(o.target!)
        })
    } else {
      if (o.target) this.anim.punch(o.target, 1.3)
      this.vfx.burst(x, y, { color, intensity: o.intensity ?? 'medium' })
    }

    if (o.text) this.vfx.floatingText(x, y, o.text, { color })
  }

  /** Something was removed from play. */
  destroy(x: number, y: number, o: FeedbackOptions = {}): void {
    const color = o.color ?? this.t.colors.muted
    this.vfx.burst(x, y, { color, intensity: o.intensity ?? 'medium' })
    this.vfx.spark(x, y, { color, intensity: o.intensity ?? 'small' })
    if (o.target) this.anim.popOut(o.target)
    if (o.shake !== false) this.vfx.screenShake(2, 100)
    this.play('destroy', o.sound)
  }

  /** A hit landed. Spark plus a very short shake — no particles storm. */
  impact(x: number, y: number, o: FeedbackOptions = {}): void {
    this.vfx.spark(x, y, { color: o.color ?? this.t.colors.warning, intensity: o.intensity ?? 'medium' })
    if (o.target) this.anim.punch(o.target, 1.12, { duration: this.t.duration.micro })
    if (o.shake !== false) this.vfx.screenShake(2, 90)
    this.play('impact', o.sound)
  }

  /**
   * The big one. Confetti + a themed flash + a staggered reaction from whatever
   * the player just finished. Everything else in this class is restrained so
   * that this one lands.
   */
  levelComplete(o: { targets?: Phaser.GameObjects.GameObject[]; sound?: string } = {}): void {
    this.vfx.flash(this.t.colors.success, 200)
    this.vfx.screenShake(4, 260)
    this.vfx.confetti()
    o.targets?.forEach((target, i) => {
      this.anim.punch(target, 1.16, { delay: i * 55 })
    })
    this.play('complete', o.sound)
  }
}
