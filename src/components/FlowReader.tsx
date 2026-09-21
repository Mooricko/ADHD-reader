import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { 
  RotateCcw, 
  Eye, 
  Clock,
  Headphones,
  Volume2,
  VolumeX,
  Focus,
  Zap,
  Flame
} from 'lucide-react';
import { HighlightedWordParts, ReaderSettings, ReadingHeatmapData, WarmupStatus } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS, FONT_CONFIGS } from '../utils/themeStyles';
import { calculateWordDelayMs } from '../utils/textParser';
import { analyzeWordSmartPace } from '../utils/smartPacing';
import { metronome } from '../utils/audioMetronome';
import { speechNarrator } from '../utils/speechNarration';
import { SpeedSliderToggle } from './SpeedSliderToggle';
import { MetallicButton } from './MetallicButton';
import { MarkerHighlight } from './MarkerHighlight';
import { ReadingHeatmapProgress } from './ReadingHeatmapProgress';
import { LayoutGroup } from 'motion/react';
import { measureDevTiming } from '../utils/performanceDiagnostics';

import { ReaderDocumentHandle } from '../types';

interface FlowReaderProps {
  words: HighlightedWordParts[];
  totalWords?: number;
  handle?: ReaderDocumentHandle | null;
  getWordsSlice?: (startIndex: number, count: number) => Promise<HighlightedWordParts[]>;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  onRestart: () => void;
  onSwitchToRsvp: () => void;
  isIdle?: boolean;
  heatmapData?: ReadingHeatmapData;
  onResetHeatmap?: () => void;
  onOpenStatsModal?: () => void;
  warmupStatus?: WarmupStatus;
  onWordStep?: () => void;
  onSkipWarmup?: () => void;
  onResetWarmup?: () => void;
}

interface ParagraphGroup {
  paragraphIndex: number;
  words: Array<{ word: HighlightedWordParts; globalIndex: number }>;
}

