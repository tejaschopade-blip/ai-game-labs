// Arrows — scene wiring.
//
// THE ONE IDEA
//   Tap an arrow. If nothing stands between it and the edge it points at, it
//   flies off the board. That is the entire game, and the entire challenge is
//   seeing which arrow that is.
//
// WHAT THIS FILE OWNS
//   Level flow, layout, HUD, panels, and the loop
//
//       input  →  ArrowsLogic.tap  →  ArrowsEvents  →  ArrowsView
//
//   Every rule lives in ArrowsLogic. Every colour, radius and duration lives in
//   ArrowsTheme. Every pixel of the board lives in ArrowsView. This file makes
//   no visual decisions beyond where things sit.
//
// WHY THE INDIRECTION IS WORTH IT AT THIS SIZE
//   The logic returns a TapResult — a statement about rules. The view consumes
//   an ArrowsEvent — a statement about what the player should see. Keeping the
//   translation in its own pure file (ArrowsEvents) is what lets the art be
//   replaced wholesale without reopening the rules, which is the point of the
//   exercise.

import Phaser from 'phaser'

import { applyPrototypeConfig } from '../../src/core/PrototypeConfig'
import { fadeIn, transitionTo } from '../../src/systems/Transitions'
import { DebugOverlay } from '../../src/ui/DebugOverlay'
import type { BadgeHandle, ButtonHandle, DotsHandle, PanelHandle } from '../../src/ui/UIFactory'
import { createPresentation, hex, type Presentation, type Theme } from '../../src/presentation'

import { LEVELS } from './ArrowsLevels'
import { arrowById, legalArrows, parseLevel, rules, tap } from './ArrowsLogic'
import type { Board } from './ArrowsTypes'
import { focusEvent, tapEvents, type ArrowsEvent } from './ArrowsEvents'
import { ACCENT, GROUND, MOTION, STATUS, arrowsTheme } from './ArrowsTheme'
import { ArrowsView } from './ArrowsView'
import type { BoardGeometry } from './ArrowsVisuals'

/** Board sizing at the 1080-wide portrait reference. */
const BOARD = {
  /** Space either side of the tray. */
  marginX: 88,
  /** Largest a cell is allowed to get, so a 4x4 level does not become a mural. */
  maxCell: 196,
} as const

export class ArrowsScene extends Phaser.Scene {
  private overlay!: DebugOverlay
  private p!: Presentation
  private t!: Theme

  private board!: Board
  private levelIndex = 0
  private geo!: BoardGeometry
  private view!: ArrowsView

  // HUD
  private levelPill?: BadgeHandle
  private leftPill?: BadgeHandle
  private titleText?: Phaser.GameObjects.Text
  private teachText?: Phaser.GameObjects.Text
  private dots?: DotsHandle
  private buttons: ButtonHandle[] = []

  // Panel
  private panel?: PanelHandle
  private panelParts: Phaser.GameObjects.GameObject[] = []
  private panelButtons: ButtonHandle[] = []

  /** True while a panel is up or a level is loading — input is ignored. */
  private busy = false
  private runToken = 0

  constructor() { super({ key: 'ArrowsScene' }) }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    // New prototypes are portrait 1080x1920. Declare it FIRST — the
    // presentation layer scales its geometry to the current design space.
    applyPrototypeConfig(this, {
      name: '012-arrows', sceneKey: 'ArrowsScene', orientation: 'portrait',
    })

    this.t = arrowsTheme()
    this.p = createPresentation(this, {
      theme: this.t,
      // A pool of light under the tray, so the board reads as sitting on the
      // page rather than printed on it.
      background: { preset: 'paper', vignette: 0.16, light: 0.42, lightY: 0.52 },
      sounds: {
        select: 'sfx_select', collect: 'sfx_swoosh', fail: 'sfx_bump',
        move: 'sfx_slide', complete: 'sfx_win',
      },
    })
    this.t = this.p.theme

    this.view = new ArrowsView(this, this.p, {
      onHold: id => this.onHold(id),
      onTap: id => this.onTap(id),
      onRelease: () => this.view.play({ type: 'FOCUS_CLEARED' }),
    })

    this.buildHud()

