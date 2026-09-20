import Phaser from 'phaser'
import { Theme, ThemeName, resolveTheme, hex, shade, fontScale } from './Theme'

/**
 * Cheap particle effects built from plain Graphics/Shape objects and tweens.
 * No emitters, no particle textures, no per-frame allocation outside the burst
 * itself — every particle self-destroys in its tween's `onComplete`.
 *
 * Counts are multiplied by `theme.intensity` and hard-capped, so a `minimal`
 * prototype stays quiet and no call can flood the display list.
 */

const MAX_PARTICLES = 48

export type Intensity = 'small' | 'medium' | 'large'

const INTENSITY_SCALE: Record<Intensity, number> = { small: 0.55, medium: 1, large: 1.7 }

export interface BurstOptions {
  color?: number
  count?: number
  intensity?: Intensity
  /** Pixel travel distance at the 1080 reference. */
  distance?: number
  size?: number
  duration?: number
  depth?: number
}

export interface FloatTextOptions {
  color?: number
  fontSize?: number
  rise?: number
  duration?: number
  depth?: number
}

export class Vfx {
  private t: Theme
  /** Design-unit → scene-unit factor, so effects read the same in any design space. */
  private k: number

  constructor(private scene: Phaser.Scene, theme?: ThemeName | Theme) {
    this.t = resolveTheme(theme)
    this.k = fontScale(scene)
  }

  setTheme(theme: ThemeName | Theme): void { this.t = resolveTheme(theme) }

  private scaled(n: number): number { return n * this.k }

  private count(base: number, i: Intensity = 'medium'): number {
    return Math.min(MAX_PARTICLES, Math.max(2, Math.round(base * this.t.intensity * INTENSITY_SCALE[i])))
  }

