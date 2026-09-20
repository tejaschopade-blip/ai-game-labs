import Phaser from 'phaser'
import { applyMenuDesign } from '../core/PrototypeConfig'
import {
  createPresentation, Presentation,
  drawRoundedCard, drawShadow, bakeGraphics, hex, shade, mix,
} from '../presentation'

interface ProtoEntry {
  key: string
  number: string
  name: string
  description: string
  color: number
}

const PROTOTYPES: ProtoEntry[] = [
  {
    key: 'FoundationTestScene',
    number: '001',
    name: 'Foundation Test',
    description: 'Top-down movement playground — tests core input and physics',
    color: 0x4488ff,
  },
  {
    key: 'RotationWorldScene',
    number: '002',
    name: 'Rotation World',
    description: 'Each step rotates the world 90° — find your way to the goal',
    color: 0x44ccaa,
  },
  {
    key: 'LaserMirrorScene',
    number: '003',
    name: 'Laser Mirrors',
    description: 'Click mirrors to redirect the beam — 5 handcrafted levels',
    color: 0xff4444,
  },
  {
    key: 'TimeEchoScene',
    number: '004',
    name: 'Time Echo',
    description: 'Record your moves, cooperate with your past self',
    color: 0xaa44ff,
  },
  {
    key: 'ChainReactionScene',
    number: '005',
    name: 'Chain Reaction',
    description: 'Tap one circle and trigger a cascading chain reaction',
    color: 0xff8844,
  },
  {
    key: 'StealPropertiesScene',
    number: '006',
    name: 'Steal Properties',
    description: 'Touch objects to steal their property — gain new capabilities',
    color: 0xff4422,
  },
  {
    key: 'SokobanScene',
    number: '007',
    name: 'Sokoban DNA',
    description: 'Push boxes to goals — never pull. One mechanic, five puzzles.',
    color: 0xffaa44,
  },
  {
    key: 'BlockPlacementScene',
    number: '008',
    name: 'Block Placement',
    description: 'Choose shapes, fill rows and columns, clear lines',
    color: 0x44ccaa,
  },
  {
    key: 'SortLabScene',
    number: '009',
    name: 'Sort Lab',
    description: 'Five sorting rules — which creates the most interesting decisions?',
    color: 0x44ffaa,
  },
  {
    key: 'CozyMazeScene',
    number: '010',
    name: 'Cozy Maze',
    description: 'A living garden maze — find the key, open the gate, escape',
    color: 0x7ad4a0,
  },
  {
    key: 'LoopSortScene',
    number: '011',
    name: 'Loop Sort',
    description: 'The belt never stops — time your batch so three colours meet',
    color: 0xffb454,
  },
  {
    key: 'ArrowsScene',
    number: '012',
    name: 'Arrows',
    description: 'Tap an arrow with a clear run to the edge — it flies off the board',
    color: 0xff7a5c,
  },
]

export class GameSelectScene extends Phaser.Scene {
  private p!: Presentation

  constructor() { super({ key: 'GameSelectScene' }) }

