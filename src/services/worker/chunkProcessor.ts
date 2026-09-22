/**
 * Pure Chunk Processing Engine
 * 
 * Reusable processing function that runs either in a Web Worker or in fallback / test runners.
 * Reuses existing pure parsing routines to prevent duplication.
 */

import { HighlightStyle, HighlightedWordParts } from '../../types';
import { splitWordParts, isRtlText, dehyphenateText, countWordsFast, splitIntoSentences } from '../../utils/textParser';
import { ChunkReadyMetadata } from './workerProtocol';

export interface ProcessChunkInput {
  documentId: string;
  chunkIndex: number;
  text: string;
  startWordIndex: number;
  highlightStyle: HighlightStyle;
  options?: {
    direction?: 'ltr' | 'rtl';
    sourceType?: string;
    startParagraphIndex?: number;
    paragraphs?: Array<{ startWordIndex: number; endWordIndex: number; paragraphIndex: number }>;
  };
}

export interface ProcessChunkOutput {
  words: HighlightedWordParts[];
  metadata: ChunkReadyMetadata;
}

/**
 * Pure function to process a single bounded text chunk.
 * 
 * Extracts tokens, highlights according to style, assigns global indices,
 * marks paragraph breaks, and identifies punctuation timing metadata.
 */
export function processChunkPure(input: ProcessChunkInput): ProcessChunkOutput {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rawText = input.text || '';

  if (!rawText.trim()) {
    return {
      words: [],
      metadata: {
        startWordIndex: input.startWordIndex,
        endWordIndex: input.startWordIndex,
        wordCount: 0,
        paragraphCount: 0,
        isRtl: false,
        durationMs: 0,
      },
    };
  }

  // 1. Light text normalization: dehyphenate linebreaks
  const cleanedText = dehyphenateText(rawText);

  // 2. Chunk-level RTL detection
  const isChunkRtl = input.options?.direction === 'rtl' || isRtlText(cleanedText);

  // 3. Paragraph splitting using double newlines so soft line breaks do not break paragraphs
  const paragraphs = cleanedText.split(/\r?\n\s*\r?\n+/);
  const words: HighlightedWordParts[] = [];
  let currentWordIndex = input.startWordIndex;
  let paragraphCount = 0;
  const baseParagraphIndex = input.options?.startParagraphIndex ?? 0;
  const structureParagraphs = input.options?.paragraphs;

  for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
    const paragraph = paragraphs[pIndex];
    const rawTokens = paragraph.match(/\S+/g);
    if (!rawTokens || rawTokens.length === 0) continue;

    paragraphCount++;
    const isLastParagraph = pIndex === paragraphs.length - 1;

    for (let wIndex = 0; wIndex < rawTokens.length; wIndex++) {
      const token = rawTokens[wIndex];
      const isLastInParagraph = wIndex === rawTokens.length - 1;

      // Tokenization & Highlighted letters calculation (reusing splitWordParts)
      const parsedWord = splitWordParts(token, input.highlightStyle, currentWordIndex);
      
      // Determine global paragraph index: prioritize structure index if available, else continuous base offset
      if (structureParagraphs && structureParagraphs.length > 0) {
        const found = structureParagraphs.find(
          (sp) => currentWordIndex >= sp.startWordIndex && currentWordIndex <= sp.endWordIndex
        );
        parsedWord.paragraphIndex = found ? found.paragraphIndex : baseParagraphIndex + pIndex;
      } else {
        parsedWord.paragraphIndex = baseParagraphIndex + pIndex;
      }

      // Inherit chunk direction if word didn't explicitly trigger individual RTL
      if (isChunkRtl && !parsedWord.isRtl) {
        parsedWord.isRtl = true;
      }

      // Paragraph transition marker for flow/RSVP pauses
      if (isLastInParagraph && !isLastParagraph) {
        parsedWord.hasParagraphBreak = true;
      }

      words.push(parsedWord);
      currentWordIndex++;
    }
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const durationMs = Math.round((endTime - startTime) * 100) / 100;
  const wordCount = words.length;
  const endWordIndex = wordCount > 0 ? input.startWordIndex + wordCount - 1 : input.startWordIndex;

  return {
    words,
    metadata: {
      startWordIndex: input.startWordIndex,
      endWordIndex,
      wordCount,
      paragraphCount,
      isRtl: isChunkRtl,
      durationMs,
    },
  };
}

interface WorkerParagraphSegment {
  paragraphIndex: number;
  sentences: string[];
}

/**
 * Splits a full text into bounded chunks suitable for worker processing.
 * Respects paragraph boundaries and target word counts (e.g. 2,000–5,000 words).
 * Sentences within an oversized paragraph are joined with ' ' (not '\n\n').
 */
