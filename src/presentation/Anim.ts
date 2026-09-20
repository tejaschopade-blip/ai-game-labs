import Phaser from 'phaser'
import { AnimHelper, SlideEdge } from '../systems/AnimHelper'
import { Theme, ThemeName, resolveTheme } from './Theme'

/**
 * Animation presets with sensible defaults, tuned for *perceived responsiveness*
 * rather than for being noticeable. Durations come from the theme:
 *
 *   micro 100ms   press / release
 *   fast  160ms   selection, small state changes
 *   normal 240ms  movement, placement
 *   dramatic 460ms  level transitions
 *
 * Displacement scales with `theme.intensity`, so switching to `minimal` calms
 * every animation in a prototype without touching call sites.
 *
 * `AnimHelper` already implements pop / slide / float / fade correctly and kills
 * in-flight tweens first; those are delegated rather than reimplemented.
 */

type Tweenable = Phaser.GameObjects.GameObject
type Vec = { x: number; y: number; scaleX: number; scaleY: number; angle: number; alpha: number }

const v = (t: Tweenable): Vec => t as unknown as Vec

export interface AnimOptions {
  duration?: number
  delay?: number
  onComplete?: () => void
}

export class Anim {
  private t: Theme

  constructor(private scene: Phaser.Scene, theme?: ThemeName | Theme) {
    this.t = resolveTheme(theme)
  }

  setTheme(theme: ThemeName | Theme): void { this.t = resolveTheme(theme) }

  /** Scale up from nothing with an overshoot. The default "this just appeared". */
  pop(target: Tweenable, o: AnimOptions = {}): void {
    AnimHelper.popIn(this.scene, target, o.duration ?? this.t.duration.normal, o.onComplete)
  }

  popOut(target: Tweenable, o: AnimOptions = {}): void {
    AnimHelper.popOut(this.scene, target, o.duration ?? this.t.duration.fast, o.onComplete)
  }

  /**
   * Quick scale overshoot that returns to rest. The single most useful piece of
   * feedback in the library — use it on anything the player just acted on.
   */
  punch(target: Tweenable, scale = 1.18, o: AnimOptions = {}): void {
    const s = 1 + (scale - 1) * this.t.intensity
    const g = v(target)
    const baseX = g.scaleX || 1
    const baseY = g.scaleY || 1
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.add({
      targets: target,
      scaleX: baseX * s, scaleY: baseY * s,
      duration: (o.duration ?? this.t.duration.fast) * 0.4,
      delay: o.delay ?? 0,
      ease: this.t.ease.out,
      yoyo: true,
      onComplete: () => { g.scaleX = baseX; g.scaleY = baseY; o.onComplete?.() },
    })
  }

  /** Vertical hop with a settle. Good for "ready" states and collectables. */
  bounce(target: Tweenable, amount = 14, o: AnimOptions = {}): void {
    const g = v(target)
    const restY = g.y
    const d = o.duration ?? this.t.duration.normal
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.add({
      targets: target,
      y: restY - amount * this.t.intensity,
      duration: d * 0.45,
      ease: this.t.ease.out,
      yoyo: true,
      onComplete: () => { g.y = restY; o.onComplete?.() },
    })
  }

  /** Horizontal shake around the rest position. Failure feedback. */
  shake(target: Tweenable, amount = 8, o: AnimOptions = {}): void {
    const g = v(target)
    const restX = g.x
    const a = amount * this.t.intensity
    const d = o.duration ?? this.t.duration.normal
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.add({
      targets: target,
      x: restX + a,
      duration: d / 8,
      ease: this.t.ease.inOut,
      yoyo: true,
      repeat: 3,
      onComplete: () => { g.x = restX; o.onComplete?.() },
    })
  }

  /** Rotational wiggle. Reads as "no" without moving the object off its slot. */
  wobble(target: Tweenable, degrees = 7, o: AnimOptions = {}): void {
    const g = v(target)
    const rest = g.angle
    const a = degrees * this.t.intensity
    const d = o.duration ?? this.t.duration.normal
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.add({
      targets: target,
      angle: rest + a,
      duration: d / 6,
      ease: this.t.ease.inOut,
      yoyo: true,
      repeat: 2,
      onComplete: () => { g.angle = rest; o.onComplete?.() },
    })
  }

  /**
   * Squash and stretch on impact: the object flattens along one axis and
   * stretches along the other, then springs back. This is what makes a landing
   * read as "it hit something" rather than "it stopped".
   */
  squash(target: Tweenable, amount = 0.14, o: AnimOptions = {}): void {
    const g = v(target)
    const baseX = g.scaleX || 1
    const baseY = g.scaleY || 1
    const a = amount * this.t.intensity
    const d = o.duration ?? this.t.duration.fast
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.chain({
      targets: target,
      onComplete: () => { g.scaleX = baseX; g.scaleY = baseY; o.onComplete?.() },
      tweens: [
        { scaleX: baseX * (1 + a), scaleY: baseY * (1 - a), duration: d * 0.35, ease: this.t.ease.out },
        { scaleX: baseX, scaleY: baseY, duration: d * 0.65, ease: this.t.ease.overshoot },
      ],
    })
  }

