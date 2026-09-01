/**
 * Subtle Audio Metronome for ADHD rhythmic focus anchoring.
 * Uses Web Audio API for zero-latency, lightweight wooden tick/tap.
 */
class MetronomeSound {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playTick(volume: number = 0.2, isSentenceEnd: boolean = false) {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const now = this.ctx.currentTime;
      // High pleasant wooden click frequency
      const freq = isSentenceEnd ? 880 : 520;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);

      const actualGain = Math.min(1, Math.max(0.01, volume * 0.15));
      gain.gain.setValueAtTime(actualGain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio context might be restricted before user interaction
    }
  }
}

export const metronome = new MetronomeSound();
