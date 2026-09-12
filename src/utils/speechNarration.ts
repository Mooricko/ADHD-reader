import { HighlightedWordParts, ReaderSettings } from '../types';
import { calculateWordDelayMs } from './textParser';

export interface VoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
  localService: boolean;
  provider: string;
}

export type WordSyncCallback = (wordIndex: number) => void;
export type FinishedCallback = () => void;

class SpeechNarrationService {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private activeUtteranceId: number = 0;
  private lastReportedWordIndex: number = -1;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded: boolean = false;
  private listeners: Set<() => void> = new Set();
  private isSpeaking: boolean = false;
  private activeChunkStartIndex: number = -1;
  private activeChunkEndIndex: number = -1;
  private activeChunkWords: HighlightedWordParts[] = [];
  private activeCharOffsets: { start: number; end: number; index: number }[] = [];
  private fallbackTimer: NodeJS.Timeout | null = null;
  private hasReceivedBoundary: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  private loadVoices(): void {
    if (!this.synth) return;
    try {
      const v = this.synth.getVoices();
      if (v && v.length > 0) {
        this.voices = v;
        this.voicesLoaded = true;
        this.notifyListeners();
      }
    } catch (e) {
      console.warn('Failed to load speech synthesis voices:', e);
    }
  }

  public onVoicesChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.voicesLoaded) {
      listener();
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.error('Error in voice listener:', e);
      }
    });
  }

  public getVoices(): VoiceOption[] {
    if (!this.synth) return [];
    if (this.voices.length === 0) {
      this.loadVoices();
    }

    return this.voices.map((v) => {
      let provider = 'System Voice';
      if (v.name.includes('Google') || v.voiceURI.includes('Google')) provider = 'Google Speech';
      else if (v.name.includes('Microsoft') || v.voiceURI.includes('Microsoft')) provider = 'Microsoft Natural';
      else if (v.name.includes('Apple') || v.name.includes('Siri') || v.voiceURI.includes('com.apple')) provider = 'Apple Voice';
      else if (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Daniel')) provider = 'Natural Voice';

      return {
        name: v.name,
        lang: v.lang,
        voiceURI: v.voiceURI,
        default: v.default,
        localService: v.localService,
        provider,
      };
    });
  }

  /**
   * Find selected voice or default English voice
   */
  private resolveVoice(voiceURI?: string): SpeechSynthesisVoice | null {
    if (!this.synth || this.voices.length === 0) {
      this.loadVoices();
    }
    if (this.voices.length === 0) return null;

    if (voiceURI) {
      const match = this.voices.find((v) => v.voiceURI === voiceURI);
      if (match) return match;
    }

    // Default to an English voice or system default
    const englishVoice = this.voices.find((v) => v.lang.startsWith('en') && v.default) 
      || this.voices.find((v) => v.lang.startsWith('en'))
      || this.voices.find((v) => v.default)
      || this.voices[0];

    return englishVoice || null;
  }

  /**
   * Calculate Web Speech rate from RSVP WPM
   * Normal conversational speed ~ 150-160 WPM = rate 1.0
   */
  public computeSpeechRate(wpm: number, multiplier: number = 1.0): number {
    const rawRate = (wpm / 160) * multiplier;
    // Web Speech API rate valid range is roughly 0.5 to 3.0 in modern browsers
    return Math.max(0.5, Math.min(3.0, Number(rawRate.toFixed(2))));
  }

  /**
   * Stop any current speech synthesis
   */
  public stop(): void {
    this.activeUtteranceId++;
    this.clearFallbackTimer();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.lastReportedWordIndex = -1;
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {
        console.debug('Speech cancel error:', e);
      }
    }
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  /**
   * Speak a short audio preview of a chosen voice
   */
  public previewVoice(
    voiceURI: string, 
    pitch: number = 1.0, 
    rate: number = 1.0, 
    volume: number = 1.0
  ): void {
    if (!this.synth) return;
    this.stop();

    const samplePhrase = "ADHD Reader audio narration is active. Ready to focus.";
    const utterance = new SpeechSynthesisUtterance(samplePhrase);
    const voice = this.resolveVoice(voiceURI);
    if (voice) utterance.voice = voice;
    utterance.pitch = Math.max(0.5, Math.min(1.5, pitch));
    utterance.rate = Math.max(0.5, Math.min(2.5, rate));
    utterance.volume = Math.max(0, Math.min(1, volume));

    try {
      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Voice preview error:', err);
    }
  }

  /**
   * Start or continue synchronized reading from a given index
   */
  public speakFromIndex({
    words,
    startIndex,
    settings,
    onWordSync,
    onFinished,
    isPlayingCheck,
  }: {
    words: HighlightedWordParts[];
    startIndex: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    onFinished: FinishedCallback;
    isPlayingCheck: () => boolean;
  }): void {
    if (!this.synth || !this.isSupported()) return;
    if (startIndex >= words.length) {
      onFinished();
      return;
    }

    this.stop();
    const utteranceId = ++this.activeUtteranceId;
    this.isSpeaking = true;
    this.hasReceivedBoundary = false;
    this.lastReportedWordIndex = startIndex - 1;

    // 1. Determine a natural chunk (up to sentence end or 25 words max)
    let endIndex = startIndex;
    const maxChunkSize = 25;
    while (endIndex < words.length - 1 && (endIndex - startIndex) < maxChunkSize) {
      const w = words[endIndex];
      if (w.hasSentenceEnd || w.hasParagraphBreak) {
        break;
      }
      endIndex++;
    }

    this.activeChunkStartIndex = startIndex;
    this.activeChunkEndIndex = endIndex;
    this.activeChunkWords = words.slice(startIndex, endIndex + 1);

    // 2. Build continuous text and character offset map
    let accumulatedOffset = 0;
    this.activeCharOffsets = [];

    const textPieces: string[] = [];
    for (let i = 0; i < this.activeChunkWords.length; i++) {
      const wordObj = this.activeChunkWords[i];
      const wordStr = wordObj.original;
      textPieces.push(wordStr);

      const wordStart = accumulatedOffset;
      const wordEnd = accumulatedOffset + wordStr.length;

      this.activeCharOffsets.push({
        start: wordStart,
        end: wordEnd,
        index: startIndex + i,
      });

      accumulatedOffset += wordStr.length + 1; // + 1 for space
    }

    const chunkText = textPieces.join(' ');
    if (!chunkText.trim()) {
      if (endIndex + 1 < words.length && isPlayingCheck()) {
        this.speakFromIndex({
          words,
          startIndex: endIndex + 1,
          settings,
          onWordSync,
          onFinished,
          isPlayingCheck,
        });
      } else {
        onFinished();
      }
      return;
    }

    // 3. Create and configure Utterance
    const utterance = new SpeechSynthesisUtterance(chunkText);
    this.currentUtterance = utterance;

    const voice = this.resolveVoice(settings.speechVoiceURI);
    if (voice) utterance.voice = voice;

    utterance.pitch = Math.max(0.5, Math.min(1.5, settings.speechPitch || 1.0));
    utterance.volume = Math.max(0, Math.min(1, settings.speechVolume ?? 1.0));
    utterance.rate = this.computeSpeechRate(settings.wpm, settings.speechRateMultiplier || 1.0);

    // 4. Synchronize word boundary events with visual RSVP
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      // Guard against stale utterances, stopped state, or cancelled tasks
      if (
        this.activeUtteranceId !== utteranceId ||
        this.currentUtterance !== utterance ||
        !isPlayingCheck() ||
        !this.isSpeaking
      ) {
        return;
      }

      // Ignore non-word boundaries (such as 'sentence' boundaries in Chrome)
      if (event.name && event.name !== 'word') {
        return;
      }

      this.hasReceivedBoundary = true;
      this.clearFallbackTimer();

      const charIdx = event.charIndex;
      if (typeof charIdx === 'number' && charIdx >= 0) {
        // Find corresponding word in our continuous offset map
        let matchedIndex = -1;
        for (let i = 0; i < this.activeCharOffsets.length; i++) {
          const cur = this.activeCharOffsets[i];
          const next = this.activeCharOffsets[i + 1];
          // Check if charIndex is within this word token or space up to next word
          if (charIdx >= cur.start && (!next || charIdx < next.start)) {
            matchedIndex = cur.index;
            break;
          }
        }

        if (matchedIndex === -1 && this.activeCharOffsets.length > 0) {
          matchedIndex = this.activeCharOffsets[this.activeCharOffsets.length - 1].index;
        }

        // Only fire if advancing forward and hasn't already been reported
        if (matchedIndex > this.lastReportedWordIndex) {
          this.lastReportedWordIndex = matchedIndex;
          onWordSync(matchedIndex);
        }
      }
    };

    // 5. Utterance completion: chain into the next chunk
    utterance.onend = () => {
      this.clearFallbackTimer();
      // Guard against stale utterances, stopped state, or cancelled tasks
      if (
        this.activeUtteranceId !== utteranceId ||
        this.currentUtterance !== utterance ||
        !isPlayingCheck() ||
        !this.isSpeaking
      ) {
        return;
      }

      const nextIndex = this.activeChunkEndIndex + 1;
      if (nextIndex < words.length) {
        // Continue directly to next sentence chunk
        this.speakFromIndex({
          words,
          startIndex: nextIndex,
          settings,
          onWordSync,
          onFinished,
          isPlayingCheck,
        });
      } else {
        // Reached the end of text
        this.isSpeaking = false;
        this.currentUtterance = null;
        onFinished();
      }
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      this.clearFallbackTimer();
      if (this.activeUtteranceId !== utteranceId) return;
      // 'canceled' and 'interrupted' are expected when user pauses or seeks
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('Speech synthesis error:', event.error);
      }
    };

    // 6. Speak the utterance
    try {
      // Resume if browser TTS is in suspended/paused state
      if (this.synth.paused) {
        this.synth.resume();
      }
      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Speech speak call failed:', err);
    }

    // 7. Setup fallback timer in case browser does not support onboundary events
    this.scheduleFallbackWordPacing({
      words,
      chunkStartIndex: startIndex,
      chunkEndIndex: endIndex,
      settings,
      onWordSync,
      isPlayingCheck,
      utteranceId,
    });
  }

  /**
   * Fallback timer that advances words if the browser/voice fails to fire onboundary events
   */
  private scheduleFallbackWordPacing({
    words,
    chunkStartIndex,
    chunkEndIndex,
    settings,
    onWordSync,
    isPlayingCheck,
    utteranceId,
  }: {
    words: HighlightedWordParts[];
    chunkStartIndex: number;
    chunkEndIndex: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    isPlayingCheck: () => boolean;
    utteranceId: number;
  }): void {
    let fallbackIdx = chunkStartIndex;

    const step = () => {
      // If boundary events are already firing from the browser, cancel fallback!
      if (
        this.hasReceivedBoundary ||
        !this.isSpeaking ||
        !isPlayingCheck() ||
        this.activeUtteranceId !== utteranceId
      ) {
        return;
      }

      if (fallbackIdx <= chunkEndIndex) {
        if (fallbackIdx > this.lastReportedWordIndex) {
          this.lastReportedWordIndex = fallbackIdx;
          onWordSync(fallbackIdx);
        }
        const curWord = words[fallbackIdx];
        fallbackIdx++;

        const delay = calculateWordDelayMs(
          curWord,
          settings.wpm,
          settings.smartPunctuationPause
        );

        this.fallbackTimer = setTimeout(step, delay);
      }
    };

    // Wait a brief 450ms window to see if onboundary fires first
    this.fallbackTimer = setTimeout(() => {
      if (
        !this.hasReceivedBoundary &&
        this.isSpeaking &&
        isPlayingCheck() &&
        this.activeUtteranceId === utteranceId
      ) {
        step();
      }
    }, 450);
  }
}

export const speechNarrator = new SpeechNarrationService();