export function createWorkerChunks(
  text: string,
  targetChunkWords: number = 3000
): Array<{ chunkIndex: number; text: string; startWordIndex: number; wordCount: number }> {
  if (!text || !text.trim()) {
    return [{ chunkIndex: 0, text: '', startWordIndex: 0, wordCount: 0 }];
  }

  const paragraphs = text.split(/\r?\n\s*\r?\n+/);
  const chunks: Array<{ chunkIndex: number; text: string; startWordIndex: number; wordCount: number }> = [];
  const minChunkThreshold = Math.min(500, Math.max(1, Math.floor(targetChunkWords * 0.75)));
  let currentSegments: WorkerParagraphSegment[] = [];
  let currentChunkWords = 0;
  let globalWordIndex = 0;
  let currentChunkStartWord = 0;

  const flushChunk = () => {
    if (currentSegments.length === 0) return;
    const chunkText = currentSegments
      .map((seg) => seg.sentences.join(' '))
      .join('\n\n');
    const count = countWordsFast(chunkText);
    chunks.push({
      chunkIndex: chunks.length,
      text: chunkText,
      startWordIndex: currentChunkStartWord,
      wordCount: count,
    });
    currentSegments = [];
    currentChunkWords = 0;
    currentChunkStartWord = globalWordIndex;
  };

  const addSentence = (pIndex: number, sentenceText: string, words: number) => {
    const lastSeg = currentSegments[currentSegments.length - 1];
    if (lastSeg && lastSeg.paragraphIndex === pIndex) {
      lastSeg.sentences.push(sentenceText);
    } else {
      currentSegments.push({ paragraphIndex: pIndex, sentences: [sentenceText] });
    }
    currentChunkWords += words;
    globalWordIndex += words;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const rawPara = paragraphs[i];
    const para = rawPara.trim();
    if (!para) continue;

    const paraWords = countWordsFast(para);

    // If single paragraph is oversized (> targetChunkWords * 1.5), split into sentences
    if (paraWords > targetChunkWords * 1.5) {
      const sentences = splitIntoSentences(para);
      for (const sent of sentences) {
        const sentWords = countWordsFast(sent);
        if (currentChunkWords + sentWords > targetChunkWords && currentChunkWords >= minChunkThreshold) {
          flushChunk();
        }
        addSentence(i, sent, sentWords);
      }
      continue;
    }

    if (currentChunkWords + paraWords > targetChunkWords && currentChunkWords >= minChunkThreshold) {
      flushChunk();
    }
    addSentence(i, para, paraWords);
  }

  flushChunk();

  return chunks;
}

export interface ChunkBenchmarkResult {
  chunkSizes: Array<{ targetWords: number; throughputWordsPerSec: number; durationMs: number }>;
  recommendedChunkWords: number;
  throughputWordsPerSec: number;
}

/**
 * Benchmarks chunk parsing throughput across candidate chunk sizes (1,000–5,000 words).
 * Verifies optimal throughput without freezing the thread.
 */
export function benchmarkChunkSize(sampleWords = 10000): ChunkBenchmarkResult {
  const sampleVocabulary = [
    'focus', 'attention', 'comprehension', 'neurodiversity', 'fixation',
    'saccade', 'rsvp', 'pacing', 'rhythm', 'highlight', 'reading'
  ];
  const paragraphs: string[] = [];
  for (let i = 0; i < Math.ceil(sampleWords / 50); i++) {
    const pWords = Array.from({ length: 50 }, (_, w) => sampleVocabulary[(i * 50 + w) % sampleVocabulary.length]);
    paragraphs.push(pWords.join(' ') + '.');
  }
  const text = paragraphs.join('\n\n');

  const testSizes = [1000, 2000, 3000, 5000];
  const results: Array<{ targetWords: number; throughputWordsPerSec: number; durationMs: number }> = [];

  for (const size of testSizes) {
    const start = performance.now();
    const chunks = createWorkerChunks(text, size);
    let totalProcessed = 0;
    for (const c of chunks) {
      const res = processChunkPure({
        documentId: 'benchmark',
        chunkIndex: c.chunkIndex,
        text: c.text,
        startWordIndex: c.startWordIndex,
        highlightStyle: 'middle-two',
      });
      totalProcessed += res.words.length;
    }
    const duration = Math.max(0.1, performance.now() - start);
    const throughput = Math.round((totalProcessed / duration) * 1000);
    results.push({
      targetWords: size,
      throughputWordsPerSec: throughput,
      durationMs: Math.round(duration * 100) / 100,
    });
  }

  const optimal =
    results
      .filter((r) => r.targetWords >= 2000 && r.targetWords <= 5000)
      .sort((a, b) => b.throughputWordsPerSec - a.throughputWordsPerSec)[0] || results[0];

  return {
    chunkSizes: results,
    recommendedChunkWords: optimal.targetWords,
    throughputWordsPerSec: optimal.throughputWordsPerSec,
  };
}

