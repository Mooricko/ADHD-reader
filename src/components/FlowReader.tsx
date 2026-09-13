import React, { useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  Rewind, 
  Eye, 
  CheckCircle2, 
  Clock,
  Headphones
} from 'lucide-react';
import { HighlightedWordParts, ReaderSettings } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS, FONT_CONFIGS } from '../utils/themeStyles';
import { calculateWordDelayMs } from '../utils/textParser';
import { speechNarrator } from '../utils/speechNarration';

interface FlowReaderProps {
  words: HighlightedWordParts[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  onRestart: () => void;
  onSwitchToRsvp: () => void;
}

export const FlowReader: React.FC<FlowReaderProps> = ({
  words,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  settings,
  onUpdateSettings,
  onRestart,
  onSwitchToRsvp,
}) => {
  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];
  const font = FONT_CONFIGS[settings.fontFamily];
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentIndex);
  const settingsRef = useRef(settings);
  const wordsRef = useRef(words);
  const onTogglePlayRef = useRef(onTogglePlay);
  const onIndexChangeRef = useRef(onIndexChange);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
    settingsRef.current = settings;
    wordsRef.current = words;
    onTogglePlayRef.current = onTogglePlay;
    onIndexChangeRef.current = onIndexChange;
  }, [isPlaying, currentIndex, settings, words, onTogglePlay, onIndexChange]);

  // Playback timer & Speech Narration loop in Flow Mode
  useEffect(() => {
    if (!isPlaying || words.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      speechNarrator.stop();
      return;
    }

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
        },
        onFinished: () => {
          onTogglePlayRef.current();
        },
        isPlayingCheck: () => isPlayingRef.current,
      });

      return () => {
        speechNarrator.stop();
      };
    }

    // Standard auto-tracking timer loop
    const scheduleNextWord = () => {
      if (!isPlayingRef.current) return;

      const currIdx = currentIndexRef.current;
      const allWords = wordsRef.current;

      if (currIdx >= allWords.length - 1) {
        onTogglePlayRef.current();
        return;
      }

      const nextIdx = currIdx + 1;
      onIndexChangeRef.current(nextIdx);

      const currentWord = allWords[nextIdx];
      const delay = calculateWordDelayMs(
        currentWord,
        settingsRef.current.wpm,
        settingsRef.current.smartPunctuationPause
      );

      timerRef.current = setTimeout(scheduleNextWord, delay);
    };

    const currentWord = words[currentIndexRef.current] || words[0];
    const initialDelay = currentWord
      ? calculateWordDelayMs(currentWord, settings.wpm, settings.smartPunctuationPause)
      : (60 / settings.wpm) * 1000;

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
    words
  ]);

  // Auto-scroll to active word smoothly if playing
  useEffect(() => {
    if (activeWordRef.current && isPlaying) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentIndex, isPlaying]);

  const progressPercent = words.length > 0 ? Math.round(((currentIndex + 1) / words.length) * 100) : 0;
  const wordsRemaining = Math.max(0, words.length - 1 - currentIndex);
  const secondsRemaining = Math.round((wordsRemaining / Math.max(1, settings.wpm)) * 60);
  const remainingMins = Math.floor(secondsRemaining / 60);
  const remainingSecs = secondsRemaining % 60;
  const formattedTimeRemaining = remainingMins > 0 ? `${remainingMins}m ${remainingSecs}s` : `${remainingSecs}s`;

  return (
    <div className="flex flex-col flex-1 w-full max-w-4xl mx-auto px-4 py-4 sm:py-6 justify-between">
      {/* Top Controls & Meta */}
      <div className="flex items-center justify-between gap-4 text-xs mb-4">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} font-mono font-medium ${theme.textPrimary}`}>
            {currentIndex + 1} <span className={theme.textMuted}>/ {words.length}</span>
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} ${theme.textMuted}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>{formattedTimeRemaining} left</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="flow-switch-to-rsvp-btn"
            type="button"
            onClick={onSwitchToRsvp}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} transition-colors font-medium`}
          >
            <Eye className="w-3.5 h-3.5 text-red-500" />
            <span>Switch to RSVP Flash</span>
          </button>
        </div>
      </div>

      {/* Full Document Flow Content */}
      <div 
        ref={containerRef}
        id="flow-text-container"
        className={`flex-1 overflow-y-auto rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} p-6 sm:p-10 my-2 shadow-inner leading-relaxed select-text ${font.className}`}
        style={{
          fontSize: `${settings.flowFontSize || 22}px`,
          lineHeight: settings.lineHeight || 1.8,
          letterSpacing: `${settings.letterSpacing || 0.02}em`,
        }}
      >
        <div className="max-w-3xl mx-auto">
          {(() => {
            const isTextRtl = words.length > 0 && Boolean(words[0].isRtl || words.some((w) => w.isRtl));
            return (
              <p 
                className={`inline ${isTextRtl && settings.fontFamily !== 'vazirmatn' ? 'font-vazirmatn' : ''}`}
                dir={isTextRtl ? 'rtl' : 'ltr'}
              >
                {words.map((word, idx) => {
                  const isActive = idx === currentIndex;
                  const isPast = idx < currentIndex;

                  return (
                    <React.Fragment key={idx}>
                      <span
                        ref={isActive ? activeWordRef : null}
                        onClick={() => onIndexChange(idx)}
                        title={`Word #${idx + 1}: Click to start reading here`}
                        dir={word.isRtl ? 'rtl' : 'ltr'}
                        className={`inline-block cursor-pointer transition-all px-0.5 rounded ${
                          isActive
                            ? `ring-2 ring-red-500 ring-offset-2 ring-offset-black bg-red-500/15 font-semibold scale-105 shadow-xs`
                            : isPast && isPlaying
                            ? 'opacity-80 hover:opacity-100'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <span className={theme.textPrimary}>
                          {word.prefixPunct + word.beforeHighlight}
                        </span>
                        <span 
                          className="font-bold transition-colors"
                          style={{ color: highlight.hex }}
                        >
                          {word.highlightedText}
                        </span>
                        <span className={theme.textPrimary}>
                          {word.afterHighlight + word.suffixPunct}
                        </span>
                      </span>
                      {' '}
                      {word.hasParagraphBreak && (
                        <span className="block h-6 sm:h-8" />
                      )}
                    </React.Fragment>
                  );
                })}
              </p>
            );
          })()}
        </div>
      </div>

      {/* Bottom Sticky Control Strip */}
      <div className={`mt-4 rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} p-4 shadow-lg flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-2">
          <button
            id="flow-restart-btn"
            type="button"
            onClick={onRestart}
            title="Restart from beginning"
            aria-label="Restart"
            className={`p-2 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} transition-colors`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className={`text-xs font-mono ${theme.textMuted}`}>
            {progressPercent}% completed
          </span>
        </div>

        {/* Play/Pause */}
        <button
          id="flow-play-pause-btn"
          type="button"
          onClick={onTogglePlay}
          className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white shadow-md transition-transform active:scale-95 text-sm"
          style={{ backgroundColor: highlight.hex }}
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 fill-current" />
              <span>Pause Tracker</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Auto-Track Reading</span>
            </>
          )}
        </button>

        {/* Speed Adjustment */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${theme.textMuted}`}>Speed:</span>
          <div className={`flex items-center rounded-xl border ${theme.borderClass} p-0.5`}>
            <button
              type="button"
              onClick={() => onUpdateSettings({ wpm: Math.max(60, settings.wpm - 25) })}
              className={`px-2 py-1 rounded text-xs font-bold ${theme.textMuted} hover:${theme.textPrimary}`}
            >
              -
            </button>
            <span className={`px-2 text-xs font-mono font-bold ${theme.textPrimary}`}>
              {settings.wpm}
            </span>
            <button
              type="button"
              onClick={() => onUpdateSettings({ wpm: Math.min(1000, settings.wpm + 25) })}
              className={`px-2 py-1 rounded text-xs font-bold ${theme.textMuted} hover:${theme.textPrimary}`}
            >
              +
            </button>
          </div>

          {/* Quick Voice-Over Narration Toggle */}
          <button
            id="flow-voice-toggle-btn"
            type="button"
            onClick={() => onUpdateSettings({ speechNarration: !settings.speechNarration })}
            title={settings.speechNarration ? 'Voice-Over Narration is ON (Click to turn off)' : 'Enable Voice-Over Audio Narration'}
            aria-label="Toggle Voice-Over Narration"
            className={`p-2 rounded-xl border transition-all ${
              settings.speechNarration
                ? 'border-red-500 bg-red-500/15 text-red-400 font-bold shadow-xs'
                : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <Headphones className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
