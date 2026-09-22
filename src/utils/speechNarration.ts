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

/**
 * Retains strong references to in-flight utterances to prevent
 * Chromium / WebKit V8 garbage collection mid-speech.
 */
const activeUtterances = new Set<SpeechSynthesisUtterance>();

/**
 * Detects the predominant language tag for a given text snippet.
 */
export function detectLanguageFromText(text: string): string {
  if (!text) return 'en-US';
  if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) {
    return 'fa-IR';
  }
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja-JP';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
  if (/[\u0590-\u05FF]/.test(text)) return 'he-IL';
  if (/[äößÄÖ]/u.test(text) || (/[üÜ]/u.test(text) && !/[áíóñ]/iu.test(text))) return 'de-DE';
  if (/[¿¡ñáíóú]/iu.test(text)) return 'es-ES';
  if (/[éèêëàâîïôûùç]/iu.test(text)) return 'fr-FR';
  return 'en-US';
}

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
  private boundarySupported: boolean = false;
  private synthTimer: NodeJS.Timeout | null = null;
  private chunkTransitionTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
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
      // Fallback poll for sandboxed iframe environments where voiceschanged may not trigger
      if (typeof window !== 'undefined' && !this.voicesLoaded) {
        setTimeout(() => this.loadVoices(), 150);
        setTimeout(() => this.loadVoices(), 600);
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
  private resolveVoice(voiceURI?: string, targetLang?: string): SpeechSynthesisVoice | null {
    const synth = this.getSynth();
    if (!synth) return null;
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    if (this.voices.length === 0) return null;

    // 1. Handle explicit voice URI or name
    if (voiceURI && voiceURI !== 'farsi-webaudio-synth') {
      if (voiceURI === 'farsi-microsoft-dilara') {
        const match = this.voices.find(v => v.name.toLowerCase().includes('dilara') || (v.lang.startsWith('fa') && v.name.includes('Microsoft')));
        if (match) return match;
      } else if (voiceURI === 'farsi-microsoft-farid') {
        const match = this.voices.find(v => v.name.toLowerCase().includes('farid') || (v.lang.startsWith('fa') && v.name.includes('Microsoft')));
        if (match) return match;
      } else if (voiceURI === 'farsi-webspeech-cloud') {
        const match = this.voices.find(v => v.lang.startsWith('fa') || v.name.toLowerCase().includes('persian') || v.name.includes('فارسی'));
        if (match) return match;
      }

      const match = this.voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
      if (match) return match;
    }

    // 2. Language-based resolution (e.g. fa, es, de, fr, en)
    if (targetLang) {
      const langPrefix = targetLang.split('-')[0].toLowerCase();
      const match = this.voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
      if (match) return match;
    }

    // 3. Default to an English voice or system default
    const englishVoice = this.voices.find((v) => v.lang.startsWith('en') && v.default) 
      || this.voices.find((v) => v.lang.startsWith('en'))
      || this.voices.find((v) => v.default)
      || this.voices[0];

    return englishVoice || null;
  }

  /**
   * Calculate Web Speech rate from RSVP WPM
   * Normal conversational speed ~ 150-160 WPM = rate 1.0
   * Clamped to 0.5 - 2.5 to prevent speech engine failure/distortion.
   */
  public computeSpeechRate(wpm: number, multiplier: number = 1.0): number {
    const rawRate = (wpm / 160) * multiplier;
    return Math.max(0.5, Math.min(2.5, Number(rawRate.toFixed(2))));
  }

  /**
   * Chromium keep-alive timer to prevent speech engine from silently pausing after ~15s
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      const synth = this.getSynth();
      if (synth && synth.speaking && !synth.paused) {
        try {
          synth.pause();
          synth.resume();
        } catch {}
      }
    }, 10000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Stop any current speech synthesis
   */
  public stop(): void {
    this.activeUtteranceId++;
    this.stopKeepAlive();
    this.clearFallbackTimer();
    this.clearSynthTimer();
    if (this.chunkTransitionTimer) {
      clearTimeout(this.chunkTransitionTimer);
      this.chunkTransitionTimer = null;
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.lastReportedWordIndex = -1;
    activeUtterances.clear();
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
      if (synth.paused) synth.resume();

      const isFarsi = voiceURI.startsWith('farsi-') || 
        this.voices.some(v => v.voiceURI === voiceURI && (v.lang.startsWith('fa') || v.name.includes('فارسی')));

      const samplePhrase = isFarsi 
        ? "سامانه خوانش صوتی و فوکوس کلمه به کلمه آماده است."
        : "ADHD Reader audio narration is active. Ready to focus.";

      const utterance = new SpeechSynthesisUtterance(samplePhrase);
      activeUtterances.add(utterance);
      utterance.onend = () => activeUtterances.delete(utterance);
      utterance.onerror = () => activeUtterances.delete(utterance);

      if (isFarsi) {
        utterance.lang = 'fa-IR';
      }

      const voice = this.resolveVoice(voiceURI, isFarsi ? 'fa-IR' : 'en-US');
      if (voice) utterance.voice = voice;
      utterance.pitch = Math.max(0.5, Math.min(1.5, pitch));
      utterance.rate = Math.max(0.5, Math.min(2.5, rate));
      utterance.volume = Math.max(0, Math.min(1, volume));

      synth.speak(utterance);
      if (synth.paused) synth.resume();
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
    getWordsSlice,
    totalWords,
  }: {
    words: HighlightedWordParts[];
    startIndex: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    onFinished: FinishedCallback;
    isPlayingCheck: () => boolean;
    getCurrentWpm?: () => number;
    getWordsSlice?: (startIndex: number, count: number) => Promise<HighlightedWordParts[]>;
    totalWords?: number;
  }): void {
    const effectiveTotalWords = totalWords ?? (words.length > 0 && typeof words[words.length - 1].index === 'number' ? words[words.length - 1].index! + 1 : words.length);

    if (words.length === 0 || startIndex >= effectiveTotalWords) {
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
        getWordsSlice,
        totalWords: effectiveTotalWords,
      });
      return;
    }

    const synth = this.getSynth();
    if (!synth || !this.isSupported()) return;

    // Locate matching start position within the words slice
    const hasIndexedWords = words.length > 0 && words.some(w => typeof w.index === 'number');
    let localStartIndex = -1;
    if (hasIndexedWords) {
      localStartIndex = words.findIndex((w) => w.index === startIndex);
    } else if (startIndex >= 0 && startIndex < words.length) {
      localStartIndex = startIndex;
    }

    if (localStartIndex === -1) {
      if (getWordsSlice) {
        getWordsSlice(startIndex, 30).then((slice) => {
          if (slice.length > 0 && isPlayingCheck() && this.activeUtteranceId === utteranceId) {
            this.speakFromIndex({
              words: slice,
              startIndex,
              settings,
              onWordSync,
              onFinished,
              isPlayingCheck,
              getCurrentWpm,
              getWordsSlice,
              totalWords: effectiveTotalWords,
            });
          } else {
            this.isSpeaking = false;
            onFinished();
          }
        }).catch(() => {
          this.isSpeaking = false;
          onFinished();
        });
        return;
      }
      if (startIndex >= 0 && startIndex < words.length) {
        localStartIndex = startIndex;
      } else {
        this.isSpeaking = false;
        onFinished();
        return;
      }
    }

    // 1. Determine a natural chunk:
    // When warming up, use smaller chunks (5-8 words or clause pauses)
    // so speech acceleration matches visual warm-up ramp between phrases.
    let localEndIndex = Math.max(0, Math.min(words.length - 1, localStartIndex));
    const maxChunkSize = isWarmingUp ? 8 : 25;
    while (localEndIndex < words.length - 1 && (localEndIndex - localStartIndex) < maxChunkSize) {
      const w = words[localEndIndex];
      if (!w) break;
      if (w.hasSentenceEnd || w.hasParagraphBreak || (isWarmingUp && (w.hasClausePause || (w.original && w.original.endsWith(','))))) {
        break;
      }
      localEndIndex++;
    }

    this.activeChunkStartIndex = startIndex;
    this.activeChunkWords = words.slice(localStartIndex, localEndIndex + 1);
    if (this.activeChunkWords.length === 0) {
      this.isSpeaking = false;
      onFinished();
      return;
    }

    const lastWord = this.activeChunkWords[this.activeChunkWords.length - 1];
    this.activeChunkEndIndex = typeof lastWord?.index === 'number' ? lastWord.index : startIndex + this.activeChunkWords.length - 1;

    // 2. Build continuous text and character offset map
    let accumulatedOffset = 0;
    this.activeCharOffsets = [];

    const textPieces: string[] = [];
    for (let i = 0; i < this.activeChunkWords.length; i++) {
      const wordObj = this.activeChunkWords[i];
      const wordStr = wordObj.original || '';
      textPieces.push(wordStr);

      const wordStart = accumulatedOffset;
      const wordEnd = accumulatedOffset + wordStr.length;
      const globalWordIndex = typeof wordObj.index === 'number' ? wordObj.index : startIndex + i;

      this.activeCharOffsets.push({
        start: wordStart,
        end: wordEnd,
        index: globalWordIndex,
      });

      accumulatedOffset += wordStr.length + 1; // + 1 for space
    }

    const chunkText = textPieces.join(' ');
    if (!chunkText.trim()) {
      const nextStart = this.activeChunkEndIndex + 1;
      if (nextStart < effectiveTotalWords && isPlayingCheck()) {
        if (getWordsSlice) {
          getWordsSlice(nextStart, 30).then((nextWords) => {
            if (nextWords.length > 0 && isPlayingCheck() && this.isSpeaking) {
              this.speakFromIndex({
                words: nextWords,
                startIndex: nextStart,
                settings,
                onWordSync,
                onFinished,
                isPlayingCheck,
                getCurrentWpm,
                getWordsSlice,
                totalWords: effectiveTotalWords,
              });
            } else {
              onFinished();
            }
          }).catch(() => onFinished());
        } else {
          this.speakFromIndex({
            words,
            startIndex: nextStart,
            settings,
            onWordSync,
            onFinished,
            isPlayingCheck,
            getCurrentWpm,
            getWordsSlice,
            totalWords: effectiveTotalWords,
          });
        }
      } else {
        onFinished();
      }
      return;
    }

    // Check if chunk is Farsi / RTL
    const isFarsi = isRtlText(chunkText) || (settings.speechVoiceURI && settings.speechVoiceURI.startsWith('farsi-'));
    const detectedLang = isFarsi ? 'fa-IR' : detectLanguageFromText(chunkText);

    // 3. Create and configure Utterance
    const utterance = new SpeechSynthesisUtterance(chunkText);
    this.currentUtterance = utterance;
    activeUtterances.add(utterance);

    utterance.lang = detectedLang;
    const voice = this.resolveVoice(settings.speechVoiceURI, detectedLang);
    if (voice) utterance.voice = voice;

    utterance.pitch = Math.max(0.5, Math.min(1.5, settings.speechPitch || 1.0));
    utterance.volume = Math.max(0, Math.min(1, settings.speechVolume ?? 1.0));
    utterance.rate = this.computeSpeechRate(currentWpm, settings.speechRateMultiplier || 1.0);

    // 4. Utterance start event: unpause keepalive and prime first word
    utterance.onstart = () => {
      if (
        this.activeUtteranceId !== utteranceId ||
        this.currentUtterance !== utterance ||
        !isPlayingCheck() ||
        !this.isSpeaking
      ) {
        return;
      }
      this.startKeepAlive();

      // Ensure the first word in the chunk is synced as soon as audio starts
      if (this.lastReportedWordIndex < startIndex && this.activeCharOffsets.length > 0) {
        const firstIdx = this.activeCharOffsets[0].index;
        this.lastReportedWordIndex = firstIdx;
        onWordSync(firstIdx);
      }
    };

    // 5. Synchronize word boundary events with visual RSVP
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

      // Ignore non-word boundaries (such as sentence or paragraph in Chrome)
      if (event.name && event.name !== 'word') {
        return;
      }

      this.hasReceivedBoundary = true;
      this.boundarySupported = true;
      this.clearFallbackTimer();

      const charIdx = event.charIndex;
      if (typeof charIdx === 'number' && charIdx >= 0) {
        let matchedIndex = -1;
        for (let i = 0; i < this.activeCharOffsets.length; i++) {
          const cur = this.activeCharOffsets[i];
          const next = this.activeCharOffsets[i + 1];
          if (charIdx >= cur.start && (!next || charIdx < next.start)) {
            matchedIndex = cur.index;
            break;
          }
        }

        // Safeguard for engines that report charIndex: 0 repeatedly on every word boundary
        if (charIdx === 0 && this.lastReportedWordIndex >= startIndex && this.activeCharOffsets.length > 1) {
          const nextStep = this.lastReportedWordIndex + 1;
          if (nextStep <= this.activeChunkEndIndex) {
            matchedIndex = nextStep;
          }
        }

        if (matchedIndex === -1 && this.activeCharOffsets.length > 0) {
          matchedIndex = this.activeCharOffsets[this.activeCharOffsets.length - 1].index;
        }

        if (matchedIndex > this.lastReportedWordIndex) {
          this.lastReportedWordIndex = matchedIndex;
          onWordSync(matchedIndex);
        }
      }
    };

    // 6. Utterance completion: chain smoothly into the next chunk
    utterance.onend = () => {
      this.stopKeepAlive();
      this.clearFallbackTimer();
      activeUtterances.delete(utterance);

      if (
        this.activeUtteranceId !== utteranceId ||
        this.currentUtterance !== utterance ||
        !isPlayingCheck() ||
        !this.isSpeaking
      ) {
        return;
      }

      // Ensure the final word in this chunk was synced before transitioning
      if (this.lastReportedWordIndex < this.activeChunkEndIndex) {
        this.lastReportedWordIndex = this.activeChunkEndIndex;
        onWordSync(this.activeChunkEndIndex);
      }

      const nextIndex = this.activeChunkEndIndex + 1;
      if (nextIndex < effectiveTotalWords) {
        // Natural gentle punctuation pause between sentences/chunks
        const lastWordObj = this.activeChunkWords[this.activeChunkWords.length - 1];
        const pauseDelay = lastWordObj?.hasSentenceEnd ? 100 : (lastWordObj?.hasClausePause ? 50 : 20);

        this.chunkTransitionTimer = setTimeout(() => {
          if (
            this.activeUtteranceId !== utteranceId ||
            !isPlayingCheck() ||
            !this.isSpeaking
          ) {
            return;
          }

          if (getWordsSlice) {
            getWordsSlice(nextIndex, 30).then((nextSlice) => {
              if (nextSlice.length > 0 && isPlayingCheck() && this.isSpeaking && this.activeUtteranceId === utteranceId) {
                this.speakFromIndex({
                  words: nextSlice,
                  startIndex: nextIndex,
                  settings,
                  onWordSync,
                  onFinished,
                  isPlayingCheck,
                  getCurrentWpm,
                  getWordsSlice,
                  totalWords: effectiveTotalWords,
                });
              } else {
                this.isSpeaking = false;
                this.currentUtterance = null;
                onFinished();
              }
            }).catch(() => {
              this.isSpeaking = false;
              this.currentUtterance = null;
              onFinished();
            });
          } else {
            this.speakFromIndex({
              words,
              startIndex: nextIndex,
              settings,
              onWordSync,
              onFinished,
              isPlayingCheck,
              getCurrentWpm,
              getWordsSlice,
              totalWords: effectiveTotalWords,
            });
          }
        }, pauseDelay);
      } else {
        this.isSpeaking = false;
        this.currentUtterance = null;
        onFinished();
      }
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      this.stopKeepAlive();
      this.clearFallbackTimer();
      activeUtterances.delete(utterance);

      if (this.activeUtteranceId !== utteranceId) return;

      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('Speech synthesis error:', event.error);

        // Auto-recover: do not stall the reader indefinitely!
        if (isPlayingCheck() && this.isSpeaking) {
          const nextIndex = this.activeChunkEndIndex + 1;
          if (nextIndex < effectiveTotalWords) {
            setTimeout(() => {
              if (isPlayingCheck() && this.isSpeaking && this.activeUtteranceId === utteranceId) {
                if (getWordsSlice) {
                  getWordsSlice(nextIndex, 30).then((slice) => {
                    if (slice.length > 0 && isPlayingCheck() && this.isSpeaking && this.activeUtteranceId === utteranceId) {
                      this.speakFromIndex({
                        words: slice,
                        startIndex: nextIndex,
                        settings,
                        onWordSync,
                        onFinished,
                        isPlayingCheck,
                        getCurrentWpm,
                        getWordsSlice,
                        totalWords: effectiveTotalWords,
                      });
                    } else {
                      this.isSpeaking = false;
                      onFinished();
                    }
                  }).catch(() => {
                    this.isSpeaking = false;
                    onFinished();
                  });
                } else {
                  this.speakFromIndex({
                    words,
                    startIndex: nextIndex,
                    settings,
                    onWordSync,
                    onFinished,
                    isPlayingCheck,
                    getCurrentWpm,
                    getWordsSlice,
                    totalWords: effectiveTotalWords,
                  });
                }
              }
            }, 80);
            return;
          }
        }
      }

      this.isSpeaking = false;
      this.currentUtterance = null;
      onFinished();
    };

    // 7. Speak the utterance with pause-resume safeguard for Chrome
    try {
      const activeSynth = this.getSynth();
      if (activeSynth) {
        if (activeSynth.paused) {
          activeSynth.resume();
        }
        activeSynth.speak(utterance);
        if (activeSynth.paused) {
          activeSynth.resume();
        }
      }
    } catch (err) {
      console.warn('Speech speak call failed:', err);
    }

    // 8. Setup fallback timer in case browser does not support onboundary events
    this.scheduleFallbackWordPacing({
      words: this.activeChunkWords,
      chunkStartIndex: startIndex,
      chunkEndIndex: this.activeChunkEndIndex,
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
    getWordsSlice,
    totalWords,
  }: {
    words: HighlightedWordParts[];
    index: number;
    settings: ReaderSettings;
    onWordSync: WordSyncCallback;
    onFinished: FinishedCallback;
    isPlayingCheck: () => boolean;
    utteranceId: number;
    getCurrentWpm?: () => number;
    getWordsSlice?: (startIndex: number, count: number) => Promise<HighlightedWordParts[]>;
    totalWords?: number;
  }): void {
    if (!isPlayingCheck() || this.activeUtteranceId !== utteranceId) return;

    const effectiveTotalWords = totalWords ?? words.length;
    if (index >= effectiveTotalWords) {
      this.isSpeaking = false;
      onFinished();
      return;
    }

    const hasIndexedWords = words.length > 0 && words.some(w => typeof w.index === 'number');
    let localIdx = -1;
    if (hasIndexedWords) {
      localIdx = words.findIndex((w) => w.index === index);
    } else if (index >= 0 && index < words.length) {
      localIdx = index;
    }

    if (localIdx === -1) {
      if (getWordsSlice) {
        getWordsSlice(index, 20).then((slice) => {
          if (slice.length > 0 && isPlayingCheck() && this.activeUtteranceId === utteranceId) {
            this.playPersianSynthWordByWord({
              words: slice,
              index,
              settings,
              onWordSync,
              onFinished,
              isPlayingCheck,
              utteranceId,
              getCurrentWpm,
              getWordsSlice,
              totalWords: effectiveTotalWords,
            });
          } else {
            this.isSpeaking = false;
            onFinished();
          }
        }).catch(() => {
          this.isSpeaking = false;
          onFinished();
        });
        return;
      }
      if (index >= 0 && index < words.length) {
        localIdx = index;
      } else {
        this.isSpeaking = false;
        onFinished();
        return;
      }
    }

    const currentWord = words[localIdx];
    if (!currentWord) {
      this.isSpeaking = false;
      onFinished();
      return;
    }

    const currentGlobalIdx = typeof currentWord.index === 'number' ? currentWord.index : index;
    onWordSync(currentGlobalIdx);

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
      const nextIdx = currentGlobalIdx + 1;
      if (nextIdx >= effectiveTotalWords) {
        this.isSpeaking = false;
        onFinished();
        return;
      }

      if (getWordsSlice && localIdx >= words.length - 2) {
        getWordsSlice(nextIdx, 20).then((slice) => {
          if (slice.length > 0 && isPlayingCheck() && this.activeUtteranceId === utteranceId) {
            this.playPersianSynthWordByWord({
              words: slice,
              index: nextIdx,
              settings,
              onWordSync,
              onFinished,
              isPlayingCheck,
              utteranceId,
              getCurrentWpm,
              getWordsSlice,
              totalWords: effectiveTotalWords,
            });
          } else {
            this.isSpeaking = false;
            onFinished();
          }
        }).catch(() => {
          this.isSpeaking = false;
          onFinished();
        });
      } else {
        this.playPersianSynthWordByWord({
          words,
          index: nextIdx,
          settings,
          onWordSync,
          onFinished,
          isPlayingCheck,
          utteranceId,
          getCurrentWpm,
          getWordsSlice,
          totalWords: effectiveTotalWords,
        });
      }
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
    if (this.boundarySupported) return;

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

        const word = words.find((w) => w.index === currentIdx) || (words[currentIdx] && (words[currentIdx].index === undefined || words[currentIdx].index === currentIdx) ? words[currentIdx] : words[0]);
        const delay = calculateWordDelayMs(word, effectiveWpm, settings.smartPunctuationPause, settings.smartPace);
        currentIdx++;

        this.fallbackTimer = setTimeout(stepWord, delay);
      }
    };

    const initialWord = words.find((w) => w.index === chunkStartIndex) || (words[chunkStartIndex] && (words[chunkStartIndex].index === undefined || words[chunkStartIndex].index === chunkStartIndex) ? words[chunkStartIndex] : words[0]);
    const wordDelay = calculateWordDelayMs(initialWord, effectiveWpm, settings.smartPunctuationPause, settings.smartPace);
    // 350ms grace window for the speech engine to emit onstart / onboundary before fallback pacing steps in
    const initialDelay = Math.max(350, wordDelay);

    this.fallbackTimer = setTimeout(stepWord, initialDelay);
  }
}

export const speechNarrator = new SpeechNarrationService();
