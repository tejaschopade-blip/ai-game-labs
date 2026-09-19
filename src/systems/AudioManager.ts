import Phaser from 'phaser'

export class AudioManager {
  private music: Phaser.Sound.BaseSound | null = null
  private masterVolume = 1
  private musicVolume  = 0.7
  private sfxVolume    = 1
  private muted        = false

  constructor(private scene: Phaser.Scene) {}

  playSfx(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    if (this.muted || !this.scene.cache.audio.exists(key)) return
    this.scene.sound.play(key, { volume: this.sfxVolume * this.masterVolume, ...config })
  }

  playMusic(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    if (this.music?.isPlaying) this.music.stop()
    if (!this.scene.cache.audio.exists(key)) return
    this.music = this.scene.sound.add(key, {
      loop: true,
      volume: this.muted ? 0 : this.musicVolume * this.masterVolume,
      ...config,
    })
    this.music.play()
  }

  stopMusic(): void { this.music?.stop(); this.music = null }

  setMasterVolume(v: number): void { this.masterVolume = Phaser.Math.Clamp(v, 0, 1); this.syncMusic() }
  setMusicVolume(v: number):  void { this.musicVolume  = Phaser.Math.Clamp(v, 0, 1); this.syncMusic() }
  setSfxVolume(v: number):    void { this.sfxVolume    = Phaser.Math.Clamp(v, 0, 1) }
  mute():       void { this.muted = true;  this.syncMusic() }
  unmute():     void { this.muted = false; this.syncMusic() }
  toggleMute(): void { this.muted ? this.unmute() : this.mute() }

  private syncMusic(): void {
    const snd = this.music as Phaser.Sound.WebAudioSound | null
    snd?.setVolume?.(this.muted ? 0 : this.musicVolume * this.masterVolume)
  }
}
