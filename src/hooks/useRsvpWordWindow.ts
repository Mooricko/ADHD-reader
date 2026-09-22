import { useState, useEffect, useRef, useCallback } from 'react';
import {
  HighlightedWordParts,
  HighlightStyle,
  ReaderDocumentHandle,
  DocumentChunk,
} from '../types';

export interface UseRsvpWordWindowOptions {
  documentHandle: ReaderDocumentHandle | null;
  totalWords?: number;
  currentIndex: number;
  highlightStyle?: HighlightStyle;
  direction?: 'ltr' | 'rtl';
  fallbackWords?: HighlightedWordParts[];
  onIndexChange?: (newIndex: number) => void;
  isPlaying?: boolean;
}

export interface LoadedChunkInfo {
  chunkIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  words: HighlightedWordParts[];
}

export interface RsvpWordWindowResult {
  currentWord: HighlightedWordParts | null;
  prevWord: HighlightedWordParts | null;
  nextWord: HighlightedWordParts | null;
  currentIndex: number;
  totalWords: number;
  isLoadingChunk: boolean;
  currentChunkIndex: number;
  generationToken: number;
  getWordAt: (index: number) => HighlightedWordParts | undefined;
  ensureWordAvailable: (index: number) => Promise<boolean>;
  seekToIndex: (index: number) => Promise<boolean>;
  seekToPage: (pageNumber: number) => Promise<boolean>;
  seekToChapter: (chapterId: string) => Promise<boolean>;
  seekToSection: (sectionId: string) => Promise<boolean>;
  checkAndPrefetch: (index: number) => void;
  // Fallback or window words for multi-word horizontal reel
  windowWords: HighlightedWordParts[];
}

const PREFETCH_THRESHOLD = 40; // Prefetch adjacent chunk when within 40 words of boundary
const MAX_HOT_CHUNKS = 3; // Keep only center chunk ± 1 in memory (bounded working set)

