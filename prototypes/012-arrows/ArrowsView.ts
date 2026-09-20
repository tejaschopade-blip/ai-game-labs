// Arrows — the board presenter.
//
// Consumes ArrowsEvent and produces motion. It is the only file that knows an
// arrow is a rounded tile with a sheen, that a launch has a wind-up, or that a
// blocked tap sparks. Swap this file and the game looks completely different
// with the logic untouched.
//
// WHAT IT OWNS
//   the tray, the wells, one Image per arrow, the transient overlay, and every
//   tween/particle on the board.
//
// WHAT IT DOES NOT OWN
//   rules (ArrowsLogic), the level list, the HUD, panels and level flow
//   (ArrowsScene). It never calls back into the logic — it is handed events.
//
// PERFORMANCE
//   Every piece of art here is baked into a shared texture: one for the tray,
//   one for an empty well, four for the tiles. A 49-arrow board is 50 quads and
//   zero per-frame tessellation. See bakeTexture in src/presentation/Draw.ts.

import Phaser from 'phaser'

import {
  bakeTexture, type Presentation, type PressableHandle,
} from '../../src/presentation'

import { STEP } from './ArrowsTypes'
import type { Arrow, Board, Cell, Dir } from './ArrowsTypes'
import type { ArrowsEvent } from './ArrowsEvents'
import { ARROW_SKIN, MOTION, PREVIEW_FADE, STATUS, TRAY } from './ArrowsTheme'
import {
  cellCenter, drawArrowTile, drawBlockerRing, drawCellWell, drawGateFlash,
  drawRunway, drawTray, gatePoint, type BoardGeometry,
} from './ArrowsVisuals'

const DEPTH = {
  tray:    0,
  well:    1,
  overlay: 2,
  tile:    3,
  flying:  6,
  flash:   7,
} as const

/** Tile edge as a fraction of the cell. The remainder is the gap between tiles. */
const TILE_FILL = 0.88

export interface ArrowsViewCallbacks {
  /** Pointer went down on an arrow — show the preview, do not resolve anything. */
  onHold(id: string): void
  /** Released over the arrow. This is the commit. */
  onTap(id: string): void
  /** Slid off, or the pointer was cancelled. */
  onRelease(): void
}

interface TileView {
  id: string
  dir: Dir
  img: Phaser.GameObjects.Image
  press: PressableHandle
}

export class ArrowsView {
  private geo!: BoardGeometry
  private tray?: Phaser.GameObjects.Image
  private wells: Phaser.GameObjects.Image[] = []
  private tiles = new Map<string, TileView>()
  private overlay!: Phaser.GameObjects.Graphics
  private owned = new Set<string>()
  private inputOn = true
  /** Invalidates in-flight callbacks when the level changes under them. */
  private token = 0

