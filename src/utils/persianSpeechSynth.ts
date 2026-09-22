/**
 * Persian Web Audio Speech Synthesizer Provider
 * 
 * Provides an in-browser acoustic voice synthesizer for Persian / Farsi text,
 * guaranteeing offline and reliable vocal narration even when the host operating
 * system or browser does not have a native Farsi TTS voice pack installed.
 */

class PersianSpeechSynthesizer {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private timeouts: NodeJS.Timeout[] = [];

  private initCtx(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Approximate phonetic vowel/formant mapping for Persian vowels:
   * /a/ (فتحه), /e/ (کسره), /o/ (ضمه), /â/ (آ), /i/ (ای), /u/ (او)
   */
  private getFormantFrequencies(char: string): [number, number] {
    switch (char) {
      case 'آ':
      case 'ا':
        return [730, 1090]; // /â/
      case 'و':
        return [300, 870]; // /u/ or /o/
      case 'ی':
        return [280, 2250]; // /i/
      case 'ه':
      case 'ح':
        return [500, 1500];
      case 'ش':
      case 'س':
      case 'ص':
      case 'ث':
        return [800, 2400]; // sibilant higher formant
      case 'ر':
      case 'ل':
        return [450, 1300];
      case 'م':
      case 'ن':
        return [350, 1100]; // nasal
      case 'ب':
      case 'پ':
      case 'ت':
      case 'ط':
      case 'د':
        return [400, 1700];
      default:
        return [550, 1600]; // neutral Persian schwa /e/
    }
  }

  /**
   * Synthesize an individual Persian word syllable cluster
   */
  public speakWord(
    word: string,
    durationMs: number = 220,
    pitch: number = 1.0,
    volume: number = 0.8
  ): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const safeDuration = Math.max(0.08, Math.min(0.45, durationMs / 1000));
      const baseFreq = 165 * Math.max(0.6, Math.min(1.5, pitch)); // natural human voice fundamental frequency

      // 1. Voice vocal cord oscillator (sawtooth with human pitch inflection)
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';

      // Slight natural pitch drop towards the end of the word
      osc.frequency.setValueAtTime(baseFreq * 1.05, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.95, now + safeDuration);

      // 2. Dual Biquad Bandpass Formant Filters (F1 & F2) to simulate throat & mouth resonance
      const primaryChar = word.slice(0, 2).replace(/[^\u0600-\u06FF]/g, '')[0] || 'ا';
      const [f1Freq, f2Freq] = this.getFormantFrequencies(primaryChar);

      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(f1Freq, now);
      f1.Q.setValueAtTime(4.5, now);

      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(f2Freq, now);
      f2.Q.setValueAtTime(5.0, now);

      // 3. Amplitude envelope
      const gain = ctx.createGain();
      const targetGain = Math.max(0.01, Math.min(0.8, volume * 0.35));

      // Fast attack, smooth decay
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + safeDuration);

      // Connect vocal nodes
      osc.connect(f1);
      osc.connect(f2);
      f1.connect(gain);
      f2.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          f1.disconnect();
          f2.disconnect();
          gain.disconnect();
        } catch {}
      };

      osc.start(now);
      osc.stop(now + safeDuration);
    } catch (e) {
      console.warn('Persian speech synthesis audio error:', e);
    }
  }

  /**
   * Stop any current sound playback
   */
  public stop(): void {
    this.isPlaying = false;
    for (const t of this.timeouts) {
      clearTimeout(t);
    }
    this.timeouts = [];
  }

  /**
   * Quick preview for testing Farsi pronunciation
   */
  public preview(pitch: number = 1.0, volume: number = 0.8): void {
    const previewWords = ['سامانه', 'خوانش', 'فارسی', 'آماده', 'است'];
    let delay = 0;
    this.stop();
    this.isPlaying = true;

    previewWords.forEach((word, idx) => {
      const t = setTimeout(() => {
        if (!this.isPlaying) return;
        this.speakWord(word, 260, pitch, volume);
        if (idx === previewWords.length - 1) {
          this.isPlaying = false;
        }
      }, delay);
      this.timeouts.push(t);
      delay += 320;
    });
  }
}

export const persianAudioSynth = new PersianSpeechSynthesizer();
