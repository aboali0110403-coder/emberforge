import { RACES } from '../data/races';
import type { AudioSettings, RaceId } from '../types';

export type MusicTrack = 'none' | 'workshop' | 'map' | 'battle' | 'legendary';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private settings: AudioSettings = {
    musicVolume: 0.45,
    sfxVolume: 0.75,
    muted: false,
  };

  private track: MusicTrack = 'none';
  private kingdomFlavor: RaceId = 'human';
  private stepIdx = 0;
  private sequencerTimer: number | null = null;
  private suspendedByBg = false;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Reusable 0.5s white-noise buffer for hi-hat, bellows, quench hiss, grindstone
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
      this.applyVolumes();
    }

    if (this.ctx && this.ctx.state === 'suspended' && !this.suspendedByBg) {
      void this.ctx.resume();
    }
  }

  public setSettings(settings: AudioSettings): void {
    this.settings = { ...settings };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.muted ? 0 : 1, now, 0.02);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * 0.35, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume * 0.7, now, 0.02);
  }

  public setBackgroundPaused(paused: boolean): void {
    this.suspendedByBg = paused;
    if (!this.ctx) return;
    if (paused) {
      if (this.ctx.state === 'running') void this.ctx.suspend();
    } else {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    }
  }

  public setMusic(track: MusicTrack, kingdom: RaceId = 'human'): void {
    this.kingdomFlavor = kingdom;
    if (typeof window === 'undefined') {
      this.track = track;
      return;
    }
    if (this.track === track && this.sequencerTimer !== null) return;
    this.track = track;
    this.stepIdx = 0;
    if (this.sequencerTimer !== null) {
      window.clearInterval(this.sequencerTimer);
      this.sequencerTimer = null;
    }
    if (track === 'none') return;

    const tempoMs = track === 'battle' ? 145 : track === 'legendary' ? 160 : 210;
    this.sequencerTimer = window.setInterval(() => {
      this.tickSequencer();
    }, tempoMs);
  }

  private tickSequencer(): void {
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running' || this.settings.muted) {
      return;
    }
    const race = RACES[this.kingdomFlavor] ?? RACES.human;
    const scale = race.scaleIntervals;
    const root = race.rootMidi;
    const now = this.ctx.currentTime;
    const s = this.stepIdx % 16;
    this.stepIdx += 1;

    // Pattern definitions by track
    const workshopLead = [0, -1, 2, 4, 3, -1, 2, 1, 0, -1, 4, 5, 4, 2, 1, -1];
    const mapLead = [0, 2, 4, 7, 5, 4, 2, 0, 4, 5, 7, 4, 2, 1, 0, -1];
    const battleLead = [0, 0, 4, 2, 5, 4, 2, 7, 0, 4, 5, 7, 6, 4, 2, 4];
    const legendaryLead = [0, 2, 4, 7, 9, 7, 4, 7, 4, 5, 7, 9, 11, 9, 7, -1];

    const pattern =
      this.track === 'battle'
        ? battleLead
        : this.track === 'map'
          ? mapLead
          : this.track === 'legendary'
            ? legendaryLead
            : workshopLead;

    const degree = pattern[s];
    if (degree >= 0) {
      const oct = Math.floor(degree / scale.length);
      const semi = scale[degree % scale.length] + oct * 12;
      const freq = midiToFreq(root + semi);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.17);
    }

    // Triangle bass on downbeats
    if (s % 2 === 0) {
      const bassStep = (s / 2) % 4;
      const bassDegrees = this.track === 'battle' ? [0, 0, 3, 4] : [0, 4, 3, 2];
      const bDeg = bassDegrees[bassStep];
      const bSemi = scale[bDeg % scale.length] - 12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(root + bSemi), now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.23);
    }

    // Noise hi-hat on offbeats (stronger in battle/workshop)
    if (this.noiseBuffer && (s % 4 === 2 || (this.track === 'battle' && s % 2 === 1))) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(4800, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.track === 'battle' ? 0.08 : 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      src.start(now);
      src.stop(now + 0.06);
    }
  }

  public playUiBlip(pitch = 660): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, now + 0.05);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playWarningTone(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playTestSfx(): void {
    this.playHammer('perfect');
  }

  public playHammer(quality: 'perfect' | 'good' | 'miss'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const baseFreq = quality === 'perfect' ? 920 : quality === 'good' ? 680 : 210;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = quality === 'miss' ? 'sawtooth' : 'triangle';
    osc2.type = 'sine';
    const jitter = 0.96 + Math.random() * 0.08;
    osc1.frequency.setValueAtTime(baseFreq * jitter, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.22);
    osc2.frequency.setValueAtTime(baseFreq * 1.52 * jitter, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + 0.18);

    gain.gain.setValueAtTime(quality === 'miss' ? 0.16 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.25);
    osc2.stop(now + 0.25);
  }

  public playBellows(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(880, now + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.22);
  }

  public playGrindstone(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3, now);
    filter.frequency.setValueAtTime(2200 + Math.random() * 600, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.11);
  }

  public playQuenchHiss(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1600, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.44);
  }

  public playCoin(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const notes = [988, 1319];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.065);
      gain.gain.setValueAtTime(0.14, now + i * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.065 + 0.14);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.065);
      osc.stop(now + i * 0.065 + 0.15);
    });
  }

  public playLevelUp(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.24, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.22);
    });
  }

  public playBattleSlash(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(360, now + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.16);
  }

  public playBattleImpact(won: boolean): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = won ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(won ? 260 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playWeaponReveal(grade: 'S' | 'A' | 'B' | 'C' | 'D'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const notes =
      grade === 'S'
        ? [587, 740, 880, 1175]
        : grade === 'A'
          ? [523, 659, 784, 1046]
          : grade === 'B'
            ? [440, 554, 659]
            : [392, 440];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + i * 0.065;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = grade === 'S' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playLegendaryFanfare(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 659, 784, 1046, 1318];
    const times = [0, 0.1, 0.2, 0.32, 0.42, 0.54, 0.7];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + times[i];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }
}

export const soundEngine = new SoundEngine();
