/**
 * Document Chunking Engine for Phase 2 Scalable Document Model
 * 
 * Divides large texts into indexable, paragraph-aware chunks.
 * Keeps memory low and enables efficient chunk-based retrieval in IndexedDB.
 */

import { DocumentChunk, DocumentLocationIndex } from '../../types';
import { countWordsFast } from '../../utils/textParser';

export const DEFAULT_CHUNK_TARGET_WORDS = 500;
export const MIN_CHUNK_WORDS = 100;
export const MAX_CHUNK_WORDS = 1000;

/**
 * Splits plain or markdown text into ordered DocumentChunk records.
 * Prioritizes paragraph boundaries (\n\n) and sentence boundaries.
 */
export function chunkDocument(
  documentId: string,
  text: string,
  targetWords: number = DEFAULT_CHUNK_TARGET_WORDS
): DocumentChunk[] {
  if (!text || text.trim().length === 0) {
    return [
      {
        documentId,
        chunkIndex: 0,
        startWordIndex: 0,
        endWordIndex: 0,
        text: '',
        wordCount: 0,
        startCharIndex: 0,
        endCharIndex: 0,
      },
    ];
  }

  // Split into raw paragraphs preserving empty lines as delimiters
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: DocumentChunk[] = [];

  let currentChunkTextParts: string[] = [];
  let currentChunkWords = 0;
  let currentChunkStartChar = 0;
  let globalWordIndex = 0;
  let globalCharIndex = 0;
  let currentChunkStartWord = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraWords = countWordsFast(para);

    // If a single paragraph is enormous (> MAX_CHUNK_WORDS), break it by sentences or word windows
    if (paraWords > MAX_CHUNK_WORDS) {
      // First, flush any accumulated chunk
      if (currentChunkTextParts.length > 0) {
        const chunkText = currentChunkTextParts.join('\n\n');
        const count = countWordsFast(chunkText);
        chunks.push({
          documentId,
          chunkIndex: chunks.length,
          startWordIndex: currentChunkStartWord,
          endWordIndex: Math.max(currentChunkStartWord, currentChunkStartWord + count - 1),
          text: chunkText,
          wordCount: count,
          startCharIndex: currentChunkStartChar,
          endCharIndex: globalCharIndex,
        });
        currentChunkTextParts = [];
        currentChunkWords = 0;
        currentChunkStartChar = globalCharIndex;
        currentChunkStartWord = globalWordIndex;
      }

      // Split oversized paragraph into smaller sentences / fragments
      const sentenceRegex = /([^.!?\n]+[.!?]+(?:\s+|$)|[^\n]+(?:\n|$))/g;
      const sentences = para.match(sentenceRegex) || [para];

      for (const sentence of sentences) {
        const sentWords = countWordsFast(sentence);
        if (currentChunkWords + sentWords > targetWords && currentChunkWords >= MIN_CHUNK_WORDS) {
          const chunkText = currentChunkTextParts.join(' ');
          const count = countWordsFast(chunkText);
          chunks.push({
            documentId,
            chunkIndex: chunks.length,
            startWordIndex: currentChunkStartWord,
            endWordIndex: Math.max(currentChunkStartWord, currentChunkStartWord + count - 1),
            text: chunkText,
            wordCount: count,
            startCharIndex: currentChunkStartChar,
            endCharIndex: globalCharIndex,
          });
          currentChunkTextParts = [];
          currentChunkWords = 0;
          currentChunkStartChar = globalCharIndex;
          currentChunkStartWord = globalWordIndex;
        }

        currentChunkTextParts.push(sentence.trim());
        currentChunkWords += sentWords;
        globalWordIndex += sentWords;
        globalCharIndex += sentence.length;
      }

      continue;
    }

    // Normal paragraph accumulation
    if (
      currentChunkWords + paraWords > targetWords &&
      currentChunkWords >= MIN_CHUNK_WORDS
    ) {
      const chunkText = currentChunkTextParts.join('\n\n');
      const count = countWordsFast(chunkText);
      chunks.push({
        documentId,
        chunkIndex: chunks.length,
        startWordIndex: currentChunkStartWord,
        endWordIndex: Math.max(currentChunkStartWord, currentChunkStartWord + count - 1),
        text: chunkText,
        wordCount: count,
        startCharIndex: currentChunkStartChar,
        endCharIndex: globalCharIndex,
      });

      currentChunkTextParts = [para];
      currentChunkWords = paraWords;
      currentChunkStartChar = globalCharIndex;
      currentChunkStartWord = globalWordIndex;
    } else {
      currentChunkTextParts.push(para);
      currentChunkWords += paraWords;
    }

    globalWordIndex += paraWords;
    globalCharIndex += para.length + 2; // +2 for '\n\n'
  }

  // Flush final remaining chunk
  if (currentChunkTextParts.length > 0) {
    const chunkText = currentChunkTextParts.join('\n\n');
    const count = countWordsFast(chunkText);
    chunks.push({
      documentId,
      chunkIndex: chunks.length,
      startWordIndex: currentChunkStartWord,
      endWordIndex: Math.max(currentChunkStartWord, currentChunkStartWord + count - 1),
      text: chunkText,
      wordCount: count,
      startCharIndex: currentChunkStartChar,
      endCharIndex: text.length,
    });
  }

  return chunks;
}

/**
 * Builds a fast lookup index from a list of chunks.
 */
export function buildLocationIndex(
  documentId: string,
  chunks: DocumentChunk[],
  totalCharacters: number
): DocumentLocationIndex {
  let totalWords = 0;
  const chunkRanges = chunks.map((c) => {
    totalWords += c.wordCount;
    return {
      chunkIndex: c.chunkIndex,
      startWordIndex: c.startWordIndex,
      endWordIndex: c.endWordIndex,
      wordCount: c.wordCount,
    };
  });

  return {
    documentId,
    totalChunks: chunks.length,
    totalWords,
    totalCharacters,
    chunkRanges,
  };
}

/**
 * Finds the chunkIndex containing the given 0-based word index using binary search.
 */
export function findChunkIndexForWord(
  chunks: Array<{ chunkIndex: number; startWordIndex: number; endWordIndex: number }>,
  wordIndex: number
): number {
  if (chunks.length === 0) return 0;
  if (wordIndex <= 0) return 0;

  let low = 0;
  let high = chunks.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const chunk = chunks[mid];

    if (wordIndex >= chunk.startWordIndex && wordIndex <= chunk.endWordIndex) {
      return chunk.chunkIndex;
    } else if (wordIndex < chunk.startWordIndex) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // If past the end, clamp to last chunk
  return Math.min(chunks.length - 1, Math.max(0, low));
}

/**
 * Reconstructs full document text from an ordered array of chunks.
 */
export function reconstructTextFromChunks(chunks: DocumentChunk[]): string {
  if (!chunks || chunks.length === 0) return '';
  return chunks
    .slice()
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((c) => c.text)
    .join('\n\n');
}