  /**
   * Pulls back, then releases — the wind-up before a committed action. Runs
   * `onComplete` at the moment of release, not at the end of the settle.
   */
  anticipate(target: Tweenable, amount = 0.1, o: AnimOptions = {}): void {
    const g = v(target)
    const baseX = g.scaleX || 1
    const baseY = g.scaleY || 1
    const d = o.duration ?? this.t.duration.fast
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.chain({
      targets: target,
      tweens: [
        { scaleX: baseX * (1 - amount), scaleY: baseY * (1 - amount), duration: d * 0.6, ease: this.t.ease.out },
        {
          scaleX: baseX, scaleY: baseY, duration: d * 0.4, ease: this.t.ease.overshoot,
          onStart: () => o.onComplete?.(),
        },
      ],
    })
  }

  /** Looping idle drift. Call `stop(target)` to end it. */
  float(target: Tweenable, amount = 8, duration = 2000): void {
    AnimHelper.float(this.scene, target, amount * this.t.intensity, duration)
  }

  /** Looping breathing scale. Draws the eye to the next actionable thing. */
  pulse(target: Tweenable, max = 1.06, duration = 900): void {
    const scaled = 1 + (max - 1) * this.t.intensity
    this.scene.tweens.killTweensOf(target)
    this.scene.tweens.add({
      targets: target,
      scaleX: scaled, scaleY: scaled,
      duration, yoyo: true, repeat: -1, ease: this.t.ease.inOut,
    })
  }

  spin(target: Tweenable, turns = 1, o: AnimOptions = {}): void {
    const g = v(target)
    this.scene.tweens.add({
      targets: target,
      angle: g.angle + 360 * turns,
      duration: o.duration ?? this.t.duration.dramatic,
      delay: o.delay ?? 0,
      ease: this.t.ease.out,
      onComplete: o.onComplete,
    })
  }

  /** Move with an elastic settle at the destination. Placement, snapping. */
  spring(target: Tweenable, x: number, y: number, o: AnimOptions = {}): Promise<void> {
    this.scene.tweens.killTweensOf(target)
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: target, x, y,
        duration: o.duration ?? this.t.duration.dramatic,
        delay: o.delay ?? 0,
        ease: this.t.ease.settle,
        easeParams: [1, 0.72],
        onComplete: () => { o.onComplete?.(); resolve() },
      })
    })
  }

  /** Move with a small overshoot — snappier than `spring`, still not a teleport. */
  moveTo(target: Tweenable, x: number, y: number, o: AnimOptions = {}): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: target, x, y,
        duration: o.duration ?? this.t.duration.normal,
        delay: o.delay ?? 0,
        ease: this.t.ease.overshoot,
        onComplete: () => { o.onComplete?.(); resolve() },
      })
    })
  }

  slideIn(target: Tweenable, from: SlideEdge = 'bottom', distance = 120, o: AnimOptions = {}): void {
    AnimHelper.slideIn(this.scene, target, from, distance,
      o.duration ?? this.t.duration.normal, o.onComplete)
  }

  slideOut(target: Tweenable, to: SlideEdge = 'bottom', distance = 120, o: AnimOptions = {}): void {
    AnimHelper.slideOut(this.scene, target, to, distance,
      o.duration ?? this.t.duration.fast, o.onComplete)
  }

  fadeIn(target: Tweenable, o: AnimOptions = {}): void {
    AnimHelper.fadeIn(this.scene, target, o.duration ?? this.t.duration.normal, o.delay ?? 0)
  }

  fadeOut(target: Tweenable, o: AnimOptions = {}): void {
    AnimHelper.fadeOut(this.scene, target, o.duration ?? this.t.duration.normal, o.onComplete)
  }

  /**
   * Staggered entrance for a group. Cheaper to read than everything appearing
   * at once, and the single biggest "this was designed" tell on level load.
   */
  stagger(targets: Tweenable[], perItem = 45, o: AnimOptions = {}): void {
    targets.forEach((target, i) => {
      const g = v(target)
      const restY = g.y
      this.scene.tweens.killTweensOf(target)
      g.alpha = 0
      g.scaleX = 0.7
      g.scaleY = 0.7
      g.y = restY + 18
      this.scene.tweens.add({
        targets: target,
        alpha: 1, scaleX: 1, scaleY: 1, y: restY,
        duration: o.duration ?? this.t.duration.normal,
        delay: (o.delay ?? 0) + i * perItem,
        ease: this.t.ease.overshoot,
        onComplete: i === targets.length - 1 ? o.onComplete : undefined,
      })
    })
  }

  stop(target: Tweenable): void { this.scene.tweens.killTweensOf(target) }
}
