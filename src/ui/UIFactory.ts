import Phaser from 'phaser'
import { DesignTokens } from '../core/DesignTokens'
import { Theme, ThemeName, resolveTheme, hex } from '../presentation/Theme'
import { drawRoundedCard, drawShadow, drawPill } from '../presentation/Draw'

const T = DesignTokens

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ButtonState = 'normal' | 'pressed' | 'disabled' | 'selected'
export type TextScale = 'title' | 'heading' | 'body' | 'small' | 'tiny'

export interface ButtonHandle {
  container: Phaser.GameObjects.Container
  getState(): ButtonState
  setState(state: ButtonState): void
  setEnabled(enabled: boolean): void
  setSelected(selected: boolean): void
  setText(text: string): void
  destroy(): void
}

export interface PanelHandle {
  container: Phaser.GameObjects.Container
  setTitle(text: string): void
  destroy(): void
}

export interface ProgressBarHandle {
  container: Phaser.GameObjects.Container
  getValue(): number
  setValue(value: number, animate?: boolean): void
  destroy(): void
}

export interface IconHandle {
  container: Phaser.GameObjects.Container
  setEnabled(enabled: boolean): void
  destroy(): void
}

export interface ButtonOptions {
  x: number
  y: number
  text: string
  onPress: () => void
  width?: number
  height?: number
  /** Fill colour in the normal state. */
  color?: number
  textColor?: string
  /** Fill in the `selected` state. Defaults to a slight lightening of `color`. */
  selectedColor?: number
  selectedTextColor?: string
  textScale?: TextScale
  radius?: number
  shadow?: boolean
  state?: ButtonState
  /**
   * Minimum hit-area size on each axis. Defaults to DesignTokens.button.minTouch
   * (sized for the 1080-wide portrait space). Pass 0 to use the exact visual size.
   */
  minTouch?: number
  /** Use the landscape `typography` scale instead of the portrait `text` scale. */
  landscape?: boolean
}

export interface PanelOptions {
  x: number
  y: number
  width: number
  height: number
  fill?: number
  stroke?: number
  strokeWidth?: number
  radius?: number
  shadow?: boolean
  title?: string
  titleColor?: string
  titleScale?: TextScale
  landscape?: boolean
}

export interface LabelOptions {
  x: number
  y: number
  text: string
  textScale?: TextScale
  color?: string
  align?: 'left' | 'center' | 'right'
  originX?: number
  originY?: number
  /** Stroke outline, for readability over busy backgrounds. */
  outline?: { color: string; thickness: number }
  shadow?: boolean
  wordWrapWidth?: number
  fontSize?: string
  landscape?: boolean
}

export interface ProgressBarOptions {
  x: number
  y: number
  width: number
  height?: number
  bgColor?: number
  fillColor?: number
  radius?: number
  value?: number
  /** Tween duration for animated setValue calls. */
  duration?: number
}

export interface IconOptions {
  x: number
  y: number
  size?: number
  /** Text glyph to render. Ignored when `draw` is supplied. */
  glyph?: string
  /** Custom vector content, drawn centred on (0,0) within `size`. */
  draw?: (g: Phaser.GameObjects.Graphics, size: number) => void
  color?: string
  /** Optional background chip behind the icon. */
  background?: number
  backgroundAlpha?: number
  radius?: number
  onPress?: () => void
  minTouch?: number
}

export interface BadgeOptions {
  x: number
  y: number
  text: string
  /** Pill fill. Defaults to the theme's surfaceAlt. */
  color?: number
  textColor?: string
  textScale?: TextScale
  /** Horizontal padding around the text. */
  paddingX?: number
  height?: number
  shadow?: boolean
  landscape?: boolean
}

export interface BadgeHandle {
  container: Phaser.GameObjects.Container
  setText(text: string): void
  setColor(color: number): void
  destroy(): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Lighten (pct > 0) or darken (pct < 0) a colour. pct is a 0..1 fraction. */
function shade(color: number, pct: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color)
  const f = (v: number) => Phaser.Math.Clamp(Math.round(v + 255 * pct), 0, 255)
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue))
}

// ─────────────────────────────────────────────────────────────────────────────
// UIFactory
// ─────────────────────────────────────────────────────────────────────────────

export class UIFactory {
  private theme: Theme

