import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { HighlightedWordParts, ReaderSettings } from '../types';
import { ThemeConfig } from '../utils/themeStyles';
import { calculateWordDelayMs } from '../utils/textParser';
import { SvgFilters } from './MorphingText';
import { HorizontalRSVPReel } from './HorizontalRSVPReel';

interface RSVPMorphWordProps {
  currentWord: HighlightedWordParts;
  currentIndex: number;
  allWords?: HighlightedWordParts[];
  isPlaying: boolean;
  settings: ReaderSettings;
  theme: ThemeConfig;
  highlight: { hex: string; bgBadge: string };
  font: { className: string };
  onIndexChange?: (index: number) => void;
}

interface StoredWordState {
  word: HighlightedWordParts;
  offset: number;
}

// A generic cubic-bezier easing. Control points (x1,y1) and (x2,y2).
// Mirrors CSS: cubic-bezier(x1, y1, x2, y2)
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number) => 3 * b - 6 * a;
  const C = (a: number) => 3 * a;

  const calcBezier = (t: number, a: number, b: number) =>
    ((A(a, b) * t + B(a, b)) * t + C(a)) * t;

  const getSlope = (t: number, a: number, b: number) =>
    3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);

  // Newton-Raphson to invert x -> t
  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const slope = getSlope(t, x1, x2);
      if (slope === 0) return t;
      t -= (calcBezier(t, x1, x2) - x) / slope;
    }
    return t;
  };

  return (t: number): number => calcBezier(solveT(t), y1, y2);
};

// Usage — a very smooth easeInOut:
const easeInOut = cubicBezier(0.65, 0, 0.35, 1);

// Extra-soft version (longer ramp on both ends):
const easeInOutSoft = cubicBezier(0.85, 0, 0.15, 1);

// Backward-compatible alias
const easeInOutCubic = easeInOut;

