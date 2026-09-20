import Phaser from 'phaser'
import { GameConfig } from './core/GameConfig'

/**
 * Phaser measures text at creation time, so a webfont that arrives late leaves
 * every label mis-sized until something redraws it. Waiting for the font here
 * costs a few frames of boot and removes the whole class of problem.
 *
 * Hard-capped: a slow or absent network must not stop the game from starting.
 */
const FONT_TIMEOUT_MS = 1200

async function waitForFonts(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts) return
    await Promise.race([
      Promise.all([
        fonts.load('400 16px Nunito'),
        fonts.load('700 16px Nunito'),
        fonts.load('800 16px Nunito'),
      ]),
      new Promise(resolve => setTimeout(resolve, FONT_TIMEOUT_MS)),
    ])
  } catch {
    // Fall through to the system font stack.
  }
}

void waitForFonts().then(() => { new Phaser.Game(GameConfig) })