  constructor(
    private scene: Phaser.Scene,
    private p: Presentation,
    private cb: ArrowsViewCallbacks,
  ) {
    this.overlay = scene.add.graphics().setDepth(DEPTH.overlay)
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Builds the board for a level. Safe to call repeatedly. */
  build(board: Board, geo: BoardGeometry): void {
    this.clear()
    this.geo = geo
    this.token++

    const cx = geo.originX + ((geo.cols - 1) * geo.cell) / 2
    const cy = geo.originY + ((geo.rows - 1) * geo.cell) / 2

    const trayKey = this.bake(
      `arrows_tray_${geo.cols}x${geo.rows}_${Math.round(geo.cell)}`,
      geo.cols * geo.cell + geo.cell * 1.4,
      geo.rows * geo.cell + geo.cell * 1.4 + 40,
      (g, w, h) => drawTray(g, w / 2, h / 2 - 14, geo, this.p.theme),
    )
    this.tray = this.scene.add.image(cx, cy + 14, trayKey).setDepth(DEPTH.tray)

    const wellKey = this.bake(
      `arrows_well_${Math.round(geo.cell)}`,
      geo.cell, geo.cell,
      (g, w, h) => drawCellWell(g, w / 2, h / 2, geo.cell * 0.76),
    )
    for (let r = 0; r < geo.rows; r++) {
      for (let c = 0; c < geo.cols; c++) {
        const pt = cellCenter(geo, c, r)
        this.wells.push(this.scene.add.image(pt.x, pt.y, wellKey).setDepth(DEPTH.well))
      }
    }

    for (const a of board.arrows) this.addTile(a)

    // Deal the board in from the outside corner. The stagger is what turns a
    // level load into an event — and it also gives the player two-thirds of a
    // second of pure board before anything is tappable, which is exactly when
    // they read the shapes.
    const order = [...this.tiles.values()]
    order.forEach(t => t.img.setScale(0.4).setAlpha(0))
    order.forEach((t) => {
      const a = this.tiles.get(t.id)!
      const col = Math.round((a.img.x - this.geo.originX) / this.geo.cell)
      const row = Math.round((a.img.y - this.geo.originY) / this.geo.cell)
      this.scene.tweens.add({
        targets: t.img,
        scaleX: 1, scaleY: 1, alpha: 1,
        delay: (col + row) * MOTION.deal,
        duration: this.p.theme.duration.normal,
        ease: this.p.theme.ease.overshoot,
      })
    })
  }

  /** Tears the board down without touching the scene's own furniture. */
  clear(): void {
    this.token++
    for (const t of this.tiles.values()) {
      t.press.destroy()
      this.scene.tweens.killTweensOf(t.img)
      t.img.destroy()
    }
    this.tiles.clear()
    this.wells.forEach(w => w.destroy())
    this.wells = []
    this.tray?.destroy()
    this.tray = undefined
    this.overlay.clear().setAlpha(1)
  }

  destroy(): void {
    this.clear()
    this.overlay.destroy()
    // Textures are sized to the cell, so a differently shaped level must not
    // find a stale one under the same key.
    for (const key of this.owned) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key)
    }
    this.owned.clear()
  }

  setInputEnabled(on: boolean): void {
    this.inputOn = on
    for (const t of this.tiles.values()) t.press.setEnabled(on)
  }

  /** The live tiles, for whole-board effects the scene drives (level complete). */
  tileImages(): Phaser.GameObjects.Image[] {
    return [...this.tiles.values()].map(t => t.img)
  }

  // ── The event handler ───────────────────────────────────────────────────────

  /**
   * One event in, one piece of presentation out. Every case is independent —
   * nothing here reads game state, so events can be replayed, delayed or
   * dropped without the board getting out of step.
   */
  play(ev: ArrowsEvent): void {
    switch (ev.type) {
      case 'ARROW_FOCUSED':  this.showRunway(ev.arrow, ev.path, ev.blockedAt); break
      case 'FOCUS_CLEARED':  this.hideRunway(); break
      case 'ARROW_EXIT':     this.playExit(ev.arrow, ev.path); break
      case 'ARROW_BLOCKED':  this.playBlocked(ev.arrow, ev.blocker); break
      case 'ARROW_NUDGED':   this.playNudge(ev.arrow, ev.to); break
      case 'LEVEL_COMPLETE': this.playTrayPulse(); break
      // BOARD_BUILT and BOARD_CHANGED are the scene's business: the board is
      // rebuilt through build(), and the counter lives in the HUD.
      default: break
    }
  }

  // ── Runway preview ──────────────────────────────────────────────────────────

  /**
   * Drawn on hold, never before. Which arrows are free IS the puzzle, so the
   * board may not advertise it — but the moment a player commits to a tile,
   * showing them the run and, if there is one, the thing standing in it, is how
   * the rule gets taught without a word of text.
   */
  private showRunway(arrow: Arrow, path: Cell[], blockedAt: number): void {
    this.scene.tweens.killTweensOf(this.overlay)
    this.overlay.clear().setAlpha(1)
    const skin = ARROW_SKIN[arrow.dir]
    drawRunway(this.overlay, this.geo, path, arrow.dir, skin.body, blockedAt)

    if (blockedAt >= 0) {
      const b = path[blockedAt]
      const pt = cellCenter(this.geo, b.col, b.row)
      drawBlockerRing(this.overlay, pt.x, pt.y, this.geo.cell * TILE_FILL, STATUS.danger)
    } else {
      // A clear run gets a lit gate at the rim: the exit is already open.
      const pt = gatePoint(this.geo, arrow.col, arrow.row, arrow.dir)
      drawGateFlash(this.overlay, pt.x, pt.y, arrow.dir, this.geo.cell, skin.body)
    }
  }

  private hideRunway(): void {
    this.scene.tweens.killTweensOf(this.overlay)
    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: PREVIEW_FADE,
      ease: this.p.theme.ease.out,
      onComplete: () => this.overlay.clear().setAlpha(1),
    })
  }

  // ── Exit ────────────────────────────────────────────────────────────────────

  /**
   * The payoff animation, and the reason the whole prototype exists:
   *
   *   wind up against the direction of travel  →  launch, stretching along the
   *   axis  →  trail  →  gate flash as it crosses the rim  →  burst outside the
   *   board  →  the vacated well breathes out.
   *
   * The wind-up is 110ms and does more for how the tap feels than anything
   * after it: without anticipation the tile simply teleports away.
   */
  private playExit(arrow: Arrow, path: Cell[]): void {
    const view = this.tiles.get(arrow.id)
    if (!view) return
    this.tiles.delete(arrow.id)
    view.press.destroy()

    const token = this.token
    const { dc, dr } = STEP[arrow.dir]
    const cell = this.geo.cell
    const from = cellCenter(this.geo, arrow.col, arrow.row)
    const horizontal = dc !== 0

    view.img.setDepth(DEPTH.flying)
    this.p.juice.play('collect')

    // The well it is leaving, acknowledged before the tile has gone.
    this.pulseWell(arrow.col, arrow.row, ARROW_SKIN[arrow.dir].body)

    const travel = (path.length + 1.6) * cell
    const flight = MOTION.flight + path.length * 26

    this.scene.tweens.add({
      targets: view.img,
      x: from.x - dc * cell * 0.16,
      y: from.y - dr * cell * 0.16,
      scaleX: horizontal ? 0.9 : 1.08,
      scaleY: horizontal ? 1.08 : 0.9,
      duration: MOTION.wind,
      ease: this.p.theme.ease.out,
      onComplete: () => {
        if (token !== this.token) { view.img.destroy(); return }
        const stopTrail = this.p.vfx.trail(view.img, {
          color: ARROW_SKIN[arrow.dir].body,
          size: cell * 0.1,
          interval: 26,
          depth: DEPTH.flying - 1,
        })

        // The rim crossing, timed to the tween rather than tied to it: the
        // flash belongs to the board, and must still fire if the tile is gone.
        const rimAt = flight * ((path.length + 0.5) / (path.length + 1.6)) * 0.6
        this.scene.time.delayedCall(rimAt, () => {
          if (token !== this.token) return
          this.flashGate(arrow)
        })

        this.scene.tweens.add({
          targets: view.img,
          x: from.x + dc * travel,
          y: from.y + dr * travel,
          scaleX: horizontal ? 1.22 : 0.86,
          scaleY: horizontal ? 0.86 : 1.22,
          alpha: 0.15,
          duration: flight,
          ease: 'Cubic.In',
          onComplete: () => { stopTrail(); view.img.destroy() },
        })
      },
    })
  }

  /** The rim lighting up as something passes through it, plus the spray outside. */
  private flashGate(arrow: Arrow): void {
    const pt = gatePoint(this.geo, arrow.col, arrow.row, arrow.dir)
    const color = ARROW_SKIN[arrow.dir].body
    const g = this.scene.add.graphics().setDepth(DEPTH.flash)
    drawGateFlash(g, pt.x, pt.y, arrow.dir, this.geo.cell * 1.25, 0xffffff)
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.3, scaleY: 1.3,
      duration: 260,
      ease: this.p.theme.ease.out,
      onComplete: () => g.destroy(),
    })

    const { dc, dr } = STEP[arrow.dir]
    this.p.vfx.spark(pt.x + dc * this.geo.cell * 0.2, pt.y + dr * this.geo.cell * 0.2, {
      color, intensity: 'small',
    })
    this.p.vfx.ring(pt.x, pt.y, this.geo.cell * 0.4, { color })
  }

  /** The empty cell breathing out after the tile above it leaves. */
  private pulseWell(col: number, row: number, color: number): void {
    const idx = row * this.geo.cols + col
    const well = this.wells[idx]
    if (!well) return
    this.p.anim.punch(well, 1.12)
    const pt = cellCenter(this.geo, col, row)
    this.p.vfx.ring(pt.x, pt.y, this.geo.cell * 0.34, { color })
  }

  // ── Blocked ─────────────────────────────────────────────────────────────────

  /**
   * A refusal has to teach, not just deny. The tapped arrow lunges at what is
   * in its way and squashes against it; the blocker recoils and is ringed in
   * danger red. Two objects move, so the answer to "why not?" is unmissable
   * even if the player was not looking at the right tile.
   */
  private playBlocked(arrow: Arrow, blocker: Arrow): void {
    const view = this.tiles.get(arrow.id)
    const other = this.tiles.get(blocker.id)
    const cell = this.geo.cell
    const { dc, dr } = STEP[arrow.dir]
    const from = cellCenter(this.geo, arrow.col, arrow.row)
    const hit = cellCenter(this.geo, blocker.col, blocker.row)
    const horizontal = dc !== 0

    this.p.juice.play('fail')

    if (view) {
      this.scene.tweens.killTweensOf(view.img)
      view.img.setPosition(from.x, from.y)
      this.scene.tweens.add({
        targets: view.img,
        x: from.x + dc * cell * 0.17,
        y: from.y + dr * cell * 0.17,
        scaleX: horizontal ? 1.1 : 0.92,
        scaleY: horizontal ? 0.92 : 1.1,
        duration: MOTION.bump,
        ease: 'Quad.Out',
        yoyo: true,
        onYoyo: () => { view.img.setScale(1) },
        onComplete: () => { view.img.setPosition(from.x, from.y).setScale(1) },
      })
    }

    if (other) {
      this.p.anim.wobble(other.img, 6)
      this.scene.tweens.add({
        targets: other.img,
        x: hit.x + dc * cell * 0.06,
        y: hit.y + dr * cell * 0.06,
        duration: MOTION.recoil / 2,
        ease: 'Sine.Out',
        yoyo: true,
        onComplete: () => other.img.setPosition(hit.x, hit.y),
      })
    }

    // Contact point: between the two tiles, not on either of them.
    const cx = (from.x + hit.x) / 2 + dc * cell * 0.18
    const cy = (from.y + hit.y) / 2 + dr * cell * 0.18
    this.p.vfx.spark(cx, cy, { color: STATUS.danger, intensity: 'small' })

    const g = this.scene.add.graphics().setDepth(DEPTH.flash)
    drawBlockerRing(g, hit.x, hit.y, cell * TILE_FILL, STATUS.danger)
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 460,
      delay: 120,
      ease: this.p.theme.ease.out,
      onComplete: () => g.destroy(),
    })

    // Small enough that a player hunting for the free arrow can tap wrong ten
    // times without the screen becoming unpleasant.
    this.p.vfx.screenShake(2, 100)
  }

  // ── Nudge (the alternative rule) ────────────────────────────────────────────

  private playNudge(arrow: Arrow, to: Cell): void {
    const view = this.tiles.get(arrow.id)
    if (!view) return
    const dest = cellCenter(this.geo, to.col, to.row)
    const { dc, dr } = STEP[arrow.dir]
    const horizontal = dc !== 0

    this.p.juice.play('move')
    this.scene.tweens.add({
      targets: view.img,
      x: dest.x,
      y: dest.y,
      duration: MOTION.slide,
      ease: 'Quad.Out',
      onComplete: () => {
        this.p.anim.squash(view.img, horizontal ? 0.12 : 0.1)
        this.p.vfx.dust(
          dest.x + dc * this.geo.cell * 0.4,
          dest.y + dr * this.geo.cell * 0.4,
          { intensity: 'small' },
        )
      },
    })
  }

  // ── Board-level celebration ─────────────────────────────────────────────────

  /** The tray's own reaction to being emptied. The panel is the scene's job. */
  private playTrayPulse(): void {
    if (!this.tray) return
    this.p.anim.punch(this.tray, 1.03)
    const flash = this.scene.add.graphics().setDepth(DEPTH.overlay)
    for (let r = 0; r < this.geo.rows; r++) {
      for (let c = 0; c < this.geo.cols; c++) {
        const pt = cellCenter(this.geo, c, r)
        this.scene.time.delayedCall((c + r) * 34, () => {
          this.p.vfx.ring(pt.x, pt.y, this.geo.cell * 0.28, { color: TRAY.wellLip })
        })
      }
    }
    this.scene.time.delayedCall(MOTION.settle, () => flash.destroy())
  }

  // ── Construction helpers ────────────────────────────────────────────────────

  private addTile(a: Arrow): void {
    const size = this.geo.cell * TILE_FILL
    const pad = this.geo.cell * 0.34
    const key = this.bake(
      `arrows_tile_${a.dir}_${Math.round(size)}`,
      size + pad, size + pad,
      (g, w, h) => drawArrowTile(g, w / 2, h / 2, size, a.dir, this.p.theme, { shadow: true }),
    )

    const pt = cellCenter(this.geo, a.col, a.row)
    const img = this.scene.add.image(pt.x, pt.y, key).setDepth(DEPTH.tile)

    // Explicit hit size: the baked texture is padded for the shadow, and
    // inheriting that would overlap the neighbouring tile's hit area.
    const press = this.p.press(img, {
      hitSize: { width: this.geo.cell * 0.94, height: this.geo.cell * 0.94 },
      hitPadding: 0,
      pressScale: 0.93,
      onPressStart: () => { if (this.inputOn) this.cb.onHold(a.id) },
      onPress: () => { if (this.inputOn) this.cb.onTap(a.id) },
      onCancel: () => this.cb.onRelease(),
    })

    this.tiles.set(a.id, { id: a.id, dir: a.dir, img, press })
  }

  /** bakeTexture, remembering the key so a resize cannot inherit stale art. */
  private bake(
    key: string, w: number, h: number,
    draw: (g: Phaser.GameObjects.Graphics, w: number, h: number) => void,
  ): string {
    this.owned.add(key)
    return bakeTexture(this.scene, key, w, h, draw)
  }
}
