/**
 * Document Chunking Engine for Phase 2 Scalable Document Model
 * 
 * Divides large texts into indexable, paragraph-aware chunks.
 * Keeps memory low and enables efficient chunk-based retrieval in IndexedDB.
 */

import { DocumentChunk, DocumentLocationIndex } from '../../types';
import { countWordsFast, splitIntoSentences } from '../../utils/textParser';

export const DEFAULT_CHUNK_TARGET_WORDS = 500;
export const MIN_CHUNK_WORDS = 100;
export const MAX_CHUNK_WORDS = 1000;

interface ParagraphSegment {
  paragraphIndex: number;
  sentences: string[];
}

/**
 * Splits plain or markdown text into ordered DocumentChunk records.
 * Prioritizes paragraph boundaries (\n\n) and sentence boundaries.
 * Guarantees that sentences within the same paragraph are joined with ' ' (not '\n\n'),
 * and only distinct paragraphs are separated by '\n\n'.
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
        startParagraphIndex: 0,
        endParagraphIndex: 0,
      },
    ];
  }

  // Split into raw paragraphs preserving empty lines as delimiters
  const paragraphs = text.split(/\r?\n\s*\r?\n+/);
  const chunks: DocumentChunk[] = [];

  let currentSegments: ParagraphSegment[] = [];
  let currentChunkWords = 0;
  let currentChunkStartChar = 0;
  let globalWordIndex = 0;
  let globalCharIndex = 0;
  let currentChunkStartWord = 0;

  const flushChunk = (isFinal = false) => {
    if (currentSegments.length === 0) return;

    // Join sentences within each paragraph segment with ' ', then join different segments with '\n\n'
    const chunkText = currentSegments
      .map((seg) => seg.sentences.join(' '))
      .join('\n\n');
    const count = countWordsFast(chunkText);
    const startParagraphIndex = currentSegments[0].paragraphIndex;
    const endParagraphIndex = currentSegments[currentSegments.length - 1].paragraphIndex;

    chunks.push({
      documentId,
      chunkIndex: chunks.length,
      startWordIndex: currentChunkStartWord,
      endWordIndex: Math.max(currentChunkStartWord, currentChunkStartWord + count - 1),
      text: chunkText,
      wordCount: count,
      startCharIndex: currentChunkStartChar,
      endCharIndex: isFinal ? text.length : globalCharIndex,
      startParagraphIndex,
      endParagraphIndex,
    });

    currentSegments = [];
    currentChunkWords = 0;
    currentChunkStartChar = globalCharIndex;
    currentChunkStartWord = globalWordIndex;
  };

  const addSentenceToChunk = (pIndex: number, sentenceText: string, words: number) => {
    const lastSeg = currentSegments[currentSegments.length - 1];
    if (lastSeg && lastSeg.paragraphIndex === pIndex) {
      lastSeg.sentences.push(sentenceText);
    } else {
      currentSegments.push({ paragraphIndex: pIndex, sentences: [sentenceText] });
    }
    currentChunkWords += words;
    globalWordIndex += words;
    globalCharIndex += sentenceText.length;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const rawPara = paragraphs[i];
    const para = rawPara.trim();
    if (!para) continue;

    const paraWords = countWordsFast(para);

    // If a single paragraph is oversized (> MAX_CHUNK_WORDS or > targetWords * 1.5), break it into individual sentences
    const isOversized = paraWords > MAX_CHUNK_WORDS || (paraWords > targetWords * 1.5 && paraWords >= MIN_CHUNK_WORDS);
    if (isOversized) {
      const sentences = splitIntoSentences(para);

      for (const sentence of sentences) {
        const sentWords = countWordsFast(sentence);
        if (currentChunkWords + sentWords > targetWords && currentChunkWords >= MIN_CHUNK_WORDS) {
          flushChunk();
        }
        addSentenceToChunk(i, sentence, sentWords);
      }

      globalCharIndex += 2; // for paragraph break separator
      continue;
    }

    // Normal paragraph: check if we should flush the accumulated chunk
    if (
      currentChunkWords + paraWords > targetWords &&
      currentChunkWords >= MIN_CHUNK_WORDS
    ) {
      flushChunk();
    }

    addSentenceToChunk(i, para, paraWords);
    globalCharIndex += 2; // for paragraph break separator
  }

  // Flush any remaining segments
  flushChunk(true);

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
    chunks: chunkRanges,
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
 * Preserves paragraph breaks (\n\n) between distinct paragraphs, while
 * joining with ' ' when an oversized paragraph spans across chunk boundaries.
 */
export function reconstructTextFromChunks(chunks: DocumentChunk[]): string {
  if (!chunks || chunks.length === 0) return '';
  const sorted = chunks.slice().sort((a, b) => a.chunkIndex - b.chunkIndex);

  let result = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const isSameParagraph =
      prev.endParagraphIndex !== undefined &&
      curr.startParagraphIndex !== undefined &&
      prev.endParagraphIndex === curr.startParagraphIndex;

    result += (isSameParagraph ? ' ' : '\n\n') + curr.text;
  }

  return result;
}
