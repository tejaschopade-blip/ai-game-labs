import Phaser from 'phaser'
import { Theme, ThemeName, resolveTheme, fontScale } from './Theme'

/**
 * The press lifecycle, in one call:
 *
 *   IDLE → (pointerdown) PRESSED → (pointerup over target) RELEASE → onPress
 *                              └── (pointer leaves / cancels) → back to IDLE
 *
 * Two things here matter more than they look:
 *
 * 1. `onPress` fires on *release over the target*, never on press. Firing on
 *    press removes the player's ability to cancel by sliding off, and
 *    double-fires on several mobile browsers.
 * 2. The hit area is padded beyond the visual. Touch is imprecise; a target that
 *    needs a pixel-accurate tap feels broken even when it is working.
 */

export interface PressableOptions {
  onPress?: () => void
  onPressStart?: () => void
  onCancel?: () => void
  /** Extra hit area on every side, in design units (scaled per scene). Default 16. */
  hitPadding?: number
  /** Rect hit area. Required for Graphics/Container targets, which have no size. */
  hitSize?: { width: number; height: number }
  /** Circular hit area. Takes precedence over `hitSize`. */
  hitRadius?: number
  /** Scale while held. Default 0.94 — enough to feel, small enough not to jump. */
  pressScale?: number
  /** Overshoot back to rest on release. Default true. */
  releaseBounce?: boolean
  /** Called on release with `false` when the interaction was invalid (see `reject`). */
  cursor?: boolean
}

export interface PressableHandle {
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  /** Plays the "that isn't allowed" shake without firing `onPress`. */
  reject(): void
  destroy(): void
}

type Transformable = Phaser.GameObjects.GameObject & {
  x: number; y: number; scaleX: number; scaleY: number
  setInteractive(hitArea?: unknown, callback?: unknown, dropZone?: boolean): Phaser.GameObjects.GameObject
  disableInteractive(): Phaser.GameObjects.GameObject
}

/**
 * Attaches press feedback + a forgiving hit area to any GameObject.
 * The caller keeps ownership of the object; `destroy()` only detaches listeners.
 */
export function makePressable(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  opts: PressableOptions = {},
  theme?: ThemeName | Theme,
): PressableHandle {
  const t: Theme = resolveTheme(theme)
  const k = fontScale(scene)
  const go = target as Transformable

  const pad = (opts.hitPadding ?? 16) * k
  const pressScale = opts.pressScale ?? 0.94

  if (opts.hitRadius !== undefined) {
    const r = opts.hitRadius + pad
    go.setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains)
  } else if (opts.hitSize) {
    const w = opts.hitSize.width + pad * 2
    const h = opts.hitSize.height + pad * 2
    go.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains)
  } else {
    go.setInteractive()
  }

  if (opts.cursor !== false) {
    const io = (go as unknown as { input?: Phaser.Types.Input.InteractiveObject }).input
    if (io) io.cursor = 'pointer'
  }

  // Captured at attach time: the object's neutral scale, so a pressable thing
  // that was already scaled (a shrunken settled piece, say) returns to *its*
  // rest rather than to 1.
  const restX = go.scaleX || 1
  const restY = go.scaleY || 1

  let enabled = true
  let held = false

  const toScale = (sx: number, sy: number, duration: number, ease: string): void => {
    scene.tweens.killTweensOf(target)
    scene.tweens.add({ targets: target, scaleX: sx, scaleY: sy, duration, ease })
  }

  const press = (): void => {
    if (!enabled || held) return
    held = true
    toScale(restX * pressScale, restY * pressScale, t.duration.micro, t.ease.out)
    opts.onPressStart?.()
  }

  const release = (): void => {
    if (!enabled || !held) return
    held = false
    if (opts.releaseBounce === false) {
      toScale(restX, restY, t.duration.micro, t.ease.out)
    } else {
      toScale(restX, restY, t.duration.fast, t.ease.overshoot)
    }
    opts.onPress?.()
  }

  const cancel = (): void => {
    if (!held) return
    held = false
    toScale(restX, restY, t.duration.fast, t.ease.out)
    opts.onCancel?.()
  }

  target.on('pointerdown', press)
  target.on('pointerup', release)
  target.on('pointerout', cancel)
  target.on('pointerupoutside', cancel)

  return {
    isEnabled: () => enabled,
    setEnabled: (next: boolean) => {
      enabled = next
      if (next) {
        go.setInteractive()
      } else {
        cancel()
        go.disableInteractive()
      }
    },
    reject: () => {
      const x = go.x
      scene.tweens.killTweensOf(target)
      scene.tweens.add({
        targets: target,
        x: x + 7 * t.intensity,
        duration: t.duration.normal / 8,
        yoyo: true, repeat: 3, ease: t.ease.inOut,
        onComplete: () => { go.x = x },
      })
    },
    destroy: () => {
      target.off('pointerdown', press)
      target.off('pointerup', release)
      target.off('pointerout', cancel)
      target.off('pointerupoutside', cancel)
      scene.tweens.killTweensOf(target)
    },
  }
}
