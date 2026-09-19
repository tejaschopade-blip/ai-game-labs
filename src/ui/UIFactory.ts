import Phaser from 'phaser'
import { DesignTokens } from '../core/DesignTokens'

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

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Lighten (pct > 0) or darken (pct < 0) a colour. pct is a 0..1 fraction. */
function shade(color: number, pct: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color)
  const f = (v: number) => Phaser.Math.Clamp(Math.round(v + 255 * pct), 0, 255)
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue))
}

/** Draw a rounded box centred on (0,0) into an existing Graphics object. */
function drawBox(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  radius: number,
  fill: number,
  fillAlpha: number,
  stroke?: number,
  strokeWidth = 0,
): void {
  g.clear()
  g.fillStyle(fill, fillAlpha)
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
  if (stroke !== undefined && strokeWidth > 0) {
    g.lineStyle(strokeWidth, stroke, 1)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UIFactory
// ─────────────────────────────────────────────────────────────────────────────

export class UIFactory {
  constructor(private scene: Phaser.Scene) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Foundation V2 — original API. Signatures are preserved exactly; these keep
  // using the landscape `typography` tokens so existing prototypes are unaffected.
  // ───────────────────────────────────────────────────────────────────────────

  label(x: number, y: number, text: string, style?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, text, {
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
    const cx = this.scene.scale.width / 2
    const cy = this.scene.scale.height - 80
    const t = this.scene.add.text(cx, cy, text, {
      color: T.color.text,
      fontSize: T.typography.small.fontSize,
      backgroundColor: '#000000bb',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9000).setAlpha(0)
    this.scene.tweens.add({ targets: t, alpha: 1, duration: 200 })
    this.scene.time.delayedCall(duration - 300, () =>
      this.scene.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() })
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
      shadowGfx.setPosition(T.shadow.offsetX, T.shadow.offsetY)
      drawBox(shadowGfx, w, h, radius, T.shadow.color, T.shadow.alpha)
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

    const redraw = (): void => {
      switch (state) {
        case 'pressed':
          drawBox(bg, w, h, radius, shade(base, -0.08), 1)
          break
        case 'disabled':
          drawBox(bg, w, h, radius, base, 0.35)
          break
        case 'selected':
          drawBox(bg, w, h, radius, shade(base, 0.06), 1, shade(base, 0.35), 4)
          break
        default:
          drawBox(bg, w, h, radius, base, 1)
      }
      txt.setAlpha(state === 'disabled' ? 0.5 : 1)
      if (shadowGfx) shadowGfx.setAlpha(state === 'disabled' ? 0.4 : 1)
      container.setScale(state === 'pressed' ? 0.96 : 1)
    }

    const setState = (next: ButtonState): void => {
      state = next
      redraw()
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
      shadowGfx.setPosition(T.shadow.offsetX, T.shadow.offsetY)
      drawBox(shadowGfx, w, h, radius, T.shadow.color, T.shadow.alpha)
      children.push(shadowGfx)
    }

    const bg = scene.add.graphics()
    drawBox(bg, w, h, radius, fill, 1, stroke, strokeWidth)
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
    drawBox(bg, w, h, radius, bgColor, 1)

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
      fillGfx.fillStyle(fillColor, 1)
      fillGfx.fillRoundedRect(-w / 2, -h / 2, fw, h, r)
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
      drawBox(chip, size * 1.6, size * 1.6, opts.radius ?? T.radius.pill, opts.background, opts.backgroundAlpha ?? 1)
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

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Resolves a text scale to a Phaser text style.
   * `landscape` selects the V2 `typography` ramp; the default is the portrait
   * `text` ramp used by V3 prototypes.
   */
  private textStyle(scale: TextScale, landscape: boolean): Phaser.Types.GameObjects.Text.TextStyle {
    const entry = (landscape ? T.typography : T.text)[scale] as { fontSize: string; fontStyle?: string }
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: entry.fontSize }
    if (entry.fontStyle) style.fontStyle = entry.fontStyle
    return style
  }
}
