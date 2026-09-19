import Phaser from 'phaser'

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
]

export class GameSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'GameSelectScene' }) }

  create(): void {
    const W = this.scale.width
    const H = this.scale.height

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14)

    this.add.text(W / 2, 36, 'AI GAME LAB', {
      fontSize: '28px',
      color: '#aaaacc',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.add.text(W / 2, 66, 'Select a prototype', {
      fontSize: '13px',
      color: '#444466',
    }).setOrigin(0.5)

    const cardW = Math.min(480, W - 40)
    const cardH = 64
    const cardGap = 12
    const totalH = PROTOTYPES.length * (cardH + cardGap) - cardGap
    const startY = Math.max(90, H / 2 - totalH / 2 + 20)

    PROTOTYPES.forEach((proto, i) => {
      const cy = startY + i * (cardH + cardGap) + cardH / 2
      const hexColor = `#${proto.color.toString(16).padStart(6, '0')}`

      const card = this.add.rectangle(W / 2, cy, cardW, cardH, 0x111122)
        .setStrokeStyle(1, 0x222244)
        .setInteractive({ useHandCursor: true })

      // Accent bar
      this.add.rectangle(W / 2 - cardW / 2 + 3, cy, 4, cardH - 4, proto.color)
        .setOrigin(0.5)

      // Number badge
      this.add.text(W / 2 - cardW / 2 + 24, cy - 8, proto.number, {
        fontSize: '11px',
        color: hexColor,
        fontStyle: 'bold',
      }).setOrigin(0.5)

      // Name
      this.add.text(W / 2 - cardW / 2 + 52, cy - 9, proto.name, {
        fontSize: '16px',
        color: '#ccccee',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)

      // Description
      this.add.text(W / 2 - cardW / 2 + 52, cy + 13, proto.description, {
        fontSize: '11px',
        color: '#555577',
      }).setOrigin(0, 0.5)

      // Arrow
      this.add.text(W / 2 + cardW / 2 - 16, cy, '›', {
        fontSize: '20px',
        color: '#333355',
      }).setOrigin(0.5)

      card.on('pointerover', () => {
        card.setFillStyle(0x1a1a33).setStrokeStyle(1, proto.color)
      })
      card.on('pointerout', () => {
        card.setFillStyle(0x111122).setStrokeStyle(1, 0x222244)
      })
      card.on('pointerdown', () => {
        this.cameras.main.fadeOut(200, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(proto.key)
        })
      })
    })

    this.add.text(W / 2, H - 20, 'ESC from any prototype returns here', {
      fontSize: '11px',
      color: '#222244',
    }).setOrigin(0.5)

    this.cameras.main.fadeIn(300, 0, 0, 0)
  }
}
