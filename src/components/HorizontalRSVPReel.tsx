import React, { useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import { gsap } from 'gsap';
import { HighlightedWordParts, ReaderSettings } from '../types';
import { ThemeConfig } from '../utils/themeStyles';
import { calculateWordDelayMs } from '../utils/textParser';

export interface HorizontalRSVPReelProps {
  words?: HighlightedWordParts[];
  getWordAt?: (index: number) => HighlightedWordParts | undefined;
  totalWords?: number;
  currentIndex: number;
  chunkSize: 1 | 3 | 5;
  isPlaying: boolean;
  settings: ReaderSettings;
  theme: ThemeConfig;
  highlight: { hex: string; bgBadge: string };
  font: { className: string };
  onIndexChange?: (index: number) => void;
}

const BUFFER_SIZE = 16;

export const HorizontalRSVPReel: React.FC<HorizontalRSVPReelProps> = ({
  words,
  getWordAt,
  totalWords,
  currentIndex,
  chunkSize,
  isPlaying,
  settings,
  theme,
  highlight,
  font,
  onIndexChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const wordElementsRef = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const prevIndexRef = useRef(currentIndex);
  const prevChunkPageRef = useRef(Math.floor(currentIndex / BUFFER_SIZE));
  const isFirstRenderRef = useRef(true);

  // Total word count bound
  const total = totalWords ?? (words ? words.length : 1);

  // Scale font size slightly for 3 and 5 words so they fit gracefully across all screens
  const effectiveFontSize = useMemo(() => {
    if (chunkSize === 5) {
      return Math.max(18, Math.min(settings.fontSize, Math.round(settings.fontSize * 0.76)));
    }
    if (chunkSize === 3) {
      return Math.max(20, Math.min(settings.fontSize, Math.round(settings.fontSize * 0.88)));
    }
    return settings.fontSize;
  }, [settings.fontSize, chunkSize]);

  const gapPx = useMemo(() => {
    return Math.max(16, Math.round(effectiveFontSize * 0.65));
  }, [effectiveFontSize]);

  const containerHeight = useMemo(() => {
    return Math.max(68, Math.round(effectiveFontSize * 2.2));
  }, [effectiveFontSize]);

  // Build index map for O(1) lookup when windowed chunks are provided without getWordAt
  const wordLookup = useMemo(() => {
    if (getWordAt) return null;
    const map = new Map<number, HighlightedWordParts>();
    if (words) {
      for (const w of words) {
        if (typeof w.index === 'number') {
          map.set(w.index, w);
        }
      }
    }
    return map;
  }, [words, getWordAt]);

  const resolveWordAt = useCallback((idx: number) => {
    if (getWordAt) return getWordAt(idx);
    if (wordLookup && wordLookup.has(idx)) return wordLookup.get(idx);
    if (words && words[idx] && (words[idx].index === undefined || words[idx].index === idx)) return words[idx];
    return undefined;
  }, [getWordAt, wordLookup, words]);

  // Dynamic animation duration based on word delay & WPM
  const currentWord = resolveWordAt(currentIndex) || words?.[0];
  const wordDelayMs = useMemo(() => {
    if (!currentWord) return 200;
    return calculateWordDelayMs(currentWord, settings.wpm, settings.smartPunctuationPause);
  }, [currentWord, settings.wpm, settings.smartPunctuationPause]);

  const animDuration = useMemo(() => {
    if (!isPlaying) return 0.32;
    // Responsive glide speed between 70ms and 260ms
    return Math.min(0.26, Math.max(0.07, (wordDelayMs / 1000) * 0.7));
  }, [isPlaying, wordDelayMs]);

  // Chunking to keep DOM nodes stable and prevent layout shifts during GSAP translation
  const chunkPage = Math.floor(currentIndex / BUFFER_SIZE);
  const chunkStart = Math.max(0, chunkPage * BUFFER_SIZE - 8);
  const chunkEnd = Math.min(total - 1, (chunkPage + 1) * BUFFER_SIZE + 8);

  const visibleWords = useMemo(() => {
    const list: { word: HighlightedWordParts; index: number }[] = [];
    for (let i = chunkStart; i <= chunkEnd; i++) {
      const w = resolveWordAt(i);
      if (w) {
        list.push({ word: w, index: i });
      }
    }
    return list;
  }, [resolveWordAt, chunkStart, chunkEnd]);

  const isTextRtl = Boolean(currentWord?.isRtl);

  // Position and animate track so current word is exactly at the horizontal center
  useLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    const currentElem = wordElementsRef.current[currentIndex];

    if (!container || !track || !currentElem) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    const currentTransformX = (gsap.getProperty(track, 'x') as number) || 0;
    const wordRect = currentElem.getBoundingClientRect();
    const wordCenter = wordRect.left + wordRect.width / 2;

    const delta = containerCenter - wordCenter;
    const targetX = currentTransformX + delta;

    const indexDiff = Math.abs(currentIndex - prevIndexRef.current);
    const chunkChanged = chunkPage !== prevChunkPageRef.current;

    // Instant snap on mount, when chunk buffer shifts, or when user scrubs/seeks
    if (isFirstRenderRef.current || chunkChanged || indexDiff > 3) {
      gsap.set(track, { x: targetX });
      isFirstRenderRef.current = false;
    } else {
      gsap.to(track, {
        x: targetX,
        duration: animDuration,
        ease: isPlaying ? 'power2.out' : 'expo.out',
        overwrite: 'auto',
      });
    }

    prevIndexRef.current = currentIndex;
    prevChunkPageRef.current = chunkPage;
  }, [currentIndex, chunkPage, animDuration, isPlaying, effectiveFontSize, gapPx]);

  // Clean up tweens on unmount
  useEffect(() => {
    return () => {
      if (trackRef.current) gsap.killTweensOf(trackRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="rsvp-horizontal-reel-container"
      className={`relative w-full max-w-4xl mx-auto flex items-center justify-center overflow-hidden select-none ${
        isTextRtl && settings.fontFamily !== 'vazirmatn' ? 'font-vazirmatn' : font.className
      }`}
      style={{
        height: `${containerHeight}px`,
        fontSize: `${effectiveFontSize}px`,
        lineHeight: 1.25,
      }}
      dir={isTextRtl ? 'rtl' : 'ltr'}
    >
      {/* Left Gradient Fade (Fade words smoothly as they enter / exit) */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-16 sm:w-28 md:w-36 z-20"
        style={{
          background: `linear-gradient(to right, ${theme.hexBg} 20%, transparent 100%)`,
        }}
      />

      {/* Right Gradient Fade */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 right-0 w-16 sm:w-28 md:w-36 z-20"
        style={{
          background: `linear-gradient(to left, ${theme.hexBg} 20%, transparent 100%)`,
        }}
      />

      {/* Horizontal Word Track (Sliding horizontally so current word stays at center) */}
      <div
        ref={trackRef}
        data-looping-words-track=""
        className="absolute top-0 bottom-0 flex items-center whitespace-nowrap will-change-transform select-none"
        style={{
          gap: `${gapPx}px`,
        }}
        dir={isTextRtl ? 'rtl' : 'ltr'}
      >
        {visibleWords.map(({ word, index }) => {
          const distance = index - currentIndex;
          const absDist = Math.abs(distance);
          const isCenter = absDist === 0;

          // Opacity & scale falloff based on horizontal distance from center
          let opacity = 0;
          let scale = 0.84;

          if (isCenter) {
            opacity = 1;
            scale = 1.05;
          } else if (absDist === 1) {
            opacity = chunkSize >= 3 ? 0.45 : 0;
            scale = 0.92;
          } else if (absDist === 2) {
            opacity = chunkSize >= 5 ? 0.22 : 0;
            scale = 0.85;
          }

          const isClickable = !isCenter && opacity > 0;

          return (
            <div
              key={`horizontal-word-${index}`}
              ref={(el) => {
                wordElementsRef.current[index] = el;
              }}
              onClick={() => {
                if (isClickable && onIndexChange) {
                  onIndexChange(index);
                }
              }}
              className={`inline-flex items-baseline justify-center whitespace-nowrap px-1 py-1 transition-all duration-200 ${
                isCenter
                  ? 'font-bold cursor-default'
                  : isClickable
                  ? 'cursor-pointer hover:opacity-85 hover:scale-95 transition-transform'
                  : 'pointer-events-none'
              }`}
              style={{
                opacity,
                transform: `scale(${scale})`,
                transitionProperty: 'opacity, transform',
              }}
            >
              {/* Prefix punctuation and text before highlight */}
              <span className={isCenter ? theme.textPrimary : theme.textMuted}>
                {word.prefixPunct + word.beforeHighlight}
              </span>

              {/* Highlighted middle letter */}
              <span
                className={
                  word.isRtl
                    ? 'font-bold transition-colors duration-150'
                    : 'font-bold px-[0.5px] transition-colors duration-150'
                }
                style={{
                  color: isCenter ? highlight.hex : undefined,
                  textShadow: isCenter ? `0 0 16px ${highlight.hex}45` : undefined,
                }}
              >
                {word.highlightedText}
              </span>

              {/* Text after highlight and suffix punctuation */}
              <span className={isCenter ? theme.textPrimary : theme.textMuted}>
                {word.afterHighlight + word.suffixPunct}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