  create(): void {
    // The game size persists across scene transitions, so this also resets the
    // size a portrait prototype left behind on ESC. On a phone it picks a
    // portrait design space instead of letterboxing 960x540 into a strip.
    applyMenuDesign(this)

    // The menu is the first thing anyone sees, so it uses the same presentation
    // layer the prototypes do. Its own background is drawn below with
    // scrollFactor 0 rather than via the preset, because this scene scrolls its
    // camera and a world-space background would scroll with the list.
    this.p = createPresentation(this)
    const t = this.p.theme

    const W = this.scale.width
    const H = this.scale.height

    // Every metric below is authored against the 1080 reference and scaled by
    // the design space's short edge, exactly like the typography ramp. At
    // landscape 960x540 `u` is 0.5 and these resolve to the original numbers;
    // in portrait they resolve to twice that, which is what makes the cards
    // thumb-sized on a phone instead of 28px tall.
    const k = Math.max(0.3, Math.min(W, H) / 1080)
    const u = (n: number): number => Math.round(n * k)

    // Prototypes 001-010 were authored for landscape 960x540 and are never
    // retrofitted (docs/ai-rules.md rule 13), so on a phone they letterbox to a
    // strip. The menu says so rather than letting the player find out.
    const portrait = H > W

    const cardW   = Math.min(u(960), W - u(80))
    const cardH   = u(146)
    const cardGap = u(24)
    const topPad  = portrait ? u(238) : u(180)   // below fixed header
    const botPad  = u(152)                       // clears the fixed footer + its fade

    // When the whole list fits — which it now does on a phone — centre it in
    // the space between header and footer instead of leaving a hole at the
    // bottom.
    const listH = PROTOTYPES.length * (cardH + cardGap) - cardGap
    const slack = Math.max(0, (H - topPad - botPad) - listH)
    const startY = topPad + slack / 2

    const contentH = startY + listH + botPad
    const maxScroll = Math.max(0, contentH - H)
    const cam = this.cameras.main
    cam.setBounds(0, 0, W, Math.max(H, contentH))

    // ── Fixed background ─────────────────────────────────────────────────────
    const bgTop = shade(t.colors.background, -0.02)
    const bg = this.add.graphics().setScrollFactor(0).setDepth(0)
    bg.fillGradientStyle(bgTop, bgTop, t.colors.background, t.colors.background, 1, 1, 1, 1)
    bg.fillRect(0, 0, W, H)
    // Edge darkening — the same vignette trick the prototypes get from the
    // background presets, inlined here because this scene owns its own fill.
    bg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.3, 0, 0.3, 0)
    bg.fillRect(0, 0, W * 0.3, H)
    bg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.3, 0, 0.3)
    bg.fillRect(W * 0.7, 0, W * 0.3, H)

    // ── Fixed header ─────────────────────────────────────────────────────────
    // Opaque band, then a short gradient tail. Without the opaque part the
    // list scrolls straight through the title.
    const headBand = this.add.graphics().setScrollFactor(0).setDepth(95)
    headBand.fillStyle(bgTop, 1)
    const bandH = portrait ? u(210) : u(152)
    headBand.fillRect(0, 0, W, bandH)
    headBand.fillGradientStyle(bgTop, bgTop, bgTop, bgTop, 1, 1, 0, 0)
    headBand.fillRect(0, bandH, W, u(52))

    this.add.text(W / 2, u(68), 'AI GAME LAB', this.p.text('subheading', t.colors.text))
      .setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.add.text(W / 2, u(124), 'Select a prototype', this.p.text('caption', t.colors.muted))
      .setOrigin(0.5).setScrollFactor(0).setDepth(100)

    if (portrait) {
      this.add.text(
        W / 2, u(186),
        '001\u2013010 are landscape \u2014 rotate your phone for those',
        {
          ...this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.4)),
          align: 'center',
          wordWrap: { width: W - u(120) },
        },
      ).setOrigin(0.5).setScrollFactor(0).setDepth(100)
    }

    // ── Scrollable cards ──────────────────────────────────────────────────────
    PROTOTYPES.forEach((proto, i) => {
      const cy = startY + i * (cardH + cardGap) + cardH / 2

      // Both card states are baked once. Eleven live Graphics, each spending
      // seven path fills on shadow + sheen + bevel, re-tessellate on the CPU
      // every frame and cost this scene more than half its frame rate.
      const bakePad = u(48)
      const bakeCard = (hovered: boolean): Phaser.GameObjects.Image =>
        bakeGraphics(this, cardW + bakePad * 2, cardH + bakePad * 2, (g, bw, bh) => {
          drawShadow(g, bw / 2, bh / 2, cardW, cardH, { radius: t.radius.md }, t)
          drawRoundedCard(g, bw / 2, bh / 2, cardW, cardH, {
            fill: hovered ? mix(t.colors.surface, proto.color, 0.12) : t.colors.surface,
            radius: t.radius.md,
            stroke: hovered ? proto.color : t.colors.border,
            strokeWidth: t.stroke.thin,
            strokeAlpha: hovered ? 0.9 : 0.5,
          }, t)
          // Accent stripe, clipped to the card's left corners.
          g.fillStyle(proto.color, 1)
          g.fillRoundedRect(bw / 2 - cardW / 2, bh / 2 - cardH / 2, u(10), cardH, {
            tl: t.radius.md, tr: 0, bl: t.radius.md, br: 0,
          })
        })

      const idleImg  = bakeCard(false)
      const hoverImg = bakeCard(true).setVisible(false)
      const paint = (hovered: boolean): void => {
        idleImg.setVisible(!hovered)
        hoverImg.setVisible(hovered)
      }

      const num = this.add.text(-cardW / 2 + u(52), -u(30), proto.number,
        this.p.text('caption', proto.color)).setOrigin(0, 0.5)
      const name = this.add.text(-cardW / 2 + u(136), -u(32), proto.name,
        this.p.text('body', t.colors.text)).setOrigin(0, 0.5)
      const desc = this.add.text(-cardW / 2 + u(136), u(28), proto.description, {
        ...this.p.text('caption', t.colors.muted),
        wordWrap: { width: cardW - u(200) },
      }).setOrigin(0, 0.5).setLineSpacing(u(6))
      const chev = this.add.text(cardW / 2 - u(40), -u(4), '\u203a',
        this.p.text('heading', t.colors.border)).setOrigin(0.5)

      const card = this.add.container(W / 2, cy, [idleImg, hoverImg, num, name, desc, chev])
      card.setSize(cardW, cardH)
      card.setInteractive(
        new Phaser.Geom.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH),
        Phaser.Geom.Rectangle.Contains,
      )
      const io = card.input
      if (io) io.cursor = 'pointer'

      card.on('pointerover', () => {
        paint(true)
        chev.setColor(hex(proto.color))
        this.tweens.add({
          targets: card, x: W / 2 + u(8),
          duration: t.duration.fast, ease: t.ease.out,
        })
      })
      card.on('pointerout', () => {
        paint(false)
        chev.setColor(hex(t.colors.border))
        this.tweens.add({
          targets: card, x: W / 2,
          duration: t.duration.fast, ease: t.ease.out,
        })
      })
      card.on('pointerdown', () => {
        if (this._dragging) return
        this.tweens.add({
          targets: card, scaleX: 0.98, scaleY: 0.98,
          duration: t.duration.micro, ease: t.ease.out,
        })
      })
      card.on('pointerup', () => {
        this.tweens.add({
          targets: card, scaleX: 1, scaleY: 1,
          duration: t.duration.fast, ease: t.ease.overshoot,
        })
        if (this._dragging) return  // ignore tap-end after a scroll drag
        cam.fadeOut(200, 0, 0, 0)
        cam.once('camerafadeoutcomplete', () => this.scene.start(proto.key))
      })

      // Staggered entrance, capped so the last card is not a second late.
      card.setAlpha(0)
      this.tweens.add({
        targets: card, alpha: 1,
        duration: t.duration.normal,
        delay: Math.min(i * 35, 320),
        ease: t.ease.out,
      })
    })

    // ── Bottom fade mask (fixed) ──────────────────────────────────────────────
    const b = t.colors.background
    const botMask = this.add.graphics().setScrollFactor(0).setDepth(95)
    botMask.fillGradientStyle(b, b, b, b, 0, 0, 1, 1)
    botMask.fillRect(0, H - u(156), W, u(96))
    botMask.fillStyle(b, 1)
    botMask.fillRect(0, H - u(60), W, u(60))

    // ── Fixed footer ──────────────────────────────────────────────────────────
    const scrollHint = maxScroll > 0 ? 'Scroll / drag to see more  \u00b7  ' : ''
    this.add.text(W / 2, H - u(24), `${scrollHint}ESC from any prototype returns here`,
      this.p.text('caption', mix(t.colors.muted, t.colors.background, 0.45)))
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100)

    // ── Mouse wheel scroll ────────────────────────────────────────────────────
    this.input.on('wheel',
      (_p: unknown, _o: unknown, _dx: number, deltaY: number) => {
        cam.scrollY = Phaser.Math.Clamp(cam.scrollY + deltaY * 0.6 * k * 2, 0, maxScroll)
      },
    )

    // ── Touch / pointer drag scroll ───────────────────────────────────────────
    let dragStartY    = 0
    let dragStartScrollY = 0
    this._dragging = false

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragStartY       = p.y
      dragStartScrollY = cam.scrollY
      this._dragging   = false
    })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return
      const dy = dragStartY - p.y
      if (Math.abs(dy) > u(12)) {
        this._dragging = true
        cam.scrollY = Phaser.Math.Clamp(dragStartScrollY + dy, 0, maxScroll)
      }
    })

    this.input.on('pointerup', () => {
      // reset dragging flag after a short delay so pointerup on cards fires first
      this.time.delayedCall(30, () => { this._dragging = false })
    })

    // ── Keyboard scroll ───────────────────────────────────────────────────────
    const kb = this.input.keyboard!
    kb.on('keydown-DOWN', () => { cam.scrollY = Phaser.Math.Clamp(cam.scrollY + u(120), 0, maxScroll) })
    kb.on('keydown-UP',   () => { cam.scrollY = Phaser.Math.Clamp(cam.scrollY - u(120), 0, maxScroll) })

    cam.fadeIn(300, 0, 0, 0)
  }

  // used across event handlers
  private _dragging = false
}
