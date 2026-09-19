import { HighlightedWordParts, ReaderSettings } from '../types';
import { calculateWordDelayMs, isRtlText } from './textParser';
import { persianAudioSynth } from './persianSpeechSynth';

export interface VoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
  localService: boolean;
  provider: string;
  isFarsi?: boolean;
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
  private synthTimer: NodeJS.Timeout | null = null;

  private initialized: boolean = false;

  constructor() {
    // Lazily initialized to prevent top-level module load exceptions in restricted iframes
  }

  private getSynth(): SpeechSynthesis | null {
    if (this.synth) return this.synth;
    if (typeof window === 'undefined') return null;
    try {
      if ('speechSynthesis' in window && window.speechSynthesis) {
        this.synth = window.speechSynthesis;
        this.initEventListeners();
        return this.synth;
      }
    } catch (e) {
      console.warn('SpeechSynthesis access denied or restricted:', e);
    }
    return null;
  }

  private initEventListeners(): void {
    if (this.initialized || !this.synth) return;
    this.initialized = true;
    try {
      this.loadVoices();
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', () => {
          this.loadVoices();
        });
      } else if ('onvoiceschanged' in this.synth) {
        this.synth.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
    } catch (e) {
      console.warn('Could not bind voiceschanged listener:', e);
    }
  }

  public isSupported(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        Boolean(window.speechSynthesis) &&
        'SpeechSynthesisUtterance' in window
      );
    } catch {
      return false;
    }
  }

  private loadVoices(): void {
    const synth = this.getSynth();
    if (!synth) return;
    try {
      const v = synth.getVoices();
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
    this.initEventListeners();
    if (this.voicesLoaded) {
      try {
        listener();
      } catch (e) {
        console.warn('Error executing voice listener:', e);
      }
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
    const synth = this.getSynth();
    if (synth && this.voices.length === 0) {
      this.loadVoices();
    }

    // Curated virtual Farsi voice provider presets
    const farsiProviderVoices: VoiceOption[] = [
      {
        name: 'گوینده فارسی مرورگر (Google / Web Speech fa-IR)',
        lang: 'fa-IR',
        voiceURI: 'farsi-webspeech-cloud',
        default: false,
        localService: false,
        provider: 'Google / Web Speech API (فارسی)',
        isFarsi: true,
      },
      {
        name: 'دل‌آرا (فارسی) - Microsoft Dilara Natural',
        lang: 'fa-IR',
        voiceURI: 'farsi-microsoft-dilara',
        default: false,
        localService: false,
        provider: 'Microsoft Natural (فارسی)',
        isFarsi: true,
      },
      {
        name: 'فرید (فارسی) - Microsoft Farid Natural',
        lang: 'fa-IR',
        voiceURI: 'farsi-microsoft-farid',
        default: false,
        localService: false,
        provider: 'Microsoft Natural (فارسی)',
        isFarsi: true,
      },
      {
        name: 'سنتز گفتار روان فارسی (Persian Web Audio Synth)',
        lang: 'fa-IR',
        voiceURI: 'farsi-webaudio-synth',
        default: false,
        localService: true,
        provider: 'Built-in Acoustic Audio Synth',
        isFarsi: true,
      },
    ];

    const mappedSystemVoices = this.voices.map((v) => {
      const isFarsiVoice = v.lang.startsWith('fa') || 
        v.lang.startsWith('per') || 
        v.name.toLowerCase().includes('persian') || 
        v.name.includes('فارسی');

      let provider = isFarsiVoice ? 'Persian Natural (فارسی)' : 'System Voice';
      if (v.name.includes('Google') || v.voiceURI.includes('Google')) {
        provider = isFarsiVoice ? 'Google فارسی' : 'Google Speech';
      } else if (v.name.includes('Microsoft') || v.voiceURI.includes('Microsoft')) {
        provider = isFarsiVoice ? 'Microsoft Persian' : 'Microsoft Natural';
      } else if (v.name.includes('Apple') || v.name.includes('Siri') || v.voiceURI.includes('com.apple')) {
        provider = isFarsiVoice ? 'Apple فارسی' : 'Apple Voice';
      } else if (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Daniel')) {
        provider = 'Natural Voice';
      }

      return {
        name: v.name,
        lang: v.lang,
        voiceURI: v.voiceURI,
        default: v.default,
        localService: v.localService,
        provider,
        isFarsi: isFarsiVoice,
      };
    });

    return [...farsiProviderVoices, ...mappedSystemVoices];
  }

  /**
   * Find selected voice or appropriate language voice
   */
  private resolveVoice(voiceURI?: string, isFarsiText?: boolean): SpeechSynthesisVoice | null {
    const synth = this.getSynth();
    if (!synth) return null;
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    if (this.voices.length === 0) return null;

    // Handle virtual Farsi voice resolution to installed browser voices
    if (voiceURI === 'farsi-microsoft-dilara') {
      const match = this.voices.find(v => v.name.toLowerCase().includes('dilara') || (v.lang.startsWith('fa') && v.name.includes('Microsoft')));
      if (match) return match;
    } else if (voiceURI === 'farsi-microsoft-farid') {
      const match = this.voices.find(v => v.name.toLowerCase().includes('farid') || (v.lang.startsWith('fa') && v.name.includes('Microsoft')));
      if (match) return match;
    } else if (voiceURI === 'farsi-webspeech-cloud') {
      const match = this.voices.find(v => v.lang.startsWith('fa') || v.name.toLowerCase().includes('persian') || v.name.includes('فارسی'));
      if (match) return match;
    } else if (voiceURI && voiceURI !== 'farsi-webaudio-synth') {
      const match = this.voices.find((v) => v.voiceURI === voiceURI);
      if (match) return match;
    }

    // If reading Farsi text and no specific voice was locked, prioritize a Farsi voice
    if (isFarsiText) {
      const farsiVoice = this.voices.find(v => v.lang.startsWith('fa') || v.name.toLowerCase().includes('persian') || v.name.includes('فارسی'));
      if (farsiVoice) return farsiVoice;
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
    this.clearSynthTimer();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.lastReportedWordIndex = -1;
    persianAudioSynth.stop();
    const synth = this.getSynth();
    if (synth) {
      try {
        synth.cancel();
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

  private clearSynthTimer(): void {
    if (this.synthTimer) {
      clearTimeout(this.synthTimer);
      this.synthTimer = null;
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
    this.stop();

    if (voiceURI === 'farsi-webaudio-synth') {
      persianAudioSynth.preview(pitch, volume);
      return;
    }

    const synth = this.getSynth();
    if (!synth) return;

    try {
      const isFarsi = voiceURI.startsWith('farsi-') || 
        this.voices.some(v => v.voiceURI === voiceURI && (v.lang.startsWith('fa') || v.name.includes('فارسی')));

      const samplePhrase = isFarsi 
        ? "سامانه خوانش صوتی و فوکوس کلمه به کلمه آماده است."
        : "ADHD Reader audio narration is active. Ready to focus.";

      const utterance = new SpeechSynthesisUtterance(samplePhrase);
      if (isFarsi) {
        utterance.lang = 'fa-IR';
      }

      const voice = this.resolveVoice(voiceURI, isFarsi);
      if (voice) utterance.voice = voice;
      utterance.pitch = Math.max(0.5, Math.min(1.5, pitch));
      utterance.rate = Math.max(0.5, Math.min(2.5, rate));
      utterance.volume = Math.max(0, Math.min(1, volume));

      synth.speak(utterance);
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
    getCurrentWpm,
  }: {
    words: HighlightedWordParts[];
    startIndex: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    onFinished: FinishedCallback;
    isPlayingCheck: () => boolean;
    getCurrentWpm?: () => number;
  }): void {
    if (startIndex >= words.length) {
      onFinished();
      return;
    }

    this.stop();
    const utteranceId = ++this.activeUtteranceId;
    this.isSpeaking = true;
    this.hasReceivedBoundary = false;
    this.lastReportedWordIndex = startIndex - 1;

    const currentWpm = getCurrentWpm ? getCurrentWpm() : settings.wpm;
    const isWarmingUp = Boolean(settings.warmupMode && currentWpm < settings.wpm);

    // Handle Persian Web Audio Synthesizer Provider Mode
    if (settings.speechVoiceURI === 'farsi-webaudio-synth') {
      this.playPersianSynthWordByWord({
        words,
        index: startIndex,
        settings,
        onWordSync,
        onFinished,
        isPlayingCheck,
        utteranceId,
        getCurrentWpm,
      });
      return;
    }

    const synth = this.getSynth();
    if (!synth || !this.isSupported()) return;

    // 1. Determine a natural chunk:
    // When warming up, use smaller, naturally-bounded chunks (5-8 words or clause pauses)
    // so speech acceleration matches visual warm-up ramp between phrases without audio clipping.
    let endIndex = startIndex;
    const maxChunkSize = isWarmingUp ? 8 : 25;
    while (endIndex < words.length - 1 && (endIndex - startIndex) < maxChunkSize) {
      const w = words[endIndex];
      if (w.hasSentenceEnd || w.hasParagraphBreak || (isWarmingUp && (w.hasClausePause || w.original.endsWith(',')))) {
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
          getCurrentWpm,
        });
      } else {
        onFinished();
      }
      return;
    }

    // Check if chunk is Farsi / RTL
    const isFarsi = isRtlText(chunkText) || (settings.speechVoiceURI && settings.speechVoiceURI.startsWith('farsi-'));

    // 3. Create and configure Utterance
    const utterance = new SpeechSynthesisUtterance(chunkText);
    this.currentUtterance = utterance;

    if (isFarsi) {
      utterance.lang = 'fa-IR';
    }

    const voice = this.resolveVoice(settings.speechVoiceURI, isFarsi);
    if (voice) utterance.voice = voice;

    utterance.pitch = Math.max(0.5, Math.min(1.5, settings.speechPitch || 1.0));
    utterance.volume = Math.max(0, Math.min(1, settings.speechVolume ?? 1.0));
    // Calculate rate dynamically based on current effective warm-up WPM
    utterance.rate = this.computeSpeechRate(currentWpm, settings.speechRateMultiplier || 1.0);

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
        this.speakFromIndex({
          words,
          startIndex: nextIndex,
          settings,
          onWordSync,
          onFinished,
          isPlayingCheck,
          getCurrentWpm,
        });
      } else {
        this.isSpeaking = false;
        this.currentUtterance = null;
        onFinished();
      }
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      this.clearFallbackTimer();
      if (this.activeUtteranceId !== utteranceId) return;
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('Speech synthesis error:', event.error);
      }
    };

    // 6. Speak the utterance
    try {
      const activeSynth = this.getSynth();
      if (activeSynth) {
        if (activeSynth.paused) {
          activeSynth.resume();
        }
        activeSynth.speak(utterance);
      }
    } catch (err) {
      console.warn('Speech speak call failed:', err);
    }

    // 7. Setup fallback timer in case browser does not support onboundary events
    this.scheduleFallbackWordPacing({
      words,
      chunkStartIndex: startIndex,
      chunkEndIndex: endIndex,
      effectiveWpm: currentWpm,
      settings,
      onWordSync,
      isPlayingCheck,
      utteranceId,
    });
  }

  /**
   * Persian Web Audio Synthesizer Provider loop
   */
  private playPersianSynthWordByWord({
    words,
    index,
    settings,
    onWordSync,
    onFinished,
    isPlayingCheck,
    utteranceId,
    getCurrentWpm,
  }: {
    words: HighlightedWordParts[];
    index: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    onFinished: FinishedCallback;
    isPlayingCheck: () => boolean;
    utteranceId: number;
    getCurrentWpm?: () => number;
  }): void {
    if (!isPlayingCheck() || this.activeUtteranceId !== utteranceId) return;

    if (index >= words.length) {
      this.isSpeaking = false;
      onFinished();
      return;
    }

    const currentWord = words[index];
    onWordSync(index);

    const effectiveWpm = getCurrentWpm ? getCurrentWpm() : settings.wpm;

    const delay = calculateWordDelayMs(
      currentWord,
      effectiveWpm,
      settings.smartPunctuationPause,
      settings.smartPace
    );

    // Synthesize Persian word acoustics
    persianAudioSynth.speakWord(
      currentWord.original,
      delay,
      settings.speechPitch,
      settings.speechVolume
    );

    this.synthTimer = setTimeout(() => {
      if (!isPlayingCheck() || this.activeUtteranceId !== utteranceId) return;
      this.playPersianSynthWordByWord({
        words,
        index: index + 1,
        settings,
        onWordSync,
        onFinished,
        isPlayingCheck,
        utteranceId,
        getCurrentWpm,
      });
    }, delay);
  }

  /**
   * Fallback timer that advances words if the browser/voice fails to fire onboundary events
   */
  private scheduleFallbackWordPacing({
    words,
    chunkStartIndex,
    chunkEndIndex,
    effectiveWpm,
    settings,
    onWordSync,
    isPlayingCheck,
    utteranceId,
  }: {
    words: HighlightedWordParts[];
    chunkStartIndex: number;
    chunkEndIndex: number;
    effectiveWpm: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    isPlayingCheck: () => boolean;
    utteranceId: number;
  }): void {
    let currentIdx = chunkStartIndex;

    const stepWord = () => {
      if (this.hasReceivedBoundary || this.activeUtteranceId !== utteranceId || !isPlayingCheck()) {
        return;
      }

      if (currentIdx <= chunkEndIndex) {
        if (currentIdx > this.lastReportedWordIndex) {
          this.lastReportedWordIndex = currentIdx;
          onWordSync(currentIdx);
        }

        const word = words[currentIdx];
        const delay = calculateWordDelayMs(word, effectiveWpm, settings.smartPunctuationPause, settings.smartPace);
        currentIdx++;

        this.fallbackTimer = setTimeout(stepWord, delay);
      }
    };

    const initialWord = words[chunkStartIndex];
    const initialDelay = calculateWordDelayMs(initialWord, effectiveWpm, settings.smartPunctuationPause, settings.smartPace);
    this.fallbackTimer = setTimeout(stepWord, initialDelay);
  }
}

export const speechNarrator = new SpeechNarrationService();