  /** Radial particle spray. The default "something happened here". */
  burst(x: number, y: number, o: BurstOptions = {}): void {
    const color = o.color ?? this.t.colors.accent
    const n     = o.count ?? this.count(12, o.intensity)
    const dist  = this.scaled(o.distance ?? 150)
    const size  = this.scaled(o.size ?? 10)
    const depth = o.depth ?? 1500
    const spin  = Math.random() * Math.PI

    for (let i = 0; i < n; i++) {
      const angle = spin + (i / n) * Math.PI * 2
      const speed = dist * Phaser.Math.FloatBetween(0.6, 1.15)
      const r     = size * Phaser.Math.FloatBetween(0.4, 1)
      const p = this.scene.add.circle(x, y, r, i % 3 === 0 ? shade(color, 0.18) : color)
        .setDepth(depth)
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        duration: o.duration ?? Phaser.Math.Between(340, 620),
        ease: this.t.ease.out,
        onComplete: () => p.destroy(),
      })
    }
  }

  /** Thin outward streaks. Sharper and more "impact" than a round burst. */
  spark(x: number, y: number, o: BurstOptions = {}): void {
    const color = o.color ?? this.t.colors.warning
    const n     = o.count ?? this.count(7, o.intensity)
    const dist  = this.scaled(o.distance ?? 120)
    const len   = this.scaled(o.size ?? 26)
    const depth = o.depth ?? 1500

    for (let i = 0; i < n; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const speed = dist * Phaser.Math.FloatBetween(0.5, 1.2)
      const s = this.scene.add
        .rectangle(x, y, len, Math.max(2, this.scaled(4)), color)
        .setDepth(depth)
        .setRotation(angle)
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        scaleX: 0.15, alpha: 0,
        duration: o.duration ?? Phaser.Math.Between(220, 400),
        ease: this.t.ease.out,
        onComplete: () => s.destroy(),
      })
    }
  }

  /**
   * Angular fragments that fly out and fall. Shattering ice, breaking crates —
   * anything that should read as *broken* rather than *vanished*.
   */
  shards(x: number, y: number, o: BurstOptions = {}): void {
    const color = o.color ?? this.t.colors.highlight
    const n     = o.count ?? this.count(8, o.intensity)
    const dist  = this.scaled(o.distance ?? 130)
    const size  = this.scaled(o.size ?? 18)
    const depth = o.depth ?? 1500

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3)
      const speed = dist * Phaser.Math.FloatBetween(0.55, 1.1)
      const w = size * Phaser.Math.FloatBetween(0.45, 1)
      const piece = this.scene.add
        .triangle(x, y, 0, w, w, w * 0.55, w * 0.35, 0, color)
        .setDepth(depth)
        .setAngle(Phaser.Math.Between(0, 360))
      this.scene.tweens.add({
        targets: piece,
        x: x + Math.cos(angle) * speed,
        // Fragments have weight: they arc downward rather than flying straight.
        y: y + Math.sin(angle) * speed * 0.6 + this.scaled(70),
        angle: piece.angle + Phaser.Math.Between(-220, 220),
        alpha: 0, scaleX: 0.4, scaleY: 0.4,
        duration: o.duration ?? Phaser.Math.Between(420, 700),
        ease: 'Quad.In',
        onComplete: () => piece.destroy(),
      })
    }
  }

  /**
   * Slow, soft motes that drift and fade. The quiet counterpart to `burst` —
   * for settling, landing and "something just moved here".
   */
  dust(x: number, y: number, o: BurstOptions = {}): void {
    const color = o.color ?? this.t.colors.highlight
    const n     = o.count ?? this.count(5, o.intensity ?? 'small')
    const dist  = this.scaled(o.distance ?? 60)
    const size  = this.scaled(o.size ?? 9)
    const depth = o.depth ?? 1400

    for (let i = 0; i < n; i++) {
      const angle = Math.PI + Phaser.Math.FloatBetween(-1.15, 1.15)
      const p = this.scene.add.circle(x, y, size * Phaser.Math.FloatBetween(0.5, 1), color, 0.5)
        .setDepth(depth)
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist * Phaser.Math.FloatBetween(0.6, 1.3),
        y: y + Math.sin(angle) * dist * 0.45 - this.scaled(16),
        alpha: 0, scaleX: 1.5, scaleY: 1.5,
        duration: o.duration ?? Phaser.Math.Between(420, 700),
        ease: this.t.ease.out,
        onComplete: () => p.destroy(),
      })
    }
  }

  /** Expanding fading ring. Reads as a pulse of energy leaving a point. */
  ring(x: number, y: number, radius = 40, o: BurstOptions = {}): void {
    const color = o.color ?? this.t.colors.primary
    const r = this.scaled(radius)
    const g = this.scene.add.graphics().setDepth(o.depth ?? 1400).setPosition(x, y)
    g.lineStyle(Math.max(2, this.scaled(6)), color, 0.85)
    g.strokeCircle(0, 0, r)
    this.scene.tweens.add({
      targets: g,
      scaleX: 2.1, scaleY: 2.1, alpha: 0,
      duration: o.duration ?? this.t.duration.dramatic,
      ease: this.t.ease.out,
      onComplete: () => g.destroy(),
    })
  }

  /** Soft radial bloom that fades in place. Cheap "this is important" glow. */
  glow(x: number, y: number, radius = 60, o: BurstOptions = {}): void {
    const color = o.color ?? this.t.colors.accent
    const r = this.scaled(radius)
    const g = this.scene.add.graphics().setDepth(o.depth ?? 1300).setPosition(x, y)
    for (let i = 3; i >= 1; i--) {
      g.fillStyle(color, 0.10 * i / 3)
      g.fillCircle(0, 0, r * (i / 3))
    }
    g.setScale(0.6)
    this.scene.tweens.add({
      targets: g,
      scaleX: 1.35, scaleY: 1.35, alpha: 0,
      duration: o.duration ?? this.t.duration.dramatic,
      ease: this.t.ease.out,
      onComplete: () => g.destroy(),
    })
  }

  /**
   * Falling confetti across the top of the view. Reserved for level completion —
   * it is the loudest thing in the library and stops being special if reused.
   */
  confetti(o: { count?: number; colors?: number[]; depth?: number; originY?: number } = {}): void {
    const W = this.scene.scale.gameSize.width
    const H = this.scene.scale.gameSize.height
    const colors = o.colors ?? [
      this.t.colors.primary, this.t.colors.secondary, this.t.colors.accent,
      this.t.colors.success, this.t.colors.warning,
    ]
    const n = Math.min(MAX_PARTICLES, o.count ?? this.count(26, 'medium'))
    const depth = o.depth ?? 1600
    const w = this.scaled(16)
    const h = this.scaled(26)

    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.FloatBetween(0.04, 0.96) * W
      const y = (o.originY ?? -h) - Phaser.Math.FloatBetween(0, H * 0.25)
      const c = colors[i % colors.length]
      const piece = this.scene.add
        .rectangle(x, y, w, h * Phaser.Math.FloatBetween(0.5, 1), c)
        .setDepth(depth)
        .setAngle(Phaser.Math.Between(0, 360))
      // The flutter repeats forever, so it has to be removed explicitly when
      // the fall finishes. A tween whose target has been destroyed keeps
      // running in the manager and is never collected.
      const flutter = this.scene.tweens.add({
        targets: piece, scaleX: 0.15,
        duration: Phaser.Math.Between(300, 600),
        yoyo: true, repeat: -1, ease: this.t.ease.inOut,
      })
      this.scene.tweens.add({
        targets: piece,
        y: H + h,
        x: x + Phaser.Math.FloatBetween(-0.08, 0.08) * W,
        angle: piece.angle + Phaser.Math.Between(180, 720),
        duration: Phaser.Math.Between(1400, 2400),
        delay: i * 18,
        ease: 'Quad.In',
        onComplete: () => { flutter.remove(); piece.destroy() },
      })
    }
  }

  /**
   * Fading dots dropped behind a moving object. Returns a stop function — the
   * caller MUST call it, since the timer outlives the movement otherwise.
   */
  trail(
    target: { x: number; y: number },
    o: { color?: number; size?: number; interval?: number; depth?: number } = {},
  ): () => void {
    const color = o.color ?? this.t.colors.primary
    const size  = this.scaled(o.size ?? 8)
    const depth = o.depth ?? 1200
    const ev = this.scene.time.addEvent({
      delay: o.interval ?? 40,
      loop: true,
      callback: () => {
        const dot = this.scene.add.circle(target.x, target.y, size, color, 0.6).setDepth(depth)
        this.scene.tweens.add({
          targets: dot, alpha: 0, scaleX: 0.2, scaleY: 0.2,
          duration: 380, ease: this.t.ease.out,
          onComplete: () => dot.destroy(),
        })
      },
    })
    return () => ev.remove()
  }

  /** Rising, fading text. Scores, `+1`, `✓`, short verdicts. */
  floatingText(x: number, y: number, text: string, o: FloatTextOptions = {}): void {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: this.t.fontFamily,
      fontSize: `${Math.round(this.scaled(o.fontSize ?? 46))}px`,
      fontStyle: 'bold',
      color: hex(o.color ?? this.t.colors.text),
    }).setOrigin(0.5).setDepth(o.depth ?? 2000).setScale(0.6)

    this.scene.tweens.add({
      targets: t, scaleX: 1, scaleY: 1,
      duration: this.t.duration.fast, ease: this.t.ease.overshoot,
    })
    this.scene.tweens.add({
      targets: t,
      y: y - this.scaled(o.rise ?? 110),
      alpha: 0,
      duration: o.duration ?? 1000,
      delay: this.t.duration.fast,
      ease: this.t.ease.out,
      onComplete: () => t.destroy(),
    })
  }

  /** Camera shake. Restrained by default — reserve it for real events. */
  screenShake(intensity = 3, duration = 140): void {
    this.scene.cameras.main.shake(duration, (intensity * this.t.intensity) / 1000)
  }

  /** Full-screen colour wash. Defaults to the theme, not white. */
  flash(color?: number, duration = 180): void {
    const c = Phaser.Display.Color.IntegerToColor(color ?? this.t.colors.highlight)
    this.scene.cameras.main.flash(duration, c.red, c.green, c.blue, false)
  }
}