export const RSVPMorphWord: React.FC<RSVPMorphWordProps> = ({
  currentWord,
  currentIndex,
  allWords = [],
  isPlaying,
  settings,
  theme,
  highlight,
  font,
  onIndexChange,
}) => {
  // Refs for standard RSVP display
  const standardWordRef = useRef<HTMLDivElement>(null);
  const standardHighlightRef = useRef<HTMLSpanElement>(null);

  // Refs for dual-layer active morph display
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layer2Ref = useRef<HTMLDivElement>(null);
  const currHighlightRef = useRef<HTMLSpanElement>(null);

  // Synchronous offset tracking
  const [currOffset, setCurrOffset] = useState<number>(0);
  const [standardOffset, setStandardOffset] = useState<number>(0);
  const [prevWordState, setPrevWordState] = useState<StoredWordState | null>(null);

  const currentOffsetRef = useRef<number>(0);
  const lastRenderedWordRef = useRef<StoredWordState | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Helper to compute middle offset for highlighted letters relative to word center
  const computeMiddleOffset = (wordEl: HTMLElement | null, hlEl: HTMLElement | null): number => {
    if (!wordEl || !hlEl) return 0;
    const wordRect = wordEl.getBoundingClientRect();
    const hlRect = hlEl.getBoundingClientRect();
    if (wordRect.width === 0 || hlRect.width === 0) {
      const wordCenter = wordEl.offsetWidth / 2;
      const hlCenter = hlEl.offsetLeft + hlEl.offsetWidth / 2;
      return wordCenter - hlCenter;
    }
    const wordCenter = wordRect.left + wordRect.width / 2;
    const hlCenter = hlRect.left + hlRect.width / 2;
    return wordCenter - hlCenter;
  };

  // Synchronously compute and apply the middle offset before browser paints
  useLayoutEffect(() => {
    if (settings.morphTransition) {
      // In active morph mode, ALWAYS position the highlighted letters in the middle
      const wordEl = layer2Ref.current;
      const hlEl = currHighlightRef.current;

      const offset = computeMiddleOffset(wordEl, hlEl);
      currentOffsetRef.current = offset;
      setCurrOffset(offset);

      if (wordEl) {
        wordEl.style.transform = offset !== 0 ? `translateX(${offset}px)` : 'translateX(0px)';
      }
    } else {
      // In standard mode, position to middle if opticalCenterLock is enabled
      const wordEl = standardWordRef.current;
      const hlEl = standardHighlightRef.current;

      const offset = settings.opticalCenterLock ? computeMiddleOffset(wordEl, hlEl) : 0;
      setStandardOffset(offset);

      if (wordEl) {
        wordEl.style.setProperty('--rsvp-offset', offset !== 0 ? `translateX(${offset}px)` : 'translateX(0px)');
        wordEl.style.transform = offset !== 0 ? `translateX(${offset}px)` : 'translateX(0px)';
      }
    }
  }, [
    currentIndex,
    settings.morphTransition,
    settings.opticalCenterLock,
    settings.fontSize,
    currentWord.original,
    currentWord.beforeHighlight,
    currentWord.highlightedText,
    currentWord.afterHighlight,
  ]);

  // Morph animation lifecycle
  useEffect(() => {
    // If morphing is disabled, simply update the reference and exit
    if (!settings.morphTransition) {
      lastRenderedWordRef.current = { word: currentWord, offset: standardOffset };
      return;
    }

    // Initial mount: display the incoming word cleanly
    if (!lastRenderedWordRef.current) {
      if (layer2Ref.current) {
        layer2Ref.current.style.opacity = '100%';
        layer2Ref.current.style.filter = 'none';
      }
      lastRenderedWordRef.current = { word: currentWord, offset: currentOffsetRef.current };
      return;
    }

    // Word changed in active morph mode:
    // Set outgoing word with its measured middle offset
    const previous = lastRenderedWordRef.current;
    setPrevWordState(previous);

    // Cancel any currently running morph animation
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    const current1 = layer1Ref.current;
    const current2 = layer2Ref.current;

    if (!current1 || !current2) {
      lastRenderedWordRef.current = { word: currentWord, offset: currentOffsetRef.current };
      return;
    }

    // Ensure Layer 1 (outgoing word) highlighted letters are locked to the middle
    current1.style.transform =
      previous.offset !== 0 ? `translateX(${previous.offset}px)` : 'translateX(0px)';

    // Ensure Layer 2 (incoming word) highlighted letters are locked to the middle
    current2.style.transform =
      currentOffsetRef.current !== 0 ? `translateX(${currentOffsetRef.current}px)` : 'translateX(0px)';

    // Calculate word delay
    const wordDelay = calculateWordDelayMs(
      currentWord,
      settings.wpm,
      settings.smartPunctuationPause
    );

    // Smoother & slower morph duration:
    // Take ~58% of the word delay when reading (with min 100ms, max 340ms)
    // and a relaxed 440ms when paused or stepping manually
    const morphDuration = isPlaying
      ? Math.min(340, Math.max(100, wordDelay * 0.58))
      : 440;

    const startTime = performance.now();

    const animateMorph = (now: number) => {
      const elapsed = now - startTime;
      const rawFraction = Math.min(1, elapsed / morphDuration);

      // Apply cubic easing for a silky, organic transition
      const smoothFraction = easeInOutCubic(rawFraction);

      // Incoming word (Layer 2)
      const blur2 = Math.min(22, Math.max(0, 7 / Math.max(0.08, smoothFraction) - 7));
      const opacity2 = Math.pow(smoothFraction, 0.45) * 100;

      // Outgoing word (Layer 1)
      const invFraction = 1 - smoothFraction;
      const blur1 = Math.min(22, Math.max(0, 7 / Math.max(0.08, invFraction) - 7));
      const opacity1 = Math.pow(invFraction, 0.45) * 100;

      if (rawFraction < 1) {
        current2.style.filter = `blur(${blur2}px)`;
        current2.style.opacity = `${opacity2}%`;

        current1.style.filter = `blur(${blur1}px)`;
        current1.style.opacity = `${opacity1}%`;

        animFrameIdRef.current = requestAnimationFrame(animateMorph);
      } else {
        // Cooldown complete: new word is 100% crisp and settled in the middle
        current2.style.filter = 'none';
        current2.style.opacity = '100%';

        current1.style.filter = 'none';
        current1.style.opacity = '0%';
        animFrameIdRef.current = null;
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animateMorph);

    lastRenderedWordRef.current = { word: currentWord, offset: currentOffsetRef.current };

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [
    currentIndex,
    currentWord,
    settings.morphTransition,
    settings.wpm,
    settings.smartPunctuationPause,
    isPlaying,
    standardOffset,
  ]);

  // Calculate gentle fade duration for standard mode
  const standardDelay = calculateWordDelayMs(
    currentWord,
    settings.wpm,
    settings.smartPunctuationPause
  );
  const fadeDurationMs = isPlaying
    ? Math.min(130, Math.max(50, standardDelay * 0.25))
    : 160;

  // Case 0: Multi-Word Horizontal Looping Reel (1, 3, or 5 Words Aligned Horizontally with GSAP Swipe)
  if (settings.chunkSize && settings.chunkSize > 1) {
    return (
      <HorizontalRSVPReel
        words={allWords && allWords.length > 0 ? allWords : [currentWord]}
        currentIndex={currentIndex}
        chunkSize={settings.chunkSize as 1 | 3 | 5}
        isPlaying={isPlaying}
        settings={settings}
        theme={theme}
        highlight={highlight}
        font={font}
        onIndexChange={onIndexChange}
      />
    );
  }

  // Case 1: Standard RSVP Mode (Comfortable CSS Fade-In Animation)
  if (!settings.morphTransition) {
    return (
      <div
        id="rsvp-word-display"
        className={`relative w-full flex items-baseline justify-center tracking-normal overflow-visible select-none ${
          currentWord.isRtl && settings.fontFamily !== 'vazirmatn' ? 'font-vazirmatn' : font.className
        }`}
        style={{
          fontSize: `${settings.fontSize}px`,
          lineHeight: 1.2,
        }}
      >
        <div
          key={currentIndex}
          ref={standardWordRef}
          dir={currentWord.isRtl ? 'rtl' : 'ltr'}
          className="inline-block text-center whitespace-nowrap will-change-transform animate-rsvp-fade-in"
          style={{
            transform:
              settings.opticalCenterLock && standardOffset !== 0
                ? `translateX(${standardOffset}px)`
                : undefined,
            animationDuration: `${fadeDurationMs}ms`,
          }}
        >
          <span className={theme.textPrimary}>{currentWord.prefixPunct + currentWord.beforeHighlight}</span><span
            ref={standardHighlightRef}
            className={
              currentWord.isRtl
                ? 'font-bold transition-colors'
                : 'font-bold px-[0.5px] transition-colors'
            }
            style={{ color: highlight.hex }}
          >{currentWord.highlightedText}</span><span className={theme.textPrimary}>{currentWord.afterHighlight + currentWord.suffixPunct}</span>
        </div>
      </div>
    );
  }

  // Case 2: Active Morph Mode (Smoother, Slower, Highlight Anchored to Middle)
  return (
    <>
      {/* Headless SVG Filters containing the feColorMatrix threshold filter */}
      <SvgFilters />

      <div
        id="rsvp-word-display"
        className={`relative w-full flex items-baseline justify-center tracking-normal overflow-visible select-none ${
          currentWord.isRtl && settings.fontFamily !== 'vazirmatn' ? 'font-vazirmatn' : font.className
        }`}
        style={{
          fontSize: `${settings.fontSize}px`,
          lineHeight: 1.2,
          filter: 'url(#threshold) blur(0.6px)',
        }}
      >
        {/* Layer 1: Departing Outgoing Word (Highlighted letters anchored to middle) */}
        <div
          ref={layer1Ref}
          dir={prevWordState?.word.isRtl ? 'rtl' : 'ltr'}
          className="absolute inline-block text-center whitespace-nowrap will-change-transform pointer-events-none"
          style={{
            transform:
              prevWordState?.offset !== undefined && prevWordState.offset !== 0
                ? `translateX(${prevWordState.offset}px)`
                : undefined,
            opacity: 0,
          }}
          aria-hidden="true"
        >
          {prevWordState && (
            <>
              <span className={theme.textPrimary}>{prevWordState.word.prefixPunct + prevWordState.word.beforeHighlight}</span><span
                className={
                  prevWordState.word.isRtl
                    ? 'font-bold transition-colors'
                    : 'font-bold px-[0.5px] transition-colors'
                }
                style={{ color: highlight.hex }}
              >{prevWordState.word.highlightedText}</span><span className={theme.textPrimary}>{prevWordState.word.afterHighlight + prevWordState.word.suffixPunct}</span>
            </>
          )}
        </div>

        {/* Layer 2: Arriving Incoming Word (Highlighted letters anchored to middle) */}
        <div
          ref={layer2Ref}
          dir={currentWord.isRtl ? 'rtl' : 'ltr'}
          className="inline-block text-center whitespace-nowrap will-change-transform"
          style={{
            transform: currOffset !== 0 ? `translateX(${currOffset}px)` : undefined,
          }}
        >
          <span className={theme.textPrimary}>{currentWord.prefixPunct + currentWord.beforeHighlight}</span><span
            ref={currHighlightRef}
            className={
              currentWord.isRtl
                ? 'font-bold transition-colors'
                : 'font-bold px-[0.5px] transition-colors'
            }
            style={{ color: highlight.hex }}
          >{currentWord.highlightedText}</span><span className={theme.textPrimary}>{currentWord.afterHighlight + currentWord.suffixPunct}</span>
        </div>
      </div>
    </>
  );
};