  /**
   * `theme` controls corner depth (sheen/bevel), shadow softness and the font
   * family — not the fill colours, which every existing call site passes
   * explicitly. Omitting it keeps the dark `puzzle` personality.
   */
  constructor(private scene: Phaser.Scene, theme?: ThemeName | Theme) {
    this.theme = resolveTheme(theme)
  }

  setTheme(theme: ThemeName | Theme): void { this.theme = resolveTheme(theme) }

  // ───────────────────────────────────────────────────────────────────────────
  // Foundation V2 — original API. Signatures are preserved exactly; these keep
  // using the landscape `typography` tokens so existing prototypes are unaffected.
  // ───────────────────────────────────────────────────────────────────────────

  label(x: number, y: number, text: string, style?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, text, {
      fontFamily: this.theme.fontFamily,
      color: T.color.text,
      fontSize: T.typography.body.fontSize,
      ...style,
    }).setOrigin(0.5)
  }

  /**
   * Original button. Signature unchanged.
   *
   * Behaviour note: `onClick` now fires on pointer *release over the button*
   * rather than on press, and the button un-presses correctly when the pointer
   * is dragged off. Firing on press is a touch anti-pattern — it removes any
   * chance to cancel and double-fires on some mobile browsers.
   */
  button(
    x: number, y: number,
    label: string,
    onClick: () => void,
    style?: { width?: number; height?: number; color?: number },
  ): Phaser.GameObjects.Container {
    return this.createButton({
      x, y,
      text: label,
      onPress: onClick,
      width: style?.width ?? 200,
      height: style?.height ?? T.ui.buttonHeight,
      color: style?.color ?? 0x4488ff,
      radius: T.radius.sm,
      landscape: true,
      minTouch: 0,
      shadow: false,
    }).container
  }

  panel(x: number, y: number, width: number, height: number): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(x, y, width, height, 0x1a1a2e).setStrokeStyle(1, 0x333355)
  }

  progressBar(x: number, y: number, width: number, height = 12): {
    container: Phaser.GameObjects.Container
    setValue: (v: number) => void
  } {
    const bg   = this.scene.add.rectangle(0, 0, width, height, 0x333333)
    const fill = this.scene.add.rectangle(-width / 2, 0, 0, height - 2, 0x4488ff).setOrigin(0, 0.5)
    const container = this.scene.add.container(x, y, [bg, fill])
    return { container, setValue: (v: number) => { fill.width = Phaser.Math.Clamp(v, 0, 1) * width } }
  }

  toast(text: string, duration = T.ui.toastDuration): void {
    const scene = this.scene
    const th = this.theme
    const cx = scene.scale.width / 2
    const cy = scene.scale.height - 80

    const txt = scene.add.text(0, 0, text, {
      fontFamily: th.fontFamily,
      color: T.color.text,
      fontSize: T.typography.small.fontSize,
    }).setOrigin(0.5)

    const w = txt.width + 44
    const h = txt.height + 22
    const bg = scene.add.graphics()
    drawShadow(bg, 0, 0, w, h, { radius: h / 2 }, th)
    drawPill(bg, 0, 0, w, h, { fill: th.colors.surfaceAlt, stroke: th.colors.border, strokeWidth: th.stroke.thin }, th)

    const container = scene.add.container(cx, cy, [bg, txt])
      .setScrollFactor(0).setDepth(9000).setAlpha(0)

    scene.tweens.add({ targets: container, alpha: 1, y: cy - 10, duration: th.duration.normal, ease: th.ease.overshoot })
    scene.time.delayedCall(Math.max(0, duration - 300), () =>
      scene.tweens.add({
        targets: container, alpha: 0, y: cy - 30,
        duration: 300, ease: th.ease.in,
        onComplete: () => container.destroy(),
      })
    )
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Foundation V3 — options-based primitives. These default to the portrait
  // `text` scale, which is the design target for new prototypes.
  // ───────────────────────────────────────────────────────────────────────────

  createButton(opts: ButtonOptions): ButtonHandle {
    const scene = this.scene
    const w = opts.width ?? T.button.width
    const h = opts.height ?? T.button.height
    const radius = opts.radius ?? T.radius.md
    const base = opts.color ?? Phaser.Display.Color.HexStringToColor(T.color.primary).color
    const useShadow = opts.shadow ?? true

    const children: Phaser.GameObjects.GameObject[] = []

    let shadowGfx: Phaser.GameObjects.Graphics | undefined
    if (useShadow) {
      shadowGfx = scene.add.graphics()
      drawShadow(shadowGfx, 0, 0, w, h, { radius }, this.theme)
      children.push(shadowGfx)
    }

    const bg = scene.add.graphics()
    children.push(bg)

    const txt = scene.add.text(0, 0, opts.text, {
      color: opts.textColor ?? T.color.text,
      ...this.textStyle(opts.textScale ?? 'body', opts.landscape ?? false),
    }).setOrigin(0.5)
    children.push(txt)

    const minTouch = opts.minTouch ?? T.button.minTouch
    const zone = scene.add
      .zone(0, 0, Math.max(w, minTouch), Math.max(h, minTouch))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    children.push(zone)

    const container = scene.add.container(opts.x, opts.y, children)

    let state: ButtonState = opts.state ?? 'normal'
    let pointerHeld = false

    const th = this.theme

    const redraw = (): void => {
      bg.clear()
      switch (state) {
        case 'pressed':
          // Sheen is suppressed while held: a lit top edge on a pressed button
          // reads as "still raised" and fights the scale-down.
          drawRoundedCard(bg, 0, 0, w, h,
            { fill: shade(base, -0.10), radius, highlight: 0, bevel: 0 }, th)
          break
        case 'disabled':
          drawRoundedCard(bg, 0, 0, w, h,
            { fill: base, fillAlpha: 0.35, radius, highlight: 0, bevel: 0 }, th)
          break
        case 'selected': {
          const sel = opts.selectedColor ?? shade(base, 0.06)
          drawRoundedCard(bg, 0, 0, w, h, {
            fill: sel, radius,
            stroke: shade(sel, 0.28), strokeWidth: th.stroke.base,
          }, th)
          break
        }
        default:
          drawRoundedCard(bg, 0, 0, w, h, { fill: base, radius }, th)
      }
      txt.setColor(
        state === 'selected' && opts.selectedTextColor
          ? opts.selectedTextColor
          : (opts.textColor ?? T.color.text),
      )
      txt.setAlpha(state === 'disabled' ? 0.5 : 1)
      if (shadowGfx) shadowGfx.setAlpha(state === 'disabled' ? 0.4 : 1)
    }

    // Press sinks the button toward its shadow; release overshoots back. Both
    // are tweened — an instant scale snap is what makes a button feel like a
    // debug rectangle even when the hit handling is correct.
    const applyScale = (to: number, duration: number, ease: string): void => {
      scene.tweens.killTweensOf(container)
      scene.tweens.add({ targets: container, scaleX: to, scaleY: to, duration, ease })
    }

    const setState = (next: ButtonState): void => {
      const wasPressed = state === 'pressed'
      state = next
      redraw()
      if (next === 'pressed') {
        applyScale(0.95, th.duration.micro, th.ease.out)
        if (shadowGfx) shadowGfx.setAlpha(0.5)
      } else if (wasPressed) {
        applyScale(1, th.duration.fast, th.ease.overshoot)
      } else {
        container.setScale(1)
      }
    }

    // Any exit path must clear `pointerHeld`, or the button sticks in `pressed`.
    const cancelPress = (): void => {
      if (!pointerHeld) return
      pointerHeld = false
      if (state === 'pressed') setState('normal')
    }

    zone.on('pointerdown', () => {
      if (state === 'disabled') return
      pointerHeld = true
      setState('pressed')
    })

    zone.on('pointerup', () => {
      if (state === 'disabled' || !pointerHeld) return
      pointerHeld = false
      setState('normal')
      opts.onPress()
    })

    zone.on('pointerout', cancelPress)
    zone.on('pointerupoutside', cancelPress)

    redraw()

    return {
      container,
      getState: () => state,
      setState,
      setEnabled: (enabled: boolean) => {
        if (enabled) {
          if (state === 'disabled') setState('normal')
          zone.setInteractive({ useHandCursor: true })
        } else {
          pointerHeld = false
          setState('disabled')
          zone.disableInteractive()
        }
      },
      setSelected: (selected: boolean) => {
        if (state === 'disabled') return
        setState(selected ? 'selected' : 'normal')
      },
      setText: (next: string) => txt.setText(next),
      destroy: () => container.destroy(),
    }
  }

  createPanel(opts: PanelOptions): PanelHandle {
    const scene = this.scene
    const { width: w, height: h } = opts
    const radius = opts.radius ?? T.radius.lg
    const fill = opts.fill ?? Phaser.Display.Color.HexStringToColor(T.color.surface).color
    const stroke = opts.stroke ?? Phaser.Display.Color.HexStringToColor(T.color.border).color
    const strokeWidth = opts.strokeWidth ?? 2

    const children: Phaser.GameObjects.GameObject[] = []

    if (opts.shadow ?? true) {
      const shadowGfx = scene.add.graphics()
      drawShadow(shadowGfx, 0, 0, w, h, { radius, ...this.theme.shadows.floating }, this.theme)
      children.push(shadowGfx)
    }

    const bg = scene.add.graphics()
    drawRoundedCard(bg, 0, 0, w, h, { fill, radius, stroke, strokeWidth, inset: true }, this.theme)
    children.push(bg)

    let titleText: Phaser.GameObjects.Text | undefined
    if (opts.title !== undefined) {
      titleText = scene.add.text(0, -h / 2 + T.panel.padding, opts.title, {
        color: opts.titleColor ?? T.color.text,
        ...this.textStyle(opts.titleScale ?? 'heading', opts.landscape ?? false),
      }).setOrigin(0.5, 0)
      children.push(titleText)
    }

    const container = scene.add.container(opts.x, opts.y, children)

    return {
      container,
      setTitle: (text: string) => {
        if (titleText) {
          titleText.setText(text)
          return
        }
        titleText = scene.add.text(0, -h / 2 + T.panel.padding, text, {
          color: opts.titleColor ?? T.color.text,
          ...this.textStyle(opts.titleScale ?? 'heading', opts.landscape ?? false),
        }).setOrigin(0.5, 0)
        container.add(titleText)
      },
      destroy: () => container.destroy(),
    }
  }

  createLabel(opts: LabelOptions): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      color: opts.color ?? T.color.text,
      ...this.textStyle(opts.textScale ?? 'body', opts.landscape ?? false),
    }

    if (opts.align) style.align = opts.align
    if (opts.wordWrapWidth) style.wordWrap = { width: opts.wordWrapWidth }
    if (opts.fontSize) style.fontSize = opts.fontSize

    if (opts.outline) {
      style.stroke = opts.outline.color
      style.strokeThickness = opts.outline.thickness
    }

    if (opts.shadow) {
      style.shadow = {
        offsetX: T.shadow.offsetX,
        offsetY: T.shadow.offsetY,
        color: '#000000',
        blur: 4,
        fill: true,
      }
    }

    const txt = this.scene.add.text(opts.x, opts.y, opts.text, style)

    const ox = opts.originX ?? (opts.align === 'left' ? 0 : opts.align === 'right' ? 1 : 0.5)
    const oy = opts.originY ?? 0.5
    return txt.setOrigin(ox, oy)
  }

  createProgressBar(opts: ProgressBarOptions): ProgressBarHandle {
    const scene = this.scene
    const w = opts.width
    const h = opts.height ?? 24
    const radius = opts.radius ?? h / 2
    const bgColor = opts.bgColor ?? 0x333344
    const fillColor = opts.fillColor ?? Phaser.Display.Color.HexStringToColor(T.color.primary).color
    const duration = opts.duration ?? T.duration.normal

    const bg = scene.add.graphics()
    drawRoundedCard(bg, 0, 0, w, h, { fill: bgColor, radius, highlight: 0, bevel: 0.18 }, this.theme)

    const fillGfx = scene.add.graphics()
    const container = scene.add.container(opts.x, opts.y, [bg, fillGfx])

    let value = Phaser.Math.Clamp(opts.value ?? 0, 0, 1)
    let tween: Phaser.Tweens.Tween | undefined

    const paint = (v: number): void => {
      fillGfx.clear()
      const fw = w * v
      if (fw <= 0) return
      // Clamp the corner radius on very short fills so it stays a clean pill.
      const r = Math.min(radius, fw / 2)
      drawRoundedCard(fillGfx, -w / 2 + fw / 2, 0, fw, h, { fill: fillColor, radius: r }, this.theme)
    }

    paint(value)

    return {
      container,
      getValue: () => value,
      setValue: (next: number, animate = true) => {
        const target = Phaser.Math.Clamp(next, 0, 1)
        tween?.remove()
        tween = undefined

        if (!animate) {
          value = target
          paint(value)
          return
        }

        const proxy = { v: value }
        tween = scene.tweens.add({
          targets: proxy,
          v: target,
          duration,
          ease: 'Quad.Out',
          onUpdate: () => {
            value = proxy.v
            paint(value)
          },
          onComplete: () => {
            value = target
            paint(value)
            tween = undefined
          },
        })
      },
      destroy: () => {
        tween?.remove()
        container.destroy()
      },
    }
  }

  createIcon(opts: IconOptions): IconHandle {
    const scene = this.scene
    const size = opts.size ?? 64
    const children: Phaser.GameObjects.GameObject[] = []

    if (opts.background !== undefined) {
      const chip = scene.add.graphics()
      drawRoundedCard(chip, 0, 0, size * 1.6, size * 1.6, {
        fill: opts.background,
        fillAlpha: opts.backgroundAlpha ?? 1,
        radius: opts.radius ?? T.radius.pill,
      }, this.theme)
      children.push(chip)
    }

    if (opts.draw) {
      const g = scene.add.graphics()
      opts.draw(g, size)
      children.push(g)
    } else if (opts.glyph !== undefined) {
      const glyph = scene.add.text(0, 0, opts.glyph, {
        color: opts.color ?? T.color.text,
        fontSize: `${size}px`,
      }).setOrigin(0.5)
      children.push(glyph)
    }

    let zone: Phaser.GameObjects.Zone | undefined
    if (opts.onPress) {
      const minTouch = opts.minTouch ?? T.button.minTouch
      const hit = Math.max(size * 1.6, minTouch)
      zone = scene.add.zone(0, 0, hit, hit).setOrigin(0.5).setInteractive({ useHandCursor: true })
      children.push(zone)
    }

    const container = scene.add.container(opts.x, opts.y, children)

    if (zone && opts.onPress) {
      const onPress = opts.onPress
      let held = false
      const release = (): void => {
        held = false
        container.setScale(1)
      }
      zone.on('pointerdown', () => { held = true; container.setScale(0.9) })
      zone.on('pointerup', () => {
        if (!held) return
        release()
        onPress()
      })
      zone.on('pointerout', release)
      zone.on('pointerupoutside', release)
    }

    return {
      container,
      setEnabled: (enabled: boolean) => {
        container.setAlpha(enabled ? 1 : 0.4)
        if (!zone) return
        if (enabled) zone.setInteractive({ useHandCursor: true })
        else zone.disableInteractive()
      },
      destroy: () => container.destroy(),
    }
  }

  /**
   * Pill-shaped chip for counters, statuses and category tags. Sizes itself to
   * its text, so `setText` reflows the pill rather than overflowing it.
   */
  createBadge(opts: BadgeOptions): BadgeHandle {
    const scene = this.scene
    const th = this.theme
    const padX = opts.paddingX ?? 22
    let color = opts.color ?? th.colors.surfaceAlt

    const txt = scene.add.text(0, 0, opts.text, {
      color: opts.textColor ?? hex(th.colors.text),
      ...this.textStyle(opts.textScale ?? 'small', opts.landscape ?? false),
    }).setOrigin(0.5)

    const bg = scene.add.graphics()
    const container = scene.add.container(opts.x, opts.y, [bg, txt])

    const paint = (): void => {
      const h = opts.height ?? txt.height + 16
      const w = txt.width + padX * 2
      bg.clear()
      if (opts.shadow ?? false) drawShadow(bg, 0, 0, w, h, { radius: h / 2 }, th)
      drawPill(bg, 0, 0, w, h, { fill: color }, th)
    }
    paint()

    return {
      container,
      setText: (next: string) => { txt.setText(next); paint() },
      setColor: (next: number) => { color = next; paint() },
      destroy: () => container.destroy(),
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Resolves a text scale to a Phaser text style.
   * `landscape` selects the V2 `typography` ramp; the default is the portrait
   * `text` ramp used by V3 prototypes.
   */
  private textStyle(scale: TextScale, landscape: boolean): Phaser.Types.GameObjects.Text.TextStyle {
    const entry = (landscape ? T.typography : T.text)[scale] as { fontSize: string; fontStyle?: string }
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: this.theme.fontFamily,
      fontSize: entry.fontSize,
    }
    if (entry.fontStyle) style.fontStyle = entry.fontStyle
    return style
  }
}
