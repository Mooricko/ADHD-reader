import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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
  Headphones
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { HighlightedWordParts, ReaderSettings } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS, FONT_CONFIGS } from '../utils/themeStyles';
import { calculateWordDelayMs } from '../utils/textParser';
import { metronome } from '../utils/audioMetronome';
import { speechNarrator } from '../utils/speechNarration';
import { SpeedSliderToggle } from './SpeedSliderToggle';

interface RSVPReaderProps {
  words: HighlightedWordParts[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  onRestart: () => void;
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

  // Keep refs updated for timer recursion without re-binding
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
    settingsRef.current = settings;
    wordsRef.current = words;
    onTogglePlayRef.current = onTogglePlay;
    onIndexChangeRef.current = onIndexChange;
  }, [isPlaying, currentIndex, settings, words, onTogglePlay, onIndexChange]);

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
        onWordSync: (syncedIdx) => {
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

      const nextIdx = currIdx + 1;
      onIndexChangeRef.current(nextIdx);

      // Play subtle metronome tick if enabled
      if (settingsRef.current.metronomeSound) {
        const nextWord = allWords[nextIdx];
        metronome.playTick(settingsRef.current.metronomeVolume, nextWord?.hasSentenceEnd);
      }

      const currentWord = allWords[nextIdx];
      const delay = calculateWordDelayMs(
        currentWord,
        settingsRef.current.wpm,
        settingsRef.current.smartPunctuationPause
      );

      timerRef.current = setTimeout(scheduleNextWord, delay);
    };

    // Calculate initial delay for the first word
    const currentWord = words[currentIndexRef.current] || words[0];
    const initialDelay = currentWord
      ? calculateWordDelayMs(currentWord, settings.wpm, settings.smartPunctuationPause)
      : (60 / settings.wpm) * 1000;

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

  const wordContainerRef = useRef<HTMLDivElement>(null);
  const highlightSpanRef = useRef<HTMLSpanElement>(null);
  const [orpOffset, setOrpOffset] = useState<number>(0);

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

  // Compute optical center lock offset to align the focal highlight with the reticle center marker
  useLayoutEffect(() => {
    if (!settings.opticalCenterLock || !wordContainerRef.current || !highlightSpanRef.current) {
      setOrpOffset(0);
      return;
    }

    const wordEl = wordContainerRef.current;
    const hlEl = highlightSpanRef.current;

    const wordCenter = wordEl.offsetWidth / 2;
    const hlCenter = hlEl.offsetLeft + hlEl.offsetWidth / 2;
    const targetOffset = wordCenter - hlCenter;

    setOrpOffset(targetOffset);
  }, [
    currentIndex,
    settings.opticalCenterLock,
    settings.fontSize,
    currentWord.original,
    currentWord.beforeHighlight,
    currentWord.highlightedText,
    currentWord.afterHighlight,
  ]);

  const prevWord = currentIndex > 0 ? words[currentIndex - 1] : null;
  const nextWord = currentIndex < words.length - 1 ? words[currentIndex + 1] : null;

  // Calculate progress & remaining time
  const progressPercent = words.length > 0 ? Math.round(((currentIndex + 1) / words.length) * 100) : 0;
  const wordsRemaining = Math.max(0, words.length - 1 - currentIndex);
  const secondsRemaining = Math.round((wordsRemaining / Math.max(1, settings.wpm)) * 60);
  const remainingMins = Math.floor(secondsRemaining / 60);
  const remainingSecs = secondsRemaining % 60;
  const formattedTimeRemaining = remainingMins > 0 ? `${remainingMins}m ${remainingSecs}s` : `${remainingSecs}s`;

  return (
    <div className="flex flex-col flex-1 w-full max-w-5xl mx-auto px-4 py-4 sm:py-8 justify-between select-none">
      {/* Top Status & Context Info */}
      <div className="flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} font-mono font-medium ${theme.textPrimary}`}>
            {currentIndex + 1} <span className={theme.textMuted}>/ {words.length}</span>
          </span>
          <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} ${theme.textMuted}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>{formattedTimeRemaining} left</span>
          </span>
        </div>

        {/* Current Speed Indicator Badge */}
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} ${theme.textPrimary}`}>
            <span style={{ color: highlight.hex }}>{settings.wpm}</span> <span className={theme.textMuted}>WPM</span>
          </span>
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
              <div className="flex flex-col items-center mx-4">
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
          <div className="relative w-full max-w-3xl flex flex-col items-center justify-center">
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

            {/* Word Display Box */}
            <div 
              id="rsvp-word-display"
              className={`w-full flex items-baseline justify-center tracking-normal relative overflow-visible ${
                currentWord.isRtl && settings.fontFamily !== 'vazirmatn' ? 'font-vazirmatn' : font.className
              }`}
              style={{ 
                fontSize: `${settings.fontSize}px`,
                lineHeight: 1.2,
              }}
            >
              {/* Seamless Contiguous Word Block (Preserves cursive Persian/Arabic ligatures & LTR layout) */}
              <div
                ref={wordContainerRef}
                dir={currentWord.isRtl ? 'rtl' : 'ltr'}
                className="inline-flex items-baseline justify-center whitespace-nowrap will-change-transform"
                style={{
                  transform: settings.opticalCenterLock && orpOffset !== 0 ? `translateX(${orpOffset}px)` : undefined,
                  transition: isPlaying ? 'none' : 'transform 75ms ease-out',
                }}
              >
                <span className={theme.textPrimary}>
                  {currentWord.prefixPunct + currentWord.beforeHighlight}
                </span>
                <span 
                  ref={highlightSpanRef}
                  className={currentWord.isRtl ? "font-bold transition-colors" : "font-bold px-[0.5px] transition-colors"}
                  style={{ color: highlight.hex }}
                >
                  {currentWord.highlightedText}
                </span>
                <span className={theme.textPrimary}>
                  {currentWord.afterHighlight + currentWord.suffixPunct}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reticle Guides (Bottom Center Marker) */}
        {settings.showReticleGuides && !hasFinished && (
          <div className="w-full max-w-xl flex flex-col items-center pointer-events-none mt-4">
            <div className="w-full flex items-center justify-between px-4">
              <div className={`h-[1px] flex-1 ${theme.borderClass} border-t`} />
              <div className="flex flex-col items-center mx-4">
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
      <div className={`w-full rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} p-4 sm:p-5 shadow-lg`}>
        {/* Timeline Scrubber */}
        <div className="space-y-1.5 mb-4">
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

          {/* Master Play / Pause Button */}
          <button
            id="rsvp-play-pause-btn"
            type="button"
            onClick={() => {
              setHasFinished(false);
              onTogglePlay();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-white shadow-md transition-transform active:scale-95 text-base"
            style={{ backgroundColor: highlight.hex }}
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current ml-0.5" />
                <span>{currentIndex >= words.length - 1 ? 'Read Again' : 'Play'}</span>
              </>
            )}
            <span className="hidden sm:inline-block text-[11px] font-normal opacity-80 border-l border-white/30 pl-2 ml-1">
              Space
            </span>
          </button>

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
          />
        </div>
      </div>
    </div>
  );
};
