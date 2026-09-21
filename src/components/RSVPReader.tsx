import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  Rewind, 
  Zap, 
  CheckCircle2, 
  Clock, 
  Gauge, 
  Layers, 
  ChevronLeft, 
  ChevronRight,
  Crosshair,
  Volume2,
  VolumeX,
  Headphones,
  Sparkles,
  Flame,
  MoveHorizontal
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { HighlightedWordParts, ReaderSettings, ReadingHeatmapData, WarmupStatus } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS, FONT_CONFIGS } from '../utils/themeStyles';
import { calculateWordDelayMs } from '../utils/textParser';
import { analyzeWordSmartPace } from '../utils/smartPacing';
import { precalculateDriftOffsets } from '../utils/driftAnimation';
import { metronome } from '../utils/audioMetronome';
import { speechNarrator } from '../utils/speechNarration';
import { SpeedSliderToggle } from './SpeedSliderToggle';
import { RSVPMorphWord } from './RSVPMorphWord';
import { MetallicButton } from './MetallicButton';
import { ReadingHeatmapProgress } from './ReadingHeatmapProgress';
import { AutoPauseReason } from '../hooks/useSmartAutoPause';

interface RSVPReaderProps {
  words: HighlightedWordParts[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  onRestart: () => void;
  isIdle?: boolean;
  heatmapData?: ReadingHeatmapData;
  onResetHeatmap?: () => void;
  onOpenStatsModal?: () => void;
  isAutoPaused?: boolean;
  autoPauseReason?: AutoPauseReason | null;
  onResume?: () => void;
  warmupStatus?: WarmupStatus;
  onWordStep?: () => void;
  onSkipWarmup?: () => void;
  onResetWarmup?: () => void;
}

export const RSVPReader: React.FC<RSVPReaderProps> = ({
  words,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  settings,
  onUpdateSettings,
  onRestart,
  isIdle = false,
  heatmapData,
  onResetHeatmap,
  onOpenStatsModal,
  isAutoPaused = false,
  autoPauseReason = null,
  onResume,
  warmupStatus,
  onWordStep,
  onSkipWarmup,
  onResetWarmup,
}) => {
  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];
  const font = FONT_CONFIGS[settings.fontFamily];

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [hasFinished, setHasFinished] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentIndex);
  const settingsRef = useRef(settings);
  const wordsRef = useRef(words);
  const onTogglePlayRef = useRef(onTogglePlay);
  const onIndexChangeRef = useRef(onIndexChange);
  const warmupStatusRef = useRef(warmupStatus);
  const onWordStepRef = useRef(onWordStep);

  // Keep refs updated for timer recursion without re-binding
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
    settingsRef.current = settings;
    wordsRef.current = words;
    onTogglePlayRef.current = onTogglePlay;
    onIndexChangeRef.current = onIndexChange;
    warmupStatusRef.current = warmupStatus;
    onWordStepRef.current = onWordStep;
  }, [isPlaying, currentIndex, settings, words, onTogglePlay, onIndexChange, warmupStatus, onWordStep]);

  // Main playback loop (Web Speech API Narration OR Visual RSVP Timer)
  useEffect(() => {
    if (!isPlaying || words.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      speechNarrator.stop();
      return;
    }

    // MODE A: Web Speech API Narration (Voice-Over in Sync)
    if (settings.speechNarration) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      speechNarrator.speakFromIndex({
        words: wordsRef.current,
        startIndex: currentIndexRef.current,
        settings: settingsRef.current,
        getCurrentWpm: () => {
          if (warmupStatusRef.current?.isWarmingUp) {
            return warmupStatusRef.current.currentWpm;
          }
          return settingsRef.current.wpm;
        },
        onWordSync: (syncedIdx) => {
          onWordStepRef.current?.();
          onIndexChangeRef.current(syncedIdx);
          if (settingsRef.current.metronomeSound) {
            const currentW = wordsRef.current[syncedIdx];
            metronome.playTick(settingsRef.current.metronomeVolume, currentW?.hasSentenceEnd);
          }
        },
        onFinished: () => {
          onTogglePlayRef.current();
          setHasFinished(true);
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#a855f7'],
          });
        },
        isPlayingCheck: () => isPlayingRef.current,
      });

      return () => {
        speechNarrator.stop();
      };
    }

    // MODE B: Standard Visual RSVP Timer
    const scheduleNextWord = () => {
      if (!isPlayingRef.current) return;

      const currIdx = currentIndexRef.current;
      const allWords = wordsRef.current;

      if (currIdx >= allWords.length - 1) {
        // Reached the end of text!
        onTogglePlayRef.current();
        setHasFinished(true);
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#a855f7'],
        });
        return;
      }

      // Track word read in this session for Warm-up ramp
      onWordStepRef.current?.();

      // Always advance word-by-word so the vertical reel swipes to each word smoothly
      const nextIdx = Math.min(allWords.length - 1, currIdx + 1);
      onIndexChangeRef.current(nextIdx);

      // Play subtle metronome tick if enabled
      if (settingsRef.current.metronomeSound) {
        const nextWord = allWords[nextIdx];
        metronome.playTick(settingsRef.current.metronomeVolume, nextWord?.hasSentenceEnd);
      }

      // Determine effective speed (warm-up speed or configured target)
      const currentEffectiveWpm = warmupStatusRef.current?.isWarmingUp
        ? warmupStatusRef.current.currentWpm
        : settingsRef.current.wpm;

      // Calculate duration for this word with Smart Pace and natural punctuation pauses
      let wordDelay = calculateWordDelayMs(
        allWords[nextIdx],
        currentEffectiveWpm,
        settingsRef.current.smartPunctuationPause,
        settingsRef.current.smartPace
      );
      if (wordDelay <= 0) {
        wordDelay = (60 / currentEffectiveWpm) * 1000;
      }

      timerRef.current = setTimeout(scheduleNextWord, wordDelay);
    };

    // Calculate initial delay for the first word
    const currentEffectiveWpm = warmupStatusRef.current?.isWarmingUp
      ? warmupStatusRef.current.currentWpm
      : settings.wpm;

    const currentWord = words[currentIndexRef.current] || words[0];
    let initialDelay = calculateWordDelayMs(
      currentWord, 
      currentEffectiveWpm, 
      settings.smartPunctuationPause,
      settings.smartPace
    );
    if (initialDelay <= 0) {
      initialDelay = (60 / currentEffectiveWpm) * 1000;
    }

    if (settings.metronomeSound && currentWord) {
      metronome.playTick(settings.metronomeVolume, currentWord.hasSentenceEnd);
    }

    timerRef.current = setTimeout(scheduleNextWord, initialDelay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      speechNarrator.stop();
    };
  }, [
    isPlaying, 
    settings.speechNarration, 
    settings.speechVoiceURI, 
    settings.speechPitch, 
    settings.speechVolume, 
    settings.speechRateMultiplier, 
    settings.wpm, 
    settings.smartPunctuationPause, 
    settings.smartPace,
    settings.warmupMode,
    settings.metronomeSound, 
    settings.metronomeVolume, 
    words
  ]);

  // Handle manual jumps
  const handleJump = useCallback((offset: number) => {
    setHasFinished(false);
    const newIdx = Math.max(0, Math.min(words.length - 1, currentIndex + offset));
    onIndexChange(newIdx);

    if (settings.speechNarration && isPlaying) {
      speechNarrator.stop();
      speechNarrator.speakFromIndex({
        words: wordsRef.current,
        startIndex: newIdx,
        settings: settingsRef.current,
        getCurrentWpm: () => {
          if (warmupStatusRef.current?.isWarmingUp) {
            return warmupStatusRef.current.currentWpm;
          }
          return settingsRef.current.wpm;
        },
        onWordSync: (syncedIdx) => {
          onWordStepRef.current?.();
          onIndexChange(syncedIdx);
          if (settingsRef.current.metronomeSound) {
            metronome.playTick(settingsRef.current.metronomeVolume, wordsRef.current[syncedIdx]?.hasSentenceEnd);
          }
        },
        onFinished: () => {
          onTogglePlay();
          setHasFinished(true);
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#a855f7'],
          });
        },
        isPlayingCheck: () => isPlayingRef.current,
      });
    }
  }, [currentIndex, words.length, onIndexChange, settings.speechNarration, isPlaying, onTogglePlay]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setHasFinished(false);
    onIndexChange(val);

    if (settings.speechNarration && isPlaying) {
      speechNarrator.stop();
      speechNarrator.speakFromIndex({
        words: wordsRef.current,
        startIndex: val,
        settings: settingsRef.current,
        onWordSync: (syncedIdx) => {
          onIndexChange(syncedIdx);
          if (settingsRef.current.metronomeSound) {
            metronome.playTick(settingsRef.current.metronomeVolume, wordsRef.current[syncedIdx]?.hasSentenceEnd);
          }
        },
        onFinished: () => {
          onTogglePlay();
          setHasFinished(true);
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#a855f7'],
          });
        },
        isPlayingCheck: () => isPlayingRef.current,
      });
    }
  };

  const currentWord = words[currentIndex] || {
    original: '',
    prefixPunct: '',
    beforeHighlight: '',
    highlightedText: '',
    afterHighlight: '',
    suffixPunct: '',
    hasSentenceEnd: false,
    hasClausePause: false,
    hasParagraphBreak: false,
    index: 0,
  };

  const prevWord = currentIndex > 0 ? words[currentIndex - 1] : null;
  const nextWord = currentIndex < words.length - 1 ? words[currentIndex + 1] : null;

  const currentWordAnalysis = useMemo(() => {
    if (!settings.smartPace || !words[currentIndex]) return null;
    return analyzeWordSmartPace(words[currentIndex]);
  }, [settings.smartPace, words, currentIndex]);

  // Pre-calculated horizontal drift offsets to relieve fixed-point staring fatigue
  const driftOffsets = useMemo(() => {
    return precalculateDriftOffsets(words, settings.driftIntensity, settings.driftAnimation);
  }, [words, settings.driftIntensity, settings.driftAnimation]);

  const currentDriftOffset = settings.driftAnimation ? (driftOffsets[currentIndex] ?? 0) : 0;

  // Calculate progress & remaining time
  const progressPercent = words.length > 0 ? Math.round(((currentIndex + 1) / words.length) * 100) : 0;
  const wordsRemaining = Math.max(0, words.length - 1 - currentIndex);
  const secondsRemaining = Math.round((wordsRemaining / Math.max(1, settings.wpm)) * 60);
  const remainingMins = Math.floor(secondsRemaining / 60);
  const remainingSecs = secondsRemaining % 60;
  const formattedTimeRemaining = remainingMins > 0 ? `${remainingMins}m ${remainingSecs}s` : `${remainingSecs}s`;

  return (
    <div className="flex flex-col flex-1 w-full max-w-5xl mx-auto px-4 py-3 sm:py-6 justify-between select-none min-h-0 overflow-hidden relative">
      {/* Top Status & Context Info */}
      <div 
        className={`flex items-center justify-between gap-3 text-xs transition-all duration-700 ease-out shrink-0 z-20 ${
          isIdle ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} font-mono font-medium ${theme.textPrimary}`}>
            {currentIndex + 1} <span className={theme.textMuted}>/ {words.length}</span>
          </span>
          <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} ${theme.textMuted}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>{formattedTimeRemaining} left</span>
          </span>
        </div>

        {/* Word Size, Words per flash, Morph Toggle & Speed */}
        <div className="flex items-center gap-2">
          {/* Words per Flash (1, 3, 5 words in RSVP mode) */}
          <div 
            id="rsvp-word-count-selector"
            className={`flex items-center rounded-lg border ${theme.borderClass} ${theme.cardBgClass} p-0.5 text-xs font-mono`}
            title="RSVP Words shown per flash: 1, 3, or 5 words"
          >
            {([1, 3, 5] as const).map((count) => {
              const isSelected = (settings.chunkSize || 1) === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => onUpdateSettings({ chunkSize: count })}
                  title={`Show ${count} ${count === 1 ? 'word' : 'words'} per flash`}
                  aria-label={`Show ${count} words per flash`}
                  className={`px-2 py-0.5 rounded font-bold transition-all ${
                    isSelected
                      ? 'text-white shadow-xs'
                      : `${theme.textMuted} hover:${theme.textPrimary}`
                  }`}
                  style={isSelected ? { backgroundColor: highlight.hex } : undefined}
                >
                  {count}w
                </button>
              );
            })}
          </div>

          {/* Word Size Controller */}
          <div className={`flex items-center rounded-lg border ${theme.borderClass} ${theme.cardBgClass} p-0.5 text-xs font-mono`}>
            <button
              id="rsvp-font-decrease-btn"
              type="button"
              onClick={() => onUpdateSettings({ fontSize: Math.max(28, settings.fontSize - 4) })}
              title="Decrease word size (A-)"
              aria-label="Decrease word size"
              className={`px-2 py-0.5 rounded font-semibold ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              A-
            </button>
            <span className={`px-1.5 font-bold ${theme.textPrimary}`}>
              {settings.fontSize}px
            </span>
            <button
              id="rsvp-font-increase-btn"
              type="button"
              onClick={() => onUpdateSettings({ fontSize: Math.min(100, settings.fontSize + 4) })}
              title="Increase word size (A+)"
              aria-label="Increase word size"
              className={`px-2 py-0.5 rounded font-semibold ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              A+
            </button>
          </div>

          <button
            id="toggle-morph-transition-btn"
            type="button"
            onClick={() => onUpdateSettings({ morphTransition: !settings.morphTransition })}
            title={
              settings.morphTransition
                ? 'Liquid Text Morph Transition: ON (Click to toggle)'
                : 'Liquid Text Morph Transition: OFF (Click to toggle)'
            }
            aria-label="Toggle Liquid Morph Transition"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all ${
              settings.morphTransition
                ? 'font-bold shadow-xs'
                : `${theme.borderClass} ${theme.textMuted} opacity-70 hover:opacity-100`
            }`}
            style={
              settings.morphTransition
                ? {
                    borderColor: `${highlight.hex}60`,
                    color: highlight.hex,
                    backgroundColor: `${highlight.hex}18`,
                  }
                : undefined
            }
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Morph</span>
          </button>

          {/* Smart Pace Quick Toggle */}
          <button
            id="toggle-smart-pace-btn"
            type="button"
            onClick={() => onUpdateSettings({ smartPace: !settings.smartPace })}
            title={
              settings.smartPace
                ? 'Smart Pace: ON (Dynamically adapts speed to word complexity & length)'
                : 'Smart Pace: OFF (Click to enable)'
            }
            aria-label="Toggle Smart Pace"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all ${
              settings.smartPace
                ? 'font-bold shadow-xs'
                : `${theme.borderClass} ${theme.textMuted} opacity-70 hover:opacity-100`
            }`}
            style={
              settings.smartPace
                ? {
                    borderColor: `${highlight.hex}60`,
                    color: highlight.hex,
                    backgroundColor: `${highlight.hex}18`,
                  }
                : undefined
            }
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Smart Pace</span>
          </button>

          {/* Drift Animation Quick Toggle */}
          <button
            id="toggle-drift-animation-btn"
            type="button"
            onClick={() => onUpdateSettings({ driftAnimation: !settings.driftAnimation })}
            title={
              settings.driftAnimation
                ? `Drift Animation: ON (${settings.driftIntensity || 'moderate'}, shifts active word periodically to eliminate fixed-point eye strain)`
                : 'Drift Animation: OFF (Click to enable anti-fatigue ocular drift)'
            }
            aria-label="Toggle Drift Animation"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all ${
              settings.driftAnimation
                ? 'font-bold shadow-xs'
                : `${theme.borderClass} ${theme.textMuted} opacity-70 hover:opacity-100`
            }`}
            style={
              settings.driftAnimation
                ? {
                    borderColor: '#06b6d480',
                    color: '#22d3ee',
                    backgroundColor: '#06b6d418',
                  }
                : undefined
            }
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Drift</span>
          </button>

          {warmupStatus?.isWarmingUp ? (
            <div 
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-mono"
              title={`Warm-up Mode: Reading at ${warmupStatus.currentWpm} WPM, smoothly increasing to target ${settings.wpm} WPM (${warmupStatus.sessionWordsRead}/${warmupStatus.totalWarmupWords} words)`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="font-bold text-amber-300">{warmupStatus.currentWpm}</span>
              <span className="text-[10px] text-amber-400/80">→ {settings.wpm}</span>
              <span className="text-[10px] text-amber-400/60 hidden md:inline">({warmupStatus.sessionWordsRead}/300)</span>
              {onSkipWarmup && (
                <button
                  type="button"
                  onClick={onSkipWarmup}
                  className="ml-1 text-[10px] underline text-amber-200 hover:text-white"
                  title="Skip warm-up to reach target speed immediately"
                >
                  Skip
                </button>
              )}
            </div>
          ) : (
            <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} ${theme.textPrimary}`}>
              <span style={{ color: highlight.hex }}>{settings.wpm}</span> <span className={theme.textMuted}>WPM</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Center Reading Stage */}
      <div className="relative my-auto py-12 sm:py-20 flex flex-col items-center justify-center min-h-[300px] sm:min-h-[380px]">
        {/* Subtle Background Glow Focus Halo */}
        <div 
          className="absolute inset-0 max-w-lg mx-auto rounded-full blur-3xl pointer-events-none opacity-10 transition-colors"
          style={{ backgroundColor: highlight.hex }}
        />

        {/* Reticle Guides (Top & Bottom Center Markers) */}
        {settings.showReticleGuides && (
          <div className="w-full max-w-xl flex flex-col items-center pointer-events-none mb-4">
            <div className="w-full flex items-center justify-between px-4">
              <div className={`h-[1px] flex-1 ${theme.borderClass} border-t`} />
              <div 
                className="flex flex-col items-center mx-4 transition-transform duration-700 ease-out will-change-transform"
                style={{
                  transform: currentDriftOffset !== 0 ? `translateX(${currentDriftOffset}px)` : undefined,
                }}
              >
                <div 
                  className="w-1 h-3.5 rounded-full"
                  style={{ backgroundColor: highlight.hex }}
                />
              </div>
              <div className={`h-[1px] flex-1 ${theme.borderClass} border-t`} />
            </div>
          </div>
        )}

        {/* The Word Container */}
        {hasFinished ? (
          <div className="flex flex-col items-center text-center animate-in fade-in zoom-in duration-300 py-6">
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${highlight.hex}20`, color: highlight.hex }}
            >
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className={`text-2xl sm:text-3xl font-bold ${theme.textPrimary} mb-2`}>
              Reading Completed!
            </h2>
            <p className={`text-sm ${theme.textMuted} max-w-sm mb-6`}>
              You read <span className="font-semibold text-slate-200">{words.length} words</span> at{' '}
              <span className="font-semibold text-slate-200">{settings.wpm} WPM</span>.
            </p>
            <button
              id="restart-completed-btn"
              type="button"
              onClick={() => {
                setHasFinished(false);
                onRestart();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition-transform active:scale-95 shadow-md"
              style={{ backgroundColor: highlight.hex }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Read Again</span>
            </button>
          </div>
        ) : (
          <div 
            className="relative w-full max-w-3xl flex flex-col items-center justify-center transition-transform duration-700 ease-out will-change-transform"
            style={{
              transform: currentDriftOffset !== 0 ? `translateX(${currentDriftOffset}px)` : undefined,
            }}
          >
            {/* Optional Contextual Words (Faded previous and next) */}
            {settings.showContextWords && (
              <div className="w-full flex items-center justify-between px-4 text-xs font-mono opacity-25 mb-3 select-none">
                <span className="truncate max-w-[120px] text-right">
                  {prevWord ? prevWord.original : ''}
                </span>
                <span className="truncate max-w-[120px] text-left">
                  {nextWord ? nextWord.original : ''}
                </span>
              </div>
            )}

            {/* Word Display Box with Liquid Text Morph Transition & Vertical Looping Reel */}
            <RSVPMorphWord
              currentWord={currentWord}
              currentIndex={currentIndex}
              allWords={words}
              isPlaying={isPlaying}
              settings={settings}
              theme={theme}
              highlight={highlight}
              font={font}
              onIndexChange={onIndexChange}
            />
          </div>
        )}

        {/* Reticle Guides (Bottom Center Marker) */}
        {settings.showReticleGuides && !hasFinished && (
          <div className="w-full max-w-xl flex flex-col items-center pointer-events-none mt-4">
            <div className="w-full flex items-center justify-between px-4">
              <div className={`h-[1px] flex-1 ${theme.borderClass} border-t`} />
              <div 
                className="flex flex-col items-center mx-4 transition-transform duration-700 ease-out will-change-transform"
                style={{
                  transform: currentDriftOffset !== 0 ? `translateX(${currentDriftOffset}px)` : undefined,
                }}
              >
                <div 
                  className="w-1 h-3.5 rounded-full"
                  style={{ backgroundColor: highlight.hex }}
                />
              </div>
              <div className={`h-[1px] flex-1 ${theme.borderClass} border-t`} />
            </div>
          </div>
        )}
      </div>

      {/* Playback Controls & Timeline Bar */}
      <div 
        className={`w-full rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} p-4 sm:p-5 shadow-lg transition-all duration-700 ease-out shrink-0 z-20 ${
          isIdle ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Smart Auto-Pause Active Banner */}
        {isAutoPaused && !isPlaying && (
          <div
            id="smart-auto-pause-indicator"
            onClick={onResume || onTogglePlay}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onResume ? onResume() : onTogglePlay();
              }
            }}
            className="mb-3 px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3 cursor-pointer transition-all animate-in fade-in duration-200"
            title="Click to resume reading"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="font-semibold shrink-0">Smart Auto-Paused</span>
              <span className="text-amber-400/50 hidden sm:inline">•</span>
              <span className="text-amber-200/80 truncate text-[11px] sm:text-xs">
                {autoPauseReason === 'mouse'
                  ? 'Cursor moved outside the reading window'
                  : 'Window lost focus (tab switch)'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 font-medium text-[11px] sm:text-xs text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-lg hover:bg-amber-500/30 transition-colors">
              <span>Resume</span>
              <kbd className="px-1.5 py-0.2 rounded bg-black/40 text-[10px] font-mono text-amber-100">Space</kbd>
            </div>
          </div>
        )}

        {/* Timeline Scrubber / Reading Complexity Heatmap */}
        <div className="mb-4">
          {settings.showHeatmapProgress !== false && heatmapData ? (
            <ReadingHeatmapProgress
              words={words}
              currentIndex={currentIndex}
              onIndexChange={onIndexChange}
              heatmapData={heatmapData}
              theme={theme}
              highlightHex={highlight.hex}
              variant="inline"
              onResetHeatmap={onResetHeatmap}
              onOpenStatsModal={onOpenStatsModal}
            />
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono font-medium">
                <span className={theme.textMuted}>
                  Word {currentIndex + 1} of {words.length}
                </span>
                <span className={theme.textPrimary}>
                  {progressPercent}%
                </span>
              </div>

              <div className="relative flex items-center w-full">
                <input
                  id="reading-progress-slider"
                  type="range"
                  min="0"
                  max={Math.max(0, words.length - 1)}
                  value={currentIndex}
                  onChange={handleSeek}
                  aria-label="Reading progress"
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all"
                  style={{
                    background: `linear-gradient(to right, ${highlight.hex} 0%, ${highlight.hex} ${progressPercent}%, rgba(148, 163, 184, 0.2) ${progressPercent}%, rgba(148, 163, 184, 0.2) 100%)`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Restart & Step Rewind */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="rsvp-restart-btn"
              type="button"
              onClick={onRestart}
              title="Restart from beginning (R)"
              aria-label="Restart"
              className={`p-2.5 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              id="rsvp-rewind-10-btn"
              type="button"
              onClick={() => handleJump(-10)}
              title="Back 10 words (Left Arrow)"
              aria-label="Back 10 words"
              className={`flex items-center gap-1 px-3 py-2 rounded-xl border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} text-xs font-semibold transition-colors`}
            >
              <Rewind className="w-3.5 h-3.5" />
              <span>-10</span>
            </button>

            <button
              id="rsvp-prev-word-btn"
              type="button"
              onClick={() => handleJump(-1)}
              title="Previous Word"
              aria-label="Previous Word"
              className={`p-2.5 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Master Play / Pause Button (Metallic Shader UI) */}
          <MetallicButton
            id="rsvp-play-pause-btn"
            viewMode="icon"
            isPlaying={isPlaying}
            onClick={() => {
              setHasFinished(false);
              onTogglePlay();
            }}
            sheenColor={highlight.hex}
            title={isPlaying ? 'Pause reading (Space)' : (currentIndex >= words.length - 1 ? 'Read Again (Space)' : 'Play reading (Space)')}
          />


          {/* Forward & Audio Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="rsvp-next-word-btn"
              type="button"
              onClick={() => handleJump(1)}
              title="Next Word (Right Arrow)"
              aria-label="Next Word"
              className={`p-2.5 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              id="rsvp-forward-10-btn"
              type="button"
              onClick={() => handleJump(10)}
              title="Forward 10 words"
              aria-label="Forward 10 words"
              className={`flex items-center gap-1 px-3 py-2 rounded-xl border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} text-xs font-semibold transition-colors`}
            >
              <span>+10</span>
              <FastForward className="w-3.5 h-3.5" />
            </button>

            {/* Audio Metronome Toggle */}
            <button
              id="rsvp-metronome-toggle"
              type="button"
              onClick={() => onUpdateSettings({ metronomeSound: !settings.metronomeSound })}
              title={settings.metronomeSound ? 'Metronome sound enabled (Click to mute)' : 'Enable rhythmic focus metronome (S)'}
              aria-label="Toggle Metronome"
              className={`p-2.5 rounded-xl border transition-all ${
                settings.metronomeSound
                  ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold shadow-xs'
                  : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface}`
              }`}
            >
              {settings.metronomeSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Voice-Over Narration Toggle */}
            <button
              id="rsvp-voice-narration-toggle"
              type="button"
              onClick={() => onUpdateSettings({ speechNarration: !settings.speechNarration })}
              title={settings.speechNarration ? 'Voice-Over Narration is ON (Click to turn off)' : 'Enable Voice-Over Audio Narration (V)'}
              aria-label="Toggle Voice-Over Narration"
              className={`p-2.5 rounded-xl border transition-all ${
                settings.speechNarration
                  ? 'border-red-500 bg-red-500/15 text-red-400 font-bold shadow-xs ring-1 ring-red-500/30'
                  : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface}`
              }`}
            >
              <Headphones className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Speed Slider Toggle (Merged Speed Controller matching reference design) */}
        <div className={`mt-3 pt-3 border-t ${theme.borderClass}`}>
          <SpeedSliderToggle
            wpm={settings.wpm}
            onWpmChange={(wpm) => onUpdateSettings({ wpm })}
            highlightHex={highlight.hex}
            theme={theme}
            warmupStatus={warmupStatus}
            onSkipWarmup={onSkipWarmup}
            isSmartPaceEnabled={settings.smartPace}
            smartPaceAnalysis={currentWordAnalysis}
            onToggleSmartPace={() => onUpdateSettings({ smartPace: !settings.smartPace })}
            isDriftEnabled={settings.driftAnimation}
            driftOffset={currentDriftOffset}
            onToggleDrift={() => onUpdateSettings({ driftAnimation: !settings.driftAnimation })}
          />
        </div>
      </div>
    </div>
  );
};