export const FlowReader: React.FC<FlowReaderProps> = ({
  words,
  totalWords: customTotalWords,
  handle: _handle,
  getWordsSlice,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  settings,
  onUpdateSettings,
  onRestart,
  onSwitchToRsvp,
  isIdle = false,
  heatmapData,
  onResetHeatmap,
  onOpenStatsModal,
  warmupStatus,
  onWordStep,
  onSkipWarmup,
  onResetWarmup,
}) => {
  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];
  const font = FONT_CONFIGS[settings.fontFamily];
  
  const effectiveTotalWords = customTotalWords !== undefined ? customTotalWords : words.length;

  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const paragraphRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Hover tracking for floating highlighter pillow and paragraph focus
  const [hoveredWordIndex, setHoveredWordIndex] = useState<number | null>(null);
  const [hoveredParagraphIndex, setHoveredParagraphIndex] = useState<number | null>(null);

  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentIndex);
  const settingsRef = useRef(settings);
  const wordsRef = useRef(words);
  const effectiveTotalWordsRef = useRef(effectiveTotalWords);
  const getWordsSliceRef = useRef(getWordsSlice);
  const onTogglePlayRef = useRef(onTogglePlay);
  const onIndexChangeRef = useRef(onIndexChange);
  const warmupStatusRef = useRef(warmupStatus);
  const onWordStepRef = useRef(onWordStep);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
    settingsRef.current = settings;
    wordsRef.current = words;
    effectiveTotalWordsRef.current = effectiveTotalWords;
    getWordsSliceRef.current = getWordsSlice;
    onTogglePlayRef.current = onTogglePlay;
    onIndexChangeRef.current = onIndexChange;
    warmupStatusRef.current = warmupStatus;
    onWordStepRef.current = onWordStep;
  }, [isPlaying, currentIndex, settings, words, effectiveTotalWords, getWordsSlice, onTogglePlay, onIndexChange, warmupStatus, onWordStep]);

  // Group words by paragraphIndex for paragraph-level focus blur and centering
  const paragraphGroups = useMemo<ParagraphGroup[]>(() => {
    if (!words || words.length === 0) return [];

    return measureDevTiming(
      'FlowReader paragraph grouping',
      () => {
        const groups: ParagraphGroup[] = [];
        let currentGroup: ParagraphGroup | null = null;

        words.forEach((w, idx) => {
          const pIdx = w.paragraphIndex ?? 0;
          const globalIdx = w.index !== undefined ? w.index : idx;
          if (!currentGroup || currentGroup.paragraphIndex !== pIdx) {
            if (currentGroup) {
              groups.push(currentGroup);
            }
            currentGroup = { paragraphIndex: pIdx, words: [] };
          }
          currentGroup.words.push({ word: w, globalIndex: globalIdx });
        });

        if (currentGroup) {
          groups.push(currentGroup);
        }

        return groups;
      },
      (groups) => ({
        wordCount: words.length,
        paragraphCount: groups.length,
      })
    );
  }, [words]);

  // Determine current active paragraph index from currentIndex
  const activeWord = words.find(w => w.index === currentIndex) || words[currentIndex] || words[0];
  const activeParagraphIndex = activeWord?.paragraphIndex ?? 0;

  const currentWordAnalysis = useMemo(() => {
    if (!settings.smartPace || !words[currentIndex]) return null;
    return analyzeWordSmartPace(words[currentIndex]);
  }, [settings.smartPace, words, currentIndex]);

  // Auto-scroll unblurred active paragraph to center of viewport
  const scrollToActiveParagraph = useCallback((smooth = true) => {
    const pEl = paragraphRefs.current[activeParagraphIndex];
    if (pEl && containerRef.current) {
      pEl.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'center',
      });
    }
  }, [activeParagraphIndex]);

  const lastCenteredParagraphRef = useRef<number>(-1);

  // Center active paragraph on paragraph change or while playing
  useEffect(() => {
    if (lastCenteredParagraphRef.current !== activeParagraphIndex || isPlaying || settings.focusParagraphBlur) {
      lastCenteredParagraphRef.current = activeParagraphIndex;
      scrollToActiveParagraph(true);
    }
  }, [activeParagraphIndex, isPlaying, settings.focusParagraphBlur, scrollToActiveParagraph]);

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
        totalWords: effectiveTotalWordsRef.current,
        getWordsSlice: getWordsSliceRef.current,
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
      const totalCount = effectiveTotalWordsRef.current;

      if (currIdx >= totalCount - 1) {
        onTogglePlayRef.current();
        return;
      }

      onWordStepRef.current?.();
      const nextIdx = Math.min(totalCount - 1, currIdx + 1);
      onIndexChangeRef.current(nextIdx);

      const allWords = wordsRef.current;
      const currentWordObj = allWords.find(w => w.index === nextIdx) || allWords[nextIdx];
      
      // Audio metronome tick synchronization
      if (settingsRef.current.metronomeSound && currentWordObj) {
        metronome.playTick(settingsRef.current.metronomeVolume, currentWordObj?.hasSentenceEnd);
      }

      const effectiveWpm = warmupStatusRef.current?.isWarmingUp
        ? warmupStatusRef.current.currentWpm
        : settingsRef.current.wpm;

      const delay = currentWordObj
        ? calculateWordDelayMs(
            currentWordObj,
            effectiveWpm,
            settingsRef.current.smartPunctuationPause,
            settingsRef.current.smartPace
          )
        : (60 / effectiveWpm) * 1000;

      timerRef.current = setTimeout(scheduleNextWord, delay);
    };

    const effectiveWpm = warmupStatusRef.current?.isWarmingUp
      ? warmupStatusRef.current.currentWpm
      : settings.wpm;

    const currentWordObj = words.find(w => w.index === currentIndexRef.current) || words[currentIndexRef.current] || words[0];
    const initialDelay = currentWordObj
      ? calculateWordDelayMs(currentWordObj, effectiveWpm, settings.smartPunctuationPause, settings.smartPace)
      : (60 / effectiveWpm) * 1000;

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
    words,
    effectiveTotalWords
  ]);

  const progressPercent = effectiveTotalWords > 0 ? Math.round(((currentIndex + 1) / effectiveTotalWords) * 100) : 0;
  const wordsRemaining = Math.max(0, effectiveTotalWords - 1 - currentIndex);
  const secondsRemaining = Math.round((wordsRemaining / Math.max(1, settings.wpm)) * 60);
  const remainingMins = Math.floor(secondsRemaining / 60);
  const remainingSecs = secondsRemaining % 60;
  const formattedTimeRemaining = remainingMins > 0 ? `${remainingMins}m ${remainingSecs}s` : `${remainingSecs}s`;

  // The targeted word for the floating marker highlighter pillow:
  // Follows the user's cursor position when hovering, or defaults to current reading word
  const targetWordIndex = hoveredWordIndex !== null ? hoveredWordIndex : currentIndex;

  const isTextRtl = words.length > 0 && Boolean(words[0].isRtl || words.some((w) => w.isRtl));

  return (
    <div className="flex flex-col flex-1 w-full max-w-4xl mx-auto px-4 py-3 sm:py-4 justify-between h-full min-h-0 overflow-hidden relative select-none">
      {/* Top Controls & Meta (with 5-second mouse idle fade-out) */}
      <div 
        className={`flex flex-wrap items-center justify-between gap-3 text-xs mb-3 transition-all duration-700 ease-out shrink-0 z-20 ${
          isIdle ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} font-mono font-medium ${theme.textPrimary}`}>
            {currentIndex + 1} <span className={theme.textMuted}>/ {effectiveTotalWords}</span>
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${theme.borderClass} ${theme.cardBgClass} ${theme.textMuted}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>{formattedTimeRemaining} left</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Word Size Controller (Matching RSVP Mode) */}
          <div className={`flex items-center rounded-lg border ${theme.borderClass} ${theme.cardBgClass} p-0.5 text-xs font-mono`}>
            <button
              id="flow-font-decrease-btn"
              type="button"
              onClick={() => onUpdateSettings({ flowFontSize: Math.max(14, (settings.flowFontSize || 22) - 2) })}
              title="Decrease word size (A-)"
              aria-label="Decrease word size"
              className={`px-2 py-0.5 rounded font-semibold ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              A-
            </button>
            <span className={`px-1.5 font-bold ${theme.textPrimary}`}>
              {settings.flowFontSize || 22}px
            </span>
            <button
              id="flow-font-increase-btn"
              type="button"
              onClick={() => onUpdateSettings({ flowFontSize: Math.min(52, (settings.flowFontSize || 22) + 2) })}
              title="Increase word size (A+)"
              aria-label="Increase word size"
              className={`px-2 py-0.5 rounded font-semibold ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              A+
            </button>
          </div>

          {/* Paragraph Blur Focus Toggle (Item 3) */}
          <button
            id="toggle-paragraph-blur-btn"
            type="button"
            onClick={() => onUpdateSettings({ focusParagraphBlur: !settings.focusParagraphBlur })}
            title={
              settings.focusParagraphBlur
                ? 'Paragraph Focus Blur: ON (Only active or hovered paragraph is unblurred)'
                : 'Paragraph Focus Blur: OFF (Click to focus on one paragraph at a time)'
            }
            aria-label="Toggle Paragraph Blur Focus"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
              settings.focusParagraphBlur
                ? 'font-bold shadow-xs'
                : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface}`
            }`}
            style={
              settings.focusParagraphBlur
                ? {
                    borderColor: `${highlight.hex}80`,
                    color: highlight.hex,
                    backgroundColor: `${highlight.hex}18`,
                  }
                : undefined
            }
          >
            <Focus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paragraph Focus</span>
            <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold ${
              settings.focusParagraphBlur ? 'bg-red-500/20 text-red-400' : 'bg-white/10'
            }`}>
              {settings.focusParagraphBlur ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Switch to RSVP View Button */}
          <button
            id="flow-switch-to-rsvp-btn"
            type="button"
            onClick={onSwitchToRsvp}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} transition-colors font-medium`}
          >
            <Eye className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden sm:inline">Switch to RSVP</span>
          </button>
        </div>
      </div>

      {/* Main Reading Stage & Text Scroll Container (Item 1 & Item 5: Locked player panel, text itself scrolls on RSVP background) */}
      <div 
        ref={containerRef}
        id="flow-text-container"
        onMouseLeave={() => {
          setHoveredWordIndex(null);
          setHoveredParagraphIndex(null);
        }}
        className={`flex-1 min-h-0 overflow-y-auto px-2 sm:px-6 py-4 sm:py-8 select-text leading-relaxed relative ${font.className} scroll-smooth`}
        style={{
          fontSize: `${settings.flowFontSize || 22}px`,
          lineHeight: settings.lineHeight || 1.8,
          letterSpacing: `${settings.letterSpacing || 0.02}em`,
        }}
      >
        {/* Ambient Glow Focus Halo (Matching RSVP background) */}
        <div 
          className="absolute inset-0 max-w-2xl mx-auto rounded-full blur-3xl pointer-events-none opacity-10 transition-colors"
          style={{ backgroundColor: highlight.hex }}
        />

        {/* Flow Content Rendered by Paragraphs */}
        <LayoutGroup id="flow-reader-marker">
          <div 
            className={`max-w-3xl mx-auto relative z-10 ${isTextRtl && settings.fontFamily !== 'vazirmatn' ? 'font-vazirmatn' : ''}`}
            dir={isTextRtl ? 'rtl' : 'ltr'}
            onMouseLeave={() => {
              setHoveredWordIndex(null);
              setHoveredParagraphIndex(null);
            }}
          >
            {paragraphGroups.map((group, groupIdx) => {
              // Determine if this paragraph is unblurred (Item 3)
              const isParagraphUnblurred =
                !settings.focusParagraphBlur ||
                group.paragraphIndex === hoveredParagraphIndex ||
                (hoveredParagraphIndex === null && group.paragraphIndex === activeParagraphIndex);

              return (
                <div
                  key={`para-${group.paragraphIndex}-${groupIdx}`}
                  ref={(el) => {
                    paragraphRefs.current[group.paragraphIndex] = el;
                  }}
                  onMouseEnter={() => setHoveredParagraphIndex(group.paragraphIndex)}
                  className={`my-4 sm:my-6 transition-all duration-300 leading-relaxed ${
                    isParagraphUnblurred
                      ? 'opacity-100 blur-0'
                      : 'opacity-25 blur-[5px] select-none pointer-events-auto'
                  }`}
                >
                  {group.words.map((item) => {
                    const isTarget = item.globalIndex === targetWordIndex;
                    const isAudioCurrent = item.globalIndex === currentIndex;
                    const isPast = item.globalIndex < currentIndex;

                    if (isTarget) {
                      return (
                        <span
                          key={`w-${item.globalIndex}`}
                          ref={isAudioCurrent ? activeWordRef : null}
                          onClick={() => onIndexChange(item.globalIndex)}
                          onMouseEnter={() => setHoveredWordIndex(item.globalIndex)}
                          title={`Word #${item.globalIndex + 1}: Click to start reading here`}
                          dir={item.word.isRtl ? 'rtl' : 'ltr'}
                          className="inline-block cursor-pointer align-baseline mx-[1px]"
                        >
                          {/* Marker Highlight Floating Pill (Gradient Oval with Smooth Animated Transition) */}
                          <MarkerHighlight
                            highlight={item.word.original}
                            markerColor={highlight.hex}
                            isRtl={Boolean(item.word.isRtl)}
                            isActive={true}
                            className="font-bold"
                          />
                        </span>
                      );
                    }

                    return (
                      <span
                        key={`w-${item.globalIndex}`}
                        ref={isAudioCurrent ? activeWordRef : null}
                        onClick={() => onIndexChange(item.globalIndex)}
                        onMouseEnter={() => setHoveredWordIndex(item.globalIndex)}
                        title={`Word #${item.globalIndex + 1}: Click to start reading here`}
                        dir={item.word.isRtl ? 'rtl' : 'ltr'}
                        className={`inline-block cursor-pointer px-1 py-0.5 rounded transition-all align-baseline ${
                          isPast && isPlaying
                            ? 'opacity-70 hover:opacity-100'
                            : `${theme.textPrimary} hover:text-white hover:bg-white/5`
                        }`}
                      >
                        {item.word.original}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {/* Bottom Sticky Player Panel (Item 5: Locked on page; Item 8: Fades out after 5s mouse inactivity) */}
      <div 
        className={`mt-3 rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} p-4 shadow-lg flex flex-col gap-3 transition-all duration-700 ease-out shrink-0 z-20 ${
          isIdle ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Visual Reading Progress Indicator (Complexity Heatmap) */}
        {settings.showHeatmapProgress !== false && heatmapData && (
          <div className="pb-1 border-b border-white/5">
            <ReadingHeatmapProgress
              words={words}
              totalWords={effectiveTotalWords}
              currentIndex={currentIndex}
              onIndexChange={onIndexChange}
              heatmapData={heatmapData}
              theme={theme}
              highlightHex={highlight.hex}
              variant="inline"
              onResetHeatmap={onResetHeatmap}
              onOpenStatsModal={onOpenStatsModal}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              id="flow-restart-btn"
              type="button"
              onClick={onRestart}
              title="Restart from beginning"
              aria-label="Restart"
              className={`p-2.5 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              {progressPercent}% completed
            </span>
          </div>

          {/* Play/Pause (Metallic Shader UI) */}
          <MetallicButton
            id="flow-play-pause-btn"
            viewMode="icon"
            isPlaying={isPlaying}
            onClick={onTogglePlay}
            sheenColor={highlight.hex}
            title={isPlaying ? 'Pause Tracker (Space)' : 'Auto-Track Reading (Space)'}
          />

          {/* Audio Controls (Metronome + Voice-Over Narration) */}
          <div className="flex items-center gap-2">
            {/* Audio Metronome Toggle */}
            <button
              id="flow-metronome-toggle-btn"
              type="button"
              onClick={() => onUpdateSettings({ metronomeSound: !settings.metronomeSound })}
              title={settings.metronomeSound ? 'Metronome sound enabled (Click to mute)' : 'Enable rhythmic focus metronome'}
              aria-label="Toggle Metronome"
              className={`p-2.5 rounded-xl border transition-all ${
                settings.metronomeSound
                  ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold shadow-xs'
                  : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface}`
              }`}
            >
              {settings.metronomeSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Quick Voice-Over Narration Toggle */}
            <button
              id="flow-voice-toggle-btn"
              type="button"
              onClick={() => onUpdateSettings({ speechNarration: !settings.speechNarration })}
              title={settings.speechNarration ? 'Voice-Over Narration is ON (Click to turn off)' : 'Enable Voice-Over Audio Narration'}
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

        {/* Merged Speed Slider Toggle */}
        <div className={`pt-3 border-t ${theme.borderClass}`}>
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
          />
        </div>
      </div>
    </div>
  );
};
