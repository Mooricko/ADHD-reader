import { useState, useEffect, useRef, useCallback } from 'react';
import { HighlightedWordParts, ReaderDocumentHandle, HighlightStyle } from '../types';

export interface UseReaderWindowOptions {
  handle: ReaderDocumentHandle | null;
  currentIndex: number;
  highlightStyle?: HighlightStyle;
  contextRadius?: number; // Number of words before and after to keep in context window (e.g. 10)
  adjacentChunkRadius?: number; // Number of chunks before and after to prefetch (default 1)
  fallbackWords?: HighlightedWordParts[]; // Fallback words if handle is not yet created
}

export interface ReaderWindowState {
  currentWord: HighlightedWordParts | null;
  prevWord: HighlightedWordParts | null;
  nextWord: HighlightedWordParts | null;
  contextWords: HighlightedWordParts[]; // The small slice [currentIndex - contextRadius, currentIndex + contextRadius]
  windowWords: HighlightedWordParts[]; // The active chunk words (plus adjacent cached chunks)
  totalWords: number;
  isLoading: boolean;
  isSeeking: boolean;
  generationToken: number;
  activeChunkIndex: number;
  chunkProgressPercent: number;
}

const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = 'middle-two';
const DEFAULT_WORD: HighlightedWordParts = {
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

/**
 * useReaderWindow
 * 
 * Manages an active bounded window of parsed words around currentIndex using ReaderDocumentHandle.
 * Avoids loading the entire document into React state.
 * Automatically prefetches adjacent chunks in the background.
 */
export function useReaderWindow({
  handle,
  currentIndex,
  highlightStyle = DEFAULT_HIGHLIGHT_STYLE,
  contextRadius = 12,
  adjacentChunkRadius = 1,
  fallbackWords = [],
}: UseReaderWindowOptions) {
  const [totalWords, setTotalWords] = useState<number>(() => {
    return fallbackWords.length;
  });
  const [activeChunkIndex, setActiveChunkIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [generationToken, setGenerationToken] = useState<number>(0);

  // In-memory window cache of parsed words: Map<chunkIndex, HighlightedWordParts[]>
  const chunkWordsCacheRef = useRef<Map<number, HighlightedWordParts[]>>(new Map());
  const activeDocIdRef = useRef<string | null>(null);
  const activeGenerationRef = useRef<number>(0);
  const activeLoadingChunkRef = useRef<number | null>(null);

  // Current window words
  const [currentWord, setCurrentWord] = useState<HighlightedWordParts | null>(() => {
    return fallbackWords[currentIndex] || (fallbackWords.length > 0 ? fallbackWords[0] : null);
  });
  const [prevWord, setPrevWord] = useState<HighlightedWordParts | null>(() => {
    return currentIndex > 0 && fallbackWords[currentIndex - 1] ? fallbackWords[currentIndex - 1] : null;
  });
  const [nextWord, setNextWord] = useState<HighlightedWordParts | null>(() => {
    return currentIndex < fallbackWords.length - 1 && fallbackWords[currentIndex + 1] ? fallbackWords[currentIndex + 1] : null;
  });
  const [contextWords, setContextWords] = useState<HighlightedWordParts[]>(() => {
    if (fallbackWords.length === 0) return [];
    const start = Math.max(0, currentIndex - contextRadius);
    const end = Math.min(fallbackWords.length, currentIndex + contextRadius + 1);
    return fallbackWords.slice(start, end);
  });
  const [windowWords, setWindowWords] = useState<HighlightedWordParts[]>(() => fallbackWords);

  // Reset or initialize on handle change
  useEffect(() => {
    const docId = handle?.id || null;
    if (docId !== activeDocIdRef.current) {
      activeDocIdRef.current = docId;
      const nextToken = activeGenerationRef.current + 1;
      activeGenerationRef.current = nextToken;
      setGenerationToken(nextToken);
      chunkWordsCacheRef.current.clear();
      activeLoadingChunkRef.current = null;

      if (!handle) {
        setTotalWords(fallbackWords.length);
        const cw = fallbackWords[currentIndex] || fallbackWords[0] || null;
        setCurrentWord(cw);
        setPrevWord(currentIndex > 0 ? fallbackWords[currentIndex - 1] || null : null);
        setNextWord(currentIndex < fallbackWords.length - 1 ? fallbackWords[currentIndex + 1] || null : null);
        const start = Math.max(0, currentIndex - contextRadius);
        const end = Math.min(fallbackWords.length, currentIndex + contextRadius + 1);
        setContextWords(fallbackWords.slice(start, end));
        setWindowWords(fallbackWords);
        setIsLoading(false);
        setIsSeeking(false);
        return;
      }

      // Fetch metadata for handle
      handle.getMetadata().then((meta) => {
        if (activeGenerationRef.current === nextToken) {
          setTotalWords(meta.totalWords);
        }
      }).catch((err) => {
        console.warn('Failed to load document metadata:', err);
      });
    }
  }, [handle, fallbackWords, currentIndex, contextRadius]);

  // Helper to fetch and cache a chunk's processed words
  const loadChunkWords = useCallback(async (
    targetHandle: ReaderDocumentHandle,
    chunkIdx: number,
    token: number
  ): Promise<HighlightedWordParts[]> => {
    if (chunkWordsCacheRef.current.has(chunkIdx)) {
      return chunkWordsCacheRef.current.get(chunkIdx)!;
    }

    try {
      const words = await targetHandle.getProcessedWordsForChunk(chunkIdx, highlightStyle);
      if (activeGenerationRef.current === token) {
        chunkWordsCacheRef.current.set(chunkIdx, words);
        // Enforce bounded cache limit in window hook (keep max 5 chunks in React hook memory)
        if (chunkWordsCacheRef.current.size > 5) {
          const keys = Array.from(chunkWordsCacheRef.current.keys()).sort((a, b) => {
            return Math.abs(b - chunkIdx) - Math.abs(a - chunkIdx);
          });
          while (chunkWordsCacheRef.current.size > 5 && keys.length > 0) {
            const evictKey = keys.shift()!;
            chunkWordsCacheRef.current.delete(evictKey);
          }
        }
      }
      return words;
    } catch (err) {
      console.warn(`[useReaderWindow] Failed to load chunk ${chunkIdx}:`, err);
      return [];
    }
  }, [highlightStyle]);

  // Main resolver effect: whenever currentIndex or handle changes, resolve words
  useEffect(() => {
    if (!handle) {
      if (fallbackWords.length > 0) {
        setTotalWords(fallbackWords.length);
        const cw = fallbackWords[currentIndex] || fallbackWords[0] || null;
        setCurrentWord(cw);
        setPrevWord(currentIndex > 0 ? fallbackWords[currentIndex - 1] || null : null);
        setNextWord(currentIndex < fallbackWords.length - 1 ? fallbackWords[currentIndex + 1] || null : null);
        const start = Math.max(0, currentIndex - contextRadius);
        const end = Math.min(fallbackWords.length, currentIndex + contextRadius + 1);
        setContextWords(fallbackWords.slice(start, end));
      }
      return;
    }

    let isMounted = true;
    const currentToken = activeGenerationRef.current;

    const resolveCurrentWindow = async () => {
      try {
        const loc = await handle.getLocationInfo(currentIndex);
        if (!isMounted || activeGenerationRef.current !== currentToken) return;

        setTotalWords(loc.totalWords);
        setActiveChunkIndex(loc.chunkIndex);

        // Check if the chunk containing this word is already cached
        const cachedCurrentChunk = chunkWordsCacheRef.current.get(loc.chunkIndex);

        if (!cachedCurrentChunk) {
          // Chunk is not yet in memory -> show loading state
          setIsLoading(true);
          setIsSeeking(true);
          activeLoadingChunkRef.current = loc.chunkIndex;

          const words = await loadChunkWords(handle, loc.chunkIndex, currentToken);
          if (!isMounted || activeGenerationRef.current !== currentToken) return;

          setIsLoading(false);
          setIsSeeking(false);
          activeLoadingChunkRef.current = null;
        }

        // Find word in cached chunk
        const currentChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex) || [];
        const inChunkIdx = loc.wordIndexInChunk;
        const resolvedCurrent = currentChunkWords[inChunkIdx] || null;

        // Resolve previous word
        let resolvedPrev: HighlightedWordParts | null = null;
        if (inChunkIdx > 0) {
          resolvedPrev = currentChunkWords[inChunkIdx - 1] || null;
        } else if (loc.chunkIndex > 0) {
          const prevChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex - 1);
          if (prevChunkWords && prevChunkWords.length > 0) {
            resolvedPrev = prevChunkWords[prevChunkWords.length - 1];
          }
        }

        // Resolve next word
        let resolvedNext: HighlightedWordParts | null = null;
        if (inChunkIdx < currentChunkWords.length - 1) {
          resolvedNext = currentChunkWords[inChunkIdx + 1] || null;
        } else {
          const nextChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex + 1);
          if (nextChunkWords && nextChunkWords.length > 0) {
            resolvedNext = nextChunkWords[0];
          }
        }

        // Build context words window around currentIndex
        const windowList: HighlightedWordParts[] = [];
        const minWordIdx = Math.max(0, currentIndex - contextRadius);
        const maxWordIdx = Math.min(loc.totalWords - 1, currentIndex + contextRadius);

        // Gather from currentChunkWords and adjacent chunks
        for (let idx = minWordIdx; idx <= maxWordIdx; idx++) {
          // Check if within current chunk
          const currentChunkRangeStart = currentIndex - inChunkIdx;
          const currentChunkRangeEnd = currentChunkRangeStart + currentChunkWords.length - 1;

          if (idx >= currentChunkRangeStart && idx <= currentChunkRangeEnd) {
            const w = currentChunkWords[idx - currentChunkRangeStart];
            if (w) windowList.push(w);
          } else if (idx < currentChunkRangeStart && loc.chunkIndex > 0) {
            const prevChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex - 1);
            if (prevChunkWords) {
              const prevStart = currentChunkRangeStart - prevChunkWords.length;
              if (idx >= prevStart && idx < currentChunkRangeStart) {
                const w = prevChunkWords[idx - prevStart];
                if (w) windowList.push(w);
              }
            }
          } else if (idx > currentChunkRangeEnd) {
            const nextChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex + 1);
            if (nextChunkWords) {
              const nextStart = currentChunkRangeEnd + 1;
              if (idx >= nextStart && idx < nextStart + nextChunkWords.length) {
                const w = nextChunkWords[idx - nextStart];
                if (w) windowList.push(w);
              }
            }
          }
        }

        const combinedWindowWords: HighlightedWordParts[] = [];
        if (loc.chunkIndex > 0) {
          const prevChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex - 1);
          if (prevChunkWords) combinedWindowWords.push(...prevChunkWords);
        }
        combinedWindowWords.push(...currentChunkWords);
        const nextChunkWords = chunkWordsCacheRef.current.get(loc.chunkIndex + 1);
        if (nextChunkWords) combinedWindowWords.push(...nextChunkWords);

        if (isMounted && activeGenerationRef.current === currentToken) {
          setCurrentWord(resolvedCurrent);
          setPrevWord(resolvedPrev);
          setNextWord(resolvedNext);
          if (windowList.length > 0) {
            setContextWords(windowList);
          }
          if (combinedWindowWords.length > 0) {
            setWindowWords(combinedWindowWords);
          }
        }

        // Prefetch adjacent chunks asynchronously in background without blocking UI
        handle.getAdjacentChunks(loc.chunkIndex, adjacentChunkRadius).then((adjacentChunks) => {
          if (!isMounted || activeGenerationRef.current !== currentToken) return;
          for (const adj of adjacentChunks) {
            if (!chunkWordsCacheRef.current.has(adj.chunkIndex)) {
              loadChunkWords(handle, adj.chunkIndex, currentToken).catch(() => {});
            }
          }
        }).catch(() => {});

      } catch (err) {
        if (isMounted) {
          console.warn('[useReaderWindow] Resolution error:', err);
          setIsLoading(false);
          setIsSeeking(false);
        }
      }
    };

    resolveCurrentWindow();

    return () => {
      isMounted = false;
    };
  }, [handle, currentIndex, highlightStyle, contextRadius, adjacentChunkRadius, fallbackWords, loadChunkWords]);

  // Compute percentage
  const chunkProgressPercent = totalWords > 0
    ? Math.round(((currentIndex + 1) / totalWords) * 100)
    : 0;

  // Imperative fetcher for playback and multi-word display
  const getWordAt = useCallback(async (index: number): Promise<HighlightedWordParts | null> => {
    if (!handle) {
      return fallbackWords[index] || null;
    }
    const loc = await handle.getLocationInfo(index);
    const words = await loadChunkWords(handle, loc.chunkIndex, activeGenerationRef.current);
    return words[loc.wordIndexInChunk] || null;
  }, [handle, fallbackWords, loadChunkWords]);

  const getWordsSlice = useCallback(async (startIndex: number, count: number): Promise<HighlightedWordParts[]> => {
    if (!handle) {
      return fallbackWords.slice(startIndex, startIndex + count);
    }
    const result: HighlightedWordParts[] = [];
    for (let i = 0; i < count; i++) {
      const idx = startIndex + i;
      const w = await getWordAt(idx);
      if (w) result.push(w);
      else break;
    }
    return result;
  }, [handle, fallbackWords, getWordAt]);

  const prefetchNear = useCallback(async (targetIndex: number) => {
    if (!handle) return;
    try {
      const loc = await handle.getLocationInfo(targetIndex);
      loadChunkWords(handle, loc.chunkIndex, activeGenerationRef.current).catch(() => {});
      handle.getAdjacentChunks(loc.chunkIndex, adjacentChunkRadius).then((adjs) => {
        for (const adj of adjs) {
          loadChunkWords(handle, adj.chunkIndex, activeGenerationRef.current).catch(() => {});
        }
      }).catch(() => {});
    } catch {}
  }, [handle, adjacentChunkRadius, loadChunkWords]);

  return {
    currentWord: currentWord || (fallbackWords[currentIndex] ?? DEFAULT_WORD),
    prevWord,
    nextWord,
    contextWords,
    windowWords,
    totalWords: totalWords > 0 ? totalWords : (fallbackWords.length || 1),
    isLoading,
    isSeeking,
    generationToken,
    activeChunkIndex,
    chunkProgressPercent,
    getWordAt,
    getWordsSlice,
    prefetchNear,
  };
}
