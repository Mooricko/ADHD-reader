import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HighlightedWordParts, ReadingHeatmapData } from '../types';
import { generateReadingHeatmap } from '../utils/readingHeatmap';
import { safeStorage } from '../utils/safeStorage';

interface UseReadingHeatmapProps {
  words: HighlightedWordParts[];
  currentIndex: number;
  isPlaying: boolean;
  wpm: number;
  documentTitle: string;
  isIdle?: boolean;
}

export function useReadingHeatmap({
  words,
  currentIndex,
  isPlaying,
  wpm,
  documentTitle,
  isIdle = false,
}: UseReadingHeatmapProps) {
  // Storage key derived from title and length to persist across reloads
  const storageKey = useMemo(() => {
    const safeTitle = (documentTitle || 'reading').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `adhd_heatmap_dwell_${safeTitle}_${words.length}`;
  }, [documentTitle, words.length]);

  // Dwell times storage per word index (in milliseconds)
  const dwellTimesRef = useRef<number[]>([]);
  const lastIndexRef = useRef<number>(currentIndex);
  const lastTimestampRef = useRef<number>(performance.now());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize or restore dwell times
  useEffect(() => {
    try {
      const saved = safeStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === words.length) {
          dwellTimesRef.current = parsed;
          return;
        }
      }
    } catch {
      // Ignore
    }
    dwellTimesRef.current = new Array(words.length).fill(0);
  }, [storageKey, words.length]);

  // Schedule safeStorage persistence (debounced)
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) return;
    saveTimeoutRef.current = setTimeout(() => {
      try {
        safeStorage.setItem(storageKey, JSON.stringify(dwellTimesRef.current));
      } catch {
        // Ignore
      }
      saveTimeoutRef.current = null;
    }, 2000);
  }, [storageKey]);

  // Force an immediate state update trigger
  const [renderTick, setRenderTick] = useState<number>(0);

  // Record elapsed time whenever index changes
  useEffect(() => {
    const now = performance.now();
    const elapsed = now - lastTimestampRef.current;
    lastTimestampRef.current = now;

    const prevIdx = lastIndexRef.current;
    lastIndexRef.current = currentIndex;

    // Only attribute dwell if reasonable duration (< 25 seconds) and not idle
    if (prevIdx >= 0 && prevIdx < words.length && elapsed > 20 && elapsed < 25000 && !isIdle) {
      dwellTimesRef.current[prevIdx] = (dwellTimesRef.current[prevIdx] || 0) + elapsed;
      scheduleSave();
      setRenderTick((t) => (t + 1) % 10000);
    }
  }, [currentIndex, isIdle, words.length, scheduleSave]);

  // Periodic ticker during active reading playback or focus pause to update dwell in real time
  useEffect(() => {
    if (isIdle || words.length === 0) return;

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTimestampRef.current;
      
      // Accumulate time on currently active word
      if (currentIndex >= 0 && currentIndex < words.length && elapsed > 100 && elapsed < 15000) {
        dwellTimesRef.current[currentIndex] = (dwellTimesRef.current[currentIndex] || 0) + elapsed;
        lastTimestampRef.current = now;
        scheduleSave();
        setRenderTick((t) => (t + 1) % 10000);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, isIdle, currentIndex, words.length, scheduleSave]);

  // Compute the rich heatmap data
  const heatmapData: ReadingHeatmapData = useMemo(() => {
    // Depend on renderTick, currentIndex, words, wpm
    return generateReadingHeatmap(words, dwellTimesRef.current, currentIndex, wpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, currentIndex, wpm, renderTick]);

  // Reset heatmap data for current document
  const resetHeatmap = useCallback(() => {
    dwellTimesRef.current = new Array(words.length).fill(0);
    try {
      safeStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    setRenderTick((t) => (t + 1) % 10000);
  }, [storageKey, words.length]);

  return {
    heatmapData,
    dwellTimes: dwellTimesRef.current,
    resetHeatmap,
  };
}
