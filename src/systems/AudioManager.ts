import Phaser from 'phaser'

export class AudioManager {
  private music: Phaser.Sound.BaseSound | null = null

  constructor(private scene: Phaser.Scene) {}

  playSfx(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    if (this.scene.cache.audio.exists(key)) this.scene.sound.play(key, config)
  }

  playMusic(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    if (this.music?.isPlaying) this.music.stop()
    if (this.scene.cache.audio.exists(key)) {
      this.music = this.scene.sound.add(key, { loop: true, ...config })
      this.music.play()
    }
  }

  stopMusic(): void {
    this.music?.stop()
    this.music = null
  }
}
