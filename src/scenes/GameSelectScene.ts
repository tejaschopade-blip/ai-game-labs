import Phaser from 'phaser'
import { applyLandscapeDesign } from '../core/PrototypeConfig'

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
]

export class GameSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'GameSelectScene' }) }

  create(): void {
    // The game size persists across scene transitions, so a portrait prototype
    // would leave the menu at portrait dimensions on ESC. No-op at 960x540.
    applyLandscapeDesign(this)

    const W = this.scale.width
    const H = this.scale.height
    const cardW  = Math.min(480, W - 40)
    const cardH  = 64
    const cardGap = 12
    const topPad  = 90   // below fixed header
    const botPad  = 48

    const contentH = topPad + PROTOTYPES.length * (cardH + cardGap) - cardGap + botPad
    const maxScroll = Math.max(0, contentH - H)
    const cam = this.cameras.main
    cam.setBounds(0, 0, W, Math.max(H, contentH))

    // ── Fixed background ─────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14)
      .setScrollFactor(0).setDepth(0)

    // ── Fixed header ─────────────────────────────────────────────────────────
    this.add.text(W / 2, 36, 'AI GAME LAB', {
      fontSize: '28px', color: '#aaaacc', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    this.add.text(W / 2, 64, 'Select a prototype', {
      fontSize: '13px', color: '#444466',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    // ── Scrollable cards ──────────────────────────────────────────────────────
    PROTOTYPES.forEach((proto, i) => {
      const cy = topPad + i * (cardH + cardGap) + cardH / 2
      const hexColor = `#${proto.color.toString(16).padStart(6, '0')}`

      const card = this.add.rectangle(W / 2, cy, cardW, cardH, 0x111122)
        .setStrokeStyle(1, 0x222244)
        .setInteractive({ useHandCursor: true })

      this.add.rectangle(W / 2 - cardW / 2 + 3, cy, 4, cardH - 4, proto.color)
        .setOrigin(0.5)

      this.add.text(W / 2 - cardW / 2 + 24, cy - 8, proto.number, {
        fontSize: '11px', color: hexColor, fontStyle: 'bold',
      }).setOrigin(0.5)

      this.add.text(W / 2 - cardW / 2 + 52, cy - 9, proto.name, {
        fontSize: '16px', color: '#ccccee', fontStyle: 'bold',
      }).setOrigin(0, 0.5)

      this.add.text(W / 2 - cardW / 2 + 52, cy + 13, proto.description, {
        fontSize: '11px', color: '#555577',
      }).setOrigin(0, 0.5)

      this.add.text(W / 2 + cardW / 2 - 16, cy, '›', {
        fontSize: '20px', color: '#333355',
      }).setOrigin(0.5)

      card.on('pointerover', () => card.setFillStyle(0x1a1a33).setStrokeStyle(1, proto.color))
      card.on('pointerout',  () => card.setFillStyle(0x111122).setStrokeStyle(1, 0x222244))
      card.on('pointerup',   () => {
        if (this._dragging) return  // ignore tap-end after a scroll drag
        cam.fadeOut(200, 0, 0, 0)
        cam.once('camerafadeoutcomplete', () => this.scene.start(proto.key))
      })
    })

    // ── Top / bottom fade masks (fixed) ───────────────────────────────────────
    const topMask = this.add.graphics().setScrollFactor(0).setDepth(90)
    topMask.fillGradientStyle(0x0a0a14, 0x0a0a14, 0x0a0a14, 0x0a0a14, 1, 1, 0, 0)
    topMask.fillRect(0, 74, W, 20)

    const botMask = this.add.graphics().setScrollFactor(0).setDepth(90)
    botMask.fillGradientStyle(0x0a0a14, 0x0a0a14, 0x0a0a14, 0x0a0a14, 0, 0, 1, 1)
    botMask.fillRect(0, H - 48, W, 48)

    // ── Fixed footer ──────────────────────────────────────────────────────────
    const scrollHint = maxScroll > 0 ? 'Scroll / drag to see more  ·  ' : ''
    this.add.text(W / 2, H - 14, `${scrollHint}ESC from any prototype returns here`, {
      fontSize: '11px', color: '#222244',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100)

    // ── Mouse wheel scroll ────────────────────────────────────────────────────
    this.input.on('wheel',
      (_p: unknown, _o: unknown, _dx: number, deltaY: number) => {
        cam.scrollY = Phaser.Math.Clamp(cam.scrollY + deltaY * 0.6, 0, maxScroll)
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
      if (Math.abs(dy) > 6) {
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
    kb.on('keydown-DOWN', () => { cam.scrollY = Phaser.Math.Clamp(cam.scrollY + 60, 0, maxScroll) })
    kb.on('keydown-UP',   () => { cam.scrollY = Phaser.Math.Clamp(cam.scrollY - 60, 0, maxScroll) })

    cam.fadeIn(300, 0, 0, 0)
  }

  // used across event handlers
  private _dragging = false
}