export function useRsvpWordWindow({
  documentHandle,
  totalWords: initialTotalWords = 0,
  currentIndex,
  highlightStyle = 'middle-two',
  direction = 'ltr',
  fallbackWords,
  onIndexChange,
  isPlaying = false,
}: UseRsvpWordWindowOptions): RsvpWordWindowResult {
  // Generation token to invalidate stale async fetches on seek / document switch
  const [generationToken, setGenerationToken] = useState(0);
  const tokenRef = useRef(0);

  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [effectiveTotalWords, setEffectiveTotalWords] = useState(initialTotalWords);

  // In-memory cache of loaded chunks: chunkIndex -> LoadedChunkInfo
  const loadedChunksRef = useRef<Map<number, LoadedChunkInfo>>(new Map());
  // Track chunk load in progress to prevent duplicate requests
  const loadingPromisesRef = useRef<Map<number, Promise<LoadedChunkInfo | null>>>(new Map());

  // State to force re-render when a required chunk finishes loading
  const [, setChunksRevision] = useState(0);

  // Synchronize totalWords when initialTotalWords or fallbackWords changes
  useEffect(() => {
    if (fallbackWords && fallbackWords.length > 0) {
      setEffectiveTotalWords(fallbackWords.length);
    } else if (initialTotalWords > 0) {
      setEffectiveTotalWords(initialTotalWords);
    } else if (documentHandle) {
      documentHandle.getMetadata().then((meta) => {
        if (meta && meta.totalWords > 0) {
          setEffectiveTotalWords(meta.totalWords);
        }
      }).catch(() => {});
    }
  }, [documentHandle, initialTotalWords, fallbackWords]);

  // Handle document switch: increment token and clear cache
  const lastDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = documentHandle?.id || 'fallback';
    if (lastDocIdRef.current !== currentId) {
      lastDocIdRef.current = currentId;
      tokenRef.current += 1;
      setGenerationToken(tokenRef.current);
      loadedChunksRef.current.clear();
      loadingPromisesRef.current.clear();
      setCurrentChunkIndex(0);
      setChunksRevision((r) => r + 1);
    }
  }, [documentHandle?.id]);

  /**
   * Enforces bounded memory: keeps only centerChunkIndex ± 1 in memory.
   */
  const pruneLoadedChunks = useCallback((centerChunkIndex: number) => {
    if (!documentHandle) return;
    const loaded = loadedChunksRef.current;
    if (loaded.size <= MAX_HOT_CHUNKS) return;

    for (const chunkIndex of Array.from(loaded.keys())) {
      if (Math.abs(chunkIndex - centerChunkIndex) > 1) {
        loaded.delete(chunkIndex);
      }
    }
    // Also notify handle to prune internal caches
    documentHandle.setActiveChunk?.(centerChunkIndex, 1);
  }, [documentHandle]);

  /**
   * Asynchronously loads and parses a chunk, caching it in loadedChunksRef.
   */
  const loadChunk = useCallback(
    async (chunkIndex: number, expectedToken: number): Promise<LoadedChunkInfo | null> => {
      if (!documentHandle) return null;

      // Check if already in cache
      if (loadedChunksRef.current.has(chunkIndex)) {
        return loadedChunksRef.current.get(chunkIndex)!;
      }

      // Check if already being fetched
      if (loadingPromisesRef.current.has(chunkIndex)) {
        return loadingPromisesRef.current.get(chunkIndex)!;
      }

      const fetchPromise = (async () => {
        try {
          // Get location index to determine exact startWordIndex
          const locIndex = documentHandle.getLocationIndex
            ? await documentHandle.getLocationIndex()
            : null;
          const ranges = locIndex?.chunks || locIndex?.chunkRanges || [];
          const range = ranges[chunkIndex];

          let startWordIndex = 0;
          let endWordIndex = 0;

          if (range) {
            startWordIndex = range.startWordIndex;
            endWordIndex = range.endWordIndex;
          } else {
            // Fallback: load raw chunk to inspect
            const rawChunk = await documentHandle.getChunk(chunkIndex);
            if (!rawChunk) return null;
            startWordIndex = rawChunk.startWordIndex;
            endWordIndex = rawChunk.endWordIndex;
          }

          // Process or retrieve parsed words for chunk
          const words = documentHandle.getProcessedWordsForChunk
            ? await documentHandle.getProcessedWordsForChunk(chunkIndex, highlightStyle)
            : [];

          // Stale request check
          if (expectedToken !== tokenRef.current) {
            return null;
          }

          const info: LoadedChunkInfo = {
            chunkIndex,
            startWordIndex,
            endWordIndex: endWordIndex || (startWordIndex + words.length - 1),
            words,
          };

          loadedChunksRef.current.set(chunkIndex, info);
          return info;
        } catch (err) {
          console.warn(`Failed to load chunk ${chunkIndex}:`, err);
          return null;
        } finally {
          loadingPromisesRef.current.delete(chunkIndex);
        }
      })();

      loadingPromisesRef.current.set(chunkIndex, fetchPromise);
      return fetchPromise;
    },
    [documentHandle, highlightStyle]
  );

  /**
   * Retrieves a word at a global index from the currently loaded chunks.
   * Returns undefined if the word's chunk is not yet loaded into memory.
   */
  const getWordAt = useCallback(
    (globalIndex: number): HighlightedWordParts | undefined => {
      if (globalIndex < 0) return undefined;

      // 1. Fallback words array (for small / in-memory texts)
      if (fallbackWords && fallbackWords.length > 0) {
        return fallbackWords[globalIndex];
      }

      // 2. Look up in loaded chunks
      for (const info of loadedChunksRef.current.values()) {
        if (globalIndex >= info.startWordIndex && globalIndex <= info.endWordIndex) {
          const relativeIndex = globalIndex - info.startWordIndex;
          return info.words[relativeIndex];
        }
      }

      return undefined;
    },
    [fallbackWords]
  );

  /**
   * Checks if approaching the edge of the current chunk and triggers background prefetch.
   */
  const checkAndPrefetch = useCallback(
    (index: number) => {
      if (!documentHandle) return;

      const currentInfo = loadedChunksRef.current.get(currentChunkIndex);
      if (!currentInfo) return;

      const token = tokenRef.current;

      // Approaching end of chunk -> prefetch next chunk
      if (index >= currentInfo.endWordIndex - PREFETCH_THRESHOLD) {
        const nextChunk = currentChunkIndex + 1;
        if (!loadedChunksRef.current.has(nextChunk)) {
          loadChunk(nextChunk, token).catch(() => {});
        }
      }

      // Approaching start of chunk -> prefetch previous chunk
      if (index <= currentInfo.startWordIndex + PREFETCH_THRESHOLD && currentChunkIndex > 0) {
        const prevChunk = currentChunkIndex - 1;
        if (!loadedChunksRef.current.has(prevChunk)) {
          loadChunk(prevChunk, token).catch(() => {});
        }
      }
    },
    [documentHandle, currentChunkIndex, loadChunk]
  );

  /**
   * Ensures that the chunk containing globalWordIndex is loaded.
   */
  const ensureWordAvailable = useCallback(
    async (globalIndex: number): Promise<boolean> => {
      if (fallbackWords && fallbackWords.length > 0) {
        return globalIndex >= 0 && globalIndex < fallbackWords.length;
      }

      if (!documentHandle) return false;

      // Already in memory
      if (getWordAt(globalIndex)) {
        return true;
      }

      const token = tokenRef.current;
      try {
        const locationInfo = await documentHandle.getLocationInfo(globalIndex);
        if (!locationInfo) return false;

        const info = await loadChunk(locationInfo.chunkIndex, token);
        if (token === tokenRef.current && info) {
          setCurrentChunkIndex(locationInfo.chunkIndex);
          pruneLoadedChunks(locationInfo.chunkIndex);
          setChunksRevision((r) => r + 1);
          return true;
        }
      } catch (err) {
        console.warn(`Error ensuring word at index ${globalIndex}:`, err);
      }
      return false;
    },
    [fallbackWords, documentHandle, getWordAt, loadChunk, pruneLoadedChunks]
  );

  /**
   * Seeks to a specific global word index, loading the target chunk if needed.
   */
  const seekToIndex = useCallback(
    async (targetIndex: number): Promise<boolean> => {
      const validIndex = Math.max(0, isNaN(targetIndex) ? 0 : Math.floor(targetIndex));
      tokenRef.current += 1;
      const token = tokenRef.current;
      setGenerationToken(token);

      if (fallbackWords && fallbackWords.length > 0) {
        if (onIndexChange) onIndexChange(validIndex);
        return true;
      }

      if (!documentHandle) {
        if (onIndexChange) onIndexChange(validIndex);
        return true;
      }

      // Check if target word is already loaded
      const word = getWordAt(validIndex);
      if (word) {
        // Resolve target chunk index
        for (const info of loadedChunksRef.current.values()) {
          if (validIndex >= info.startWordIndex && validIndex <= info.endWordIndex) {
            setCurrentChunkIndex(info.chunkIndex);
            pruneLoadedChunks(info.chunkIndex);
            break;
          }
        }
        if (onIndexChange) onIndexChange(validIndex);
        checkAndPrefetch(validIndex);
        return true;
      }

      // Target chunk is not in memory -> display loading state gracefully
      setIsLoadingChunk(true);
      try {
        const locationInfo = await documentHandle.getLocationInfo(validIndex);
        if (token !== tokenRef.current) return false;

        const info = await loadChunk(locationInfo.chunkIndex, token);
        if (token !== tokenRef.current) return false;

        if (info) {
          setCurrentChunkIndex(locationInfo.chunkIndex);
          pruneLoadedChunks(locationInfo.chunkIndex);
          setChunksRevision((r) => r + 1);
        }

        if (onIndexChange) onIndexChange(validIndex);
        checkAndPrefetch(validIndex);
        return true;
      } catch (err) {
        console.warn('Error during seekToIndex:', err);
        return false;
      } finally {
        if (token === tokenRef.current) {
          setIsLoadingChunk(false);
        }
      }
    },
    [fallbackWords, documentHandle, getWordAt, onIndexChange, checkAndPrefetch, loadChunk, pruneLoadedChunks]
  );

  /**
   * Seeks directly to a page in a structured document (e.g. Page 300 of a 1000-page PDF).
   */
  const seekToPage = useCallback(
    async (pageNumber: number): Promise<boolean> => {
      if (!documentHandle) return false;
      try {
        const resolved = await documentHandle.resolvePage(pageNumber);
        return seekToIndex(resolved.globalWordIndex);
      } catch (err) {
        console.warn(`Failed to seek to page ${pageNumber}:`, err);
        return false;
      }
    },
    [documentHandle, seekToIndex]
  );

  /**
   * Seeks directly to a chapter boundary.
   */
  const seekToChapter = useCallback(
    async (chapterId: string): Promise<boolean> => {
      if (!documentHandle) return false;
      try {
        const resolved = await documentHandle.resolveChapter(chapterId);
        return seekToIndex(resolved.globalWordIndex);
      } catch (err) {
        console.warn(`Failed to seek to chapter ${chapterId}:`, err);
        return false;
      }
    },
    [documentHandle, seekToIndex]
  );

  /**
   * Seeks directly to a section heading.
   */
  const seekToSection = useCallback(
    async (sectionId: string): Promise<boolean> => {
      if (!documentHandle) return false;
      try {
        const resolved = await documentHandle.resolveSection(sectionId);
        return seekToIndex(resolved.globalWordIndex);
      } catch (err) {
        console.warn(`Failed to seek to section ${sectionId}:`, err);
        return false;
      }
    },
    [documentHandle, seekToIndex]
  );

  // Initial chunk load when documentHandle or currentIndex changes
  useEffect(() => {
    let isCancelled = false;
    if (fallbackWords && fallbackWords.length > 0) return;
    if (!documentHandle) return;

    // If word is already in memory, just prefetch
    if (getWordAt(currentIndex)) {
      checkAndPrefetch(currentIndex);
      return;
    }

    const token = tokenRef.current;
    setIsLoadingChunk(true);

    documentHandle.getLocationInfo(currentIndex)
      .then((locInfo) => {
        if (isCancelled || token !== tokenRef.current) return null;
        setCurrentChunkIndex(locInfo.chunkIndex);
        return loadChunk(locInfo.chunkIndex, token);
      })
      .then((info) => {
        if (isCancelled || token !== tokenRef.current) return;
        if (info) {
          pruneLoadedChunks(info.chunkIndex);
          setChunksRevision((r) => r + 1);
          checkAndPrefetch(currentIndex);
        }
      })
      .catch((err) => {
        if (!isCancelled) console.warn('Initial chunk loading error:', err);
      })
      .finally(() => {
        if (!isCancelled && token === tokenRef.current) {
          setIsLoadingChunk(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [documentHandle, currentIndex, fallbackWords, getWordAt, loadChunk, checkAndPrefetch, pruneLoadedChunks]);

  // When playback is active and approaching chunk edge, prefetch
  useEffect(() => {
    if (isPlaying && documentHandle) {
      checkAndPrefetch(currentIndex);
    }
  }, [isPlaying, currentIndex, documentHandle, checkAndPrefetch]);

  // Active words for current display
  const currentWord = getWordAt(currentIndex) || null;
  const prevWord = currentIndex > 0 ? getWordAt(currentIndex - 1) || null : null;
  const nextWord = currentIndex < effectiveTotalWords - 1 ? getWordAt(currentIndex + 1) || null : null;

  // Small window of words around currentIndex (e.g. ± 16 words) for HorizontalRSVPReel
  const windowWords = (() => {
    if (fallbackWords && fallbackWords.length > 0) return fallbackWords;
    const windowStart = Math.max(0, currentIndex - 16);
    const windowEnd = Math.min(effectiveTotalWords - 1, currentIndex + 16);
    const words: HighlightedWordParts[] = [];
    for (let i = windowStart; i <= windowEnd; i++) {
      const w = getWordAt(i);
      if (w) words.push(w);
    }
    return words;
  })();

  return {
    currentWord,
    prevWord,
    nextWord,
    currentIndex,
    totalWords: effectiveTotalWords,
    isLoadingChunk,
    currentChunkIndex,
    generationToken,
    getWordAt,
    ensureWordAvailable,
    seekToIndex,
    seekToPage,
    seekToChapter,
    seekToSection,
    checkAndPrefetch,
    windowWords,
  };
}
