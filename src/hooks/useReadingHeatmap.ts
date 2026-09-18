import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  HighlightedWordParts, 
  ReadingHeatmapData, 
  ReadingSessionRecord, 
  ReadingStatsSummary,
  WpmHistoryPoint 
} from '../types';
import { generateReadingHeatmap } from '../utils/readingHeatmap';
import { safeStorage } from '../utils/safeStorage';

const STORAGE_KEY_SESSIONS = 'adhd_reading_sessions_history_v1';

interface UseReadingHeatmapProps {
  words: HighlightedWordParts[];
  currentIndex: number;
  isPlaying: boolean;
  wpm: number;
  documentTitle: string;
  isIdle?: boolean;
}

interface ActiveSessionData {
  id: string;
  startTime: number;
  wordsSet: Set<number>;
  dwellMs: number;
  targetWpm: number;
  documentTitle: string;
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

  // Stored historical reading sessions
  const [pastSessions, setPastSessions] = useState<ReadingSessionRecord[]>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEY_SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });

  // Active in-progress reading session
  const activeSessionRef = useRef<ActiveSessionData | null>(null);

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

  // Finalize an active session and save to persistent history
  const finalizeActiveSession = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session) return;

    if (session.wordsSet.size >= 4 || session.dwellMs >= 2500) {
      const durationMins = session.dwellMs / 60000;
      let calculatedWpm = durationMins > 0 
        ? Math.round(session.wordsSet.size / durationMins) 
        : session.targetWpm;

      if (calculatedWpm < 40) calculatedWpm = session.targetWpm;
      if (calculatedWpm > 1600) calculatedWpm = 1600;

      const newRecord: ReadingSessionRecord = {
        id: session.id,
        timestamp: session.startTime,
        dateLabel: new Date(session.startTime).toLocaleDateString(undefined, { 
          month: 'short', 
          day: 'numeric' 
        }),
        documentTitle: session.documentTitle,
        wordsRead: session.wordsSet.size,
        dwellMs: Math.round(session.dwellMs),
        averageWpm: calculatedWpm,
        targetWpm: session.targetWpm,
      };

      setPastSessions((prev) => {
        const updated = [newRecord, ...prev].slice(0, 80);
        try {
          safeStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated));
        } catch {
          // Ignore
        }
        return updated;
      });
    }

    activeSessionRef.current = null;
  }, []);

  // Handle play/pause transitions to start or conclude sessions
  useEffect(() => {
    if (isPlaying) {
      if (!activeSessionRef.current) {
        activeSessionRef.current = {
          id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          startTime: Date.now(),
          wordsSet: new Set([currentIndex]),
          dwellMs: 0,
          targetWpm: wpm,
          documentTitle: documentTitle || 'Reading Session',
        };
      } else {
        activeSessionRef.current.targetWpm = wpm;
        activeSessionRef.current.documentTitle = documentTitle || 'Reading Session';
      }
    } else {
      finalizeActiveSession();
    }
  }, [isPlaying, wpm, documentTitle, finalizeActiveSession, currentIndex]);

  // Clean up and finalize active session when documentTitle changes or unmounts
  useEffect(() => {
    return () => {
      finalizeActiveSession();
    };
  }, [documentTitle, finalizeActiveSession]);

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
      
      // Also attribute to active session if currently reading
      if (activeSessionRef.current) {
        activeSessionRef.current.wordsSet.add(prevIdx);
        activeSessionRef.current.wordsSet.add(currentIndex);
        activeSessionRef.current.dwellMs += elapsed;
        activeSessionRef.current.targetWpm = wpm;
      }

      scheduleSave();
      setRenderTick((t) => (t + 1) % 10000);
    }
  }, [currentIndex, isIdle, words.length, scheduleSave, wpm]);

  // Periodic ticker during active reading playback or focus pause to update dwell in real time
  useEffect(() => {
    if (isIdle || words.length === 0) return;

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTimestampRef.current;
      
      // Accumulate time on currently active word
      if (currentIndex >= 0 && currentIndex < words.length && elapsed > 100 && elapsed < 15000) {
        dwellTimesRef.current[currentIndex] = (dwellTimesRef.current[currentIndex] || 0) + elapsed;
        
        if (activeSessionRef.current) {
          activeSessionRef.current.wordsSet.add(currentIndex);
          activeSessionRef.current.dwellMs += elapsed;
          activeSessionRef.current.targetWpm = wpm;
        }

        lastTimestampRef.current = now;
        scheduleSave();
        setRenderTick((t) => (t + 1) % 10000);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, isIdle, currentIndex, words.length, scheduleSave, wpm]);

  // Compute the rich heatmap data
  const heatmapData: ReadingHeatmapData = useMemo(() => {
    // Depend on renderTick, currentIndex, words, wpm
    return generateReadingHeatmap(words, dwellTimesRef.current, currentIndex, wpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, currentIndex, wpm, renderTick]);

  // Compute aggregated reading statistics summary using heatmap & session data
  const statsSummary: ReadingStatsSummary = useMemo(() => {
    // 1. Current document dwell metrics
    let currentDocWordsCount = 0;
    let currentDocDwellTotal = 0;
    
    if (dwellTimesRef.current && dwellTimesRef.current.length > 0) {
      for (let i = 0; i < dwellTimesRef.current.length; i++) {
        const d = dwellTimesRef.current[i] || 0;
        if (d > 40) {
          currentDocWordsCount++;
          currentDocDwellTotal += d;
        }
      }
    }

    const currentDocDwellMins = currentDocDwellTotal / 60000;
    const currentDocAvgWpm = currentDocDwellMins > 0 && currentDocWordsCount > 0
      ? Math.round(currentDocWordsCount / currentDocDwellMins)
      : wpm;

    // 2. Aggregate across past recorded sessions
    let pastWordsTotal = 0;
    let pastDwellTotal = 0;
    let weightedWpmSum = 0;

    for (const session of pastSessions) {
      pastWordsTotal += session.wordsRead;
      pastDwellTotal += session.dwellMs;
      weightedWpmSum += session.averageWpm * session.wordsRead;
    }

    // Include active session in progress
    const active = activeSessionRef.current;
    const activeWords = active ? active.wordsSet.size : 0;
    const activeDwell = active ? active.dwellMs : 0;
    const activeWpm = active && active.dwellMs > 1000
      ? Math.round(activeWords / (active.dwellMs / 60000))
      : wpm;

    if (active && activeWords > 0) {
      weightedWpmSum += activeWpm * activeWords;
    }

    const totalWordsRead = Math.max(
      pastWordsTotal + activeWords,
      currentDocWordsCount
    );

    const totalReadingTimeMs = pastDwellTotal + activeDwell + (pastSessions.length === 0 ? currentDocDwellTotal : 0);

    const totalSessionsCount = pastSessions.length + (
      active && activeWords >= 3 
        ? 1 
        : (pastSessions.length === 0 && currentDocWordsCount > 0 ? 1 : 0)
    );

    // Compute weighted overall average WPM
    let overallAverageWpm = wpm;
    const wordsWithRecordedWpm = pastWordsTotal + activeWords;
    if (wordsWithRecordedWpm > 0) {
      overallAverageWpm = Math.round(weightedWpmSum / wordsWithRecordedWpm);
    } else if (currentDocWordsCount > 0 && currentDocDwellMins > 0) {
      overallAverageWpm = currentDocAvgWpm;
    }

    // 3. Construct chronological timeline for WPM over time chart
    const chronologicalSessions = [...pastSessions].reverse();
    const wpmHistory: WpmHistoryPoint[] = chronologicalSessions.map((sess, idx) => ({
      id: sess.id,
      timestamp: sess.timestamp,
      dateLabel: sess.dateLabel,
      timeLabel: new Date(sess.timestamp).toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sessionNumber: idx + 1,
      avgWpm: sess.averageWpm,
      targetWpm: sess.targetWpm || wpm,
      wordsRead: sess.wordsRead,
      dwellSeconds: Math.round(sess.dwellMs / 1000),
      documentTitle: sess.documentTitle || 'Document',
    }));

    // If active session or current doc has activity, append it as the latest point
    if (active && activeWords >= 3) {
      wpmHistory.push({
        id: active.id,
        timestamp: active.startTime,
        dateLabel: 'Now',
        timeLabel: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        sessionNumber: wpmHistory.length + 1,
        avgWpm: activeWpm,
        targetWpm: active.targetWpm,
        wordsRead: activeWords,
        dwellSeconds: Math.round(activeDwell / 1000),
        documentTitle: active.documentTitle,
      });
    } else if (wpmHistory.length === 0 && currentDocWordsCount > 0) {
      // First session baseline point from current document
      wpmHistory.push({
        id: 'current_session_baseline',
        timestamp: Date.now(),
        dateLabel: 'Today',
        timeLabel: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        sessionNumber: 1,
        avgWpm: currentDocAvgWpm,
        targetWpm: wpm,
        wordsRead: currentDocWordsCount,
        dwellSeconds: Math.round(currentDocDwellTotal / 1000),
        documentTitle: documentTitle || 'Current Document',
      });
    }

    // 4. Complexity breakdown from heatmap buckets
    let fastWords = 0;
    let steadyWords = 0;
    let complexWords = 0;
    let unreadWords = 0;

    for (const b of heatmapData.buckets) {
      const bucketWordCount = Math.max(1, b.endWord - b.startWord + 1);
      if (b.complexityLevel === 'low') fastWords += bucketWordCount;
      else if (b.complexityLevel === 'moderate') steadyWords += bucketWordCount;
      else if (b.complexityLevel === 'high' || b.complexityLevel === 'peak') complexWords += bucketWordCount;
      else unreadWords += bucketWordCount;
    }

    return {
      totalWordsRead,
      totalReadingTimeMs,
      totalSessionsCount,
      overallAverageWpm,
      currentDocWordsRead: currentDocWordsCount,
      currentDocDwellMs: currentDocDwellTotal,
      currentDocAvgWpm,
      wpmHistory,
      recentSessions: pastSessions,
      complexityBreakdown: {
        fastWords,
        steadyWords,
        complexWords,
        unreadWords,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastSessions, heatmapData, wpm, documentTitle, renderTick]);

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

  // Reset all historical reading stats and sessions
  const clearAllStats = useCallback(() => {
    activeSessionRef.current = null;
    setPastSessions([]);
    try {
      safeStorage.removeItem(STORAGE_KEY_SESSIONS);
      safeStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    dwellTimesRef.current = new Array(words.length).fill(0);
    setRenderTick((t) => (t + 1) % 10000);
  }, [storageKey, words.length]);

  return {
    heatmapData,
    dwellTimes: dwellTimesRef.current,
    statsSummary,
    resetHeatmap,
    clearAllStats,
  };
}