    this.overlay = new DebugOverlay(this, '012-arrows')
    this.overlay.addWatch('Level', () => `${this.levelIndex + 1}/${LEVELS.length}`)
    this.overlay.addWatch('Arrows', () => String(this.board?.arrows.length ?? 0))
    this.overlay.addWatch('Legal', () => String(this.board ? legalArrows(this.board).length : 0))
    this.overlay.addWatch('Blocked tap', () => rules.blockedTap)
    this.bindDebugKeys()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.destroy())

    this.loadLevel(0)
    fadeIn(this)
  }

  update(): void {
    this.overlay.update()
  }

  /**
   * Development keys only — the game is touch-first and every one of these has
   * an on-screen equivalent except the rule toggle, which is the experiment
   * dial and deliberately not exposed to players.
   */
  private bindDebugKeys(): void {
    const kb = this.input.keyboard
    if (!kb) return
    kb.on('keydown-N', () => this.loadLevel((this.levelIndex + 1) % LEVELS.length))
    kb.on('keydown-P', () => this.loadLevel((this.levelIndex + LEVELS.length - 1) % LEVELS.length))
    kb.on('keydown-T', () => {
      rules.blockedTap = rules.blockedTap === 'reject' ? 'nudge' : 'reject'
      this.p.ui.toast(`Blocked tap: ${rules.blockedTap}`)
      this.loadLevel(this.levelIndex)
    })
  }

  // ── Level flow ──────────────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    this.runToken++
    this.dismissPanel()
    this.busy = false
    this.levelIndex = index

    const level = LEVELS[index]
    this.board = parseLevel(level)
    this.geo = this.computeGeometry(this.board)

    this.view.build(this.board, this.geo)
    this.view.play({ type: 'BOARD_BUILT', board: this.board })

    this.levelPill?.setText(`LEVEL ${String(level.id).padStart(2, '0')}`)
    this.titleText?.setText(level.name)
    this.teachText?.setText(level.teaches)
    this.dots?.setActive(index)
    this.setRemaining(this.board.arrows.length, false)

    if (this.titleText) this.p.anim.slideIn(this.titleText, 'top', 24)
    if (this.teachText) this.p.anim.fadeIn(this.teachText)
  }

  /**
   * Fits the tray into the space between the header and the footer.
   *
   * Cell size is driven by whichever axis runs out first and then capped, so a
   * 4x4 tutorial board and a 7x7 knot are the same object at different scales
   * rather than two differently proportioned screens.
   */
  private computeGeometry(board: Board): BoardGeometry {
    const L = this.p.layout
    const top = L.safeTop(this.p.px(330))
    const bottom = L.safeBottom(this.p.px(-300))
    const availW = L.width - this.p.px(BOARD.marginX) * 2
    const availH = bottom - top

    // The tray is wider than its field by one lip on each side (see drawTray),
    // so fitting `cols * cell` into the space puts the frame off the screen
    // edge. Fit the tray.
    const LIP = 0.34 * 2
    const cell = Math.min(
      availW / (board.cols + LIP),
      availH / (board.rows + LIP),
      this.p.px(BOARD.maxCell),
    )

    const boardW = cell * board.cols
    const boardH = cell * board.rows
    return {
      cols: board.cols,
      rows: board.rows,
      cell,
      originX: L.width / 2 - boardW / 2 + cell / 2,
      originY: top + availH / 2 - boardH / 2 + cell / 2,
    }
  }

  // ── Input → logic → events → presentation ───────────────────────────────────

  private onHold(id: string): void {
    if (this.busy) return
    const arrow = arrowById(this.board, id)
    if (!arrow) return
    this.p.juice.play('select')
    this.view.play(focusEvent(this.board, arrow))
  }

  private onTap(id: string): void {
    if (this.busy) return

    // The logic is the only thing that decides what happened. Note that `tap`
    // never mutates: `next` is a new board, so the view can animate away from
    // the old one without racing state.
    const { next, result } = tap(this.board, id)
    this.board = next

    for (const ev of tapEvents(result, next)) this.apply(ev)
  }

  /**
   * The single place an event becomes something the player perceives. The view
   * takes every event; the scene additionally reacts to the two that are about
   * the session rather than the board.
   */
  private apply(ev: ArrowsEvent): void {
    this.view.play(ev)

    switch (ev.type) {
      case 'BOARD_CHANGED':
        this.setRemaining(ev.remaining, true)
        break
      case 'LEVEL_COMPLETE':
        this.finishLevel()
        break
      case 'LEVEL_STUCK':
        this.showStuck()
        break
      default:
        break
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  private buildHud(): void {
    const L = this.p.layout
    const cx = L.width / 2

    this.levelPill = this.p.ui.createBadge({
      x: L.safeLeft(this.p.px(120)),
      y: L.safeTop(this.p.px(64)),
      text: 'LEVEL 01',
      color: this.t.colors.secondary,
      textColor: '#ffffff',
    })

    this.leftPill = this.p.ui.createBadge({
      x: L.safeRight(this.p.px(-120)),
      y: L.safeTop(this.p.px(64)),
      text: '0 LEFT',
      color: ACCENT,
      textColor: hex(GROUND.ink),
    })

    this.titleText = this.add.text(cx, L.safeTop(this.p.px(168)), '', this.p.text('heading'))
      .setOrigin(0.5)

    this.teachText = this.add.text(
      cx, L.safeTop(this.p.px(238)), '',
      { ...this.p.text('caption', this.t.colors.muted), align: 'center' },
    ).setOrigin(0.5).setWordWrapWidth(this.p.px(880))

    this.dots = this.p.ui.createDots({
      x: cx,
      y: L.safeBottom(this.p.px(-238)),
      count: LEVELS.length,
      active: 0,
      size: this.p.px(20),
      gap: this.p.px(30),
      color: ACCENT,
      emptyColor: 0xcfc2ab,
    })

    const btnY = L.safeBottom(this.p.px(-120))
    const btnW = this.p.px(330)
    this.buttons.push(this.p.ui.createButton({
      x: cx - this.p.px(180), y: btnY, width: btnW, text: 'MENU',
      color: this.t.colors.secondary,
      onPress: () => transitionTo(this, 'GameSelectScene'),
    }))
    this.buttons.push(this.p.ui.createButton({
      x: cx + this.p.px(180), y: btnY, width: btnW, text: 'RESTART',
      color: ACCENT, textColor: hex(GROUND.ink),
      onPress: () => { this.p.juice.play('click'); this.loadLevel(this.levelIndex) },
    }))
  }

  /** The counter is the only number on screen, so it is allowed to react. */
  private setRemaining(n: number, animate: boolean): void {
    if (!this.leftPill) return
    this.leftPill.setText(`${n} LEFT`)
    this.leftPill.setColor(n === 0 ? STATUS.ok : ACCENT)
    if (animate) this.p.anim.punch(this.leftPill.container, 1.14)
  }

  // ── Panels ──────────────────────────────────────────────────────────────────

  private finishLevel(): void {
    this.busy = true
    this.view.setInputEnabled(false)
    const token = this.runToken
    const last = this.levelIndex === LEVELS.length - 1

    this.p.juice.levelComplete()
    this.dots?.setActive(this.levelIndex + 1)

    this.time.delayedCall(MOTION.settle, () => {
      if (token !== this.runToken) return
      this.showPanel(
        last ? 'All ten cleared' : 'Board clear',
        last
          ? 'Every level solved. The order never mattered — that is the finding.'
          : LEVELS[this.levelIndex + 1].teaches,
        last
          ? [{ text: 'PLAY AGAIN', primary: true, onPress: () => this.loadLevel(0) },
             { text: 'MENU', primary: false, onPress: () => transitionTo(this, 'GameSelectScene') }]
          : [{ text: 'NEXT LEVEL', primary: true, onPress: () => this.loadLevel(this.levelIndex + 1) }],
      )
    })
  }

  /**
   * Only reachable with `rules.blockedTap === 'nudge'`. Under the default rule
   * the mechanic is confluent and a board can never dead-end, which is the
   * prototype's headline finding — so this panel existing at all is the
   * evidence that the alternative rule is worse.
   */
  private showStuck(): void {
    this.busy = true
    this.view.setInputEnabled(false)
    this.p.juice.play('fail')
    this.p.vfx.screenShake(4, 200)
    this.time.delayedCall(MOTION.settle, () => {
      this.showPanel(
        'Nothing can move',
        'Every remaining arrow is blocked. Nudge mode lets a tap make things worse.',
        [{ text: 'RESTART', primary: true, onPress: () => this.loadLevel(this.levelIndex) }],
      )
    })
  }

  private showPanel(
    title: string, body: string,
    actions: Array<{ text: string; primary: boolean; onPress: () => void }>,
  ): void {
    this.dismissPanel()
    const L = this.p.layout
    const cx = L.width / 2
    const cy = L.height / 2
    const w = this.p.px(860)
    const h = this.p.px(actions.length > 1 ? 620 : 520)

    this.panel = this.p.ui.createPanel({ x: cx, y: cy, width: w, height: h, title })

    const bodyText = this.add.text(
      cx, cy - this.p.px(30), body,
      { ...this.p.text('body', this.t.colors.muted), align: 'center' },
    ).setOrigin(0.5).setWordWrapWidth(w - this.p.px(120)).setDepth(1001)
    this.panelParts.push(bodyText)

    actions.forEach((a, i) => {
      const y = cy + this.p.px(120) + i * this.p.px(140)
      const btn = this.p.ui.createButton({
        x: cx, y, width: this.p.px(520), text: a.text,
        color: a.primary ? ACCENT : this.t.colors.secondary,
        textColor: a.primary ? hex(GROUND.ink) : '#ffffff',
        onPress: () => { this.p.juice.play('click'); a.onPress() },
      })
      btn.container.setDepth(1002)
      this.panelButtons.push(btn)
    })

    this.p.anim.pop(this.panel.container)
    this.p.anim.stagger([bodyText, ...this.panelButtons.map(b => b.container)], 60)
  }

  private dismissPanel(): void {
    this.panel?.destroy()
    this.panel = undefined
    this.panelButtons.forEach(b => b.destroy())
    this.panelButtons = []
    this.panelParts.forEach(o => o.destroy())
    this.panelParts = []
    this.view?.setInputEnabled(true)
  }
}
