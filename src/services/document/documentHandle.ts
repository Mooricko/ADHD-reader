/**
 * Phase 2 Scalable Document Model: ReaderDocumentHandle
 * 
 * Clean application-level abstraction that allows readers to request content
 * without knowing how the document is physically stored (IndexedDB, memory, etc.).
 */

import { DocumentMetadata, DocumentChunk, ReaderDocumentHandle } from '../../types';
import { documentStorageService } from './documentStorageService';
import { findChunkIndexForWord } from './chunking';
import { countWordsFast } from '../../utils/textParser';

export class DocumentHandle implements ReaderDocumentHandle {
  public readonly id: string;
  private cachedMetadata: DocumentMetadata | null = null;
  private chunkCache: Map<number, DocumentChunk> = new Map();
  private fullTextCache: string | null = null;

  constructor(id: string, initialMetadata?: DocumentMetadata) {
    this.id = id;
    if (initialMetadata) {
      this.cachedMetadata = initialMetadata;
    }
  }

  /**
   * Retrieves document metadata, using memory cache if available.
   */
  public async getMetadata(): Promise<DocumentMetadata> {
    if (this.cachedMetadata) {
      return this.cachedMetadata;
    }

    const meta = await documentStorageService.getMetadata(this.id);
    if (!meta) {
      throw new Error(`Document metadata not found for ID: ${this.id}`);
    }

    this.cachedMetadata = meta;
    return meta;
  }

  /**
   * Retrieves a single chunk by its index, caching it locally in the handle.
   */
  public async getChunk(chunkIndex: number): Promise<DocumentChunk | null> {
    if (this.chunkCache.has(chunkIndex)) {
      return this.chunkCache.get(chunkIndex)!;
    }

    const chunk = await documentStorageService.getChunk(this.id, chunkIndex);
    if (chunk) {
      this.chunkCache.set(chunkIndex, chunk);
    }
    return chunk;
  }

  /**
   * Retrieves adjacent chunks surrounding currentChunkIndex.
   * Warms the local handle chunk cache.
   */
  public async getAdjacentChunks(
    currentChunkIndex: number,
    radius: number = 1
  ): Promise<DocumentChunk[]> {
    const chunks = await documentStorageService.getAdjacentChunks(
      this.id,
      currentChunkIndex,
      radius
    );

    for (const c of chunks) {
      this.chunkCache.set(c.chunkIndex, c);
    }

    return chunks;
  }

  /**
   * Retrieves an array of individual words within the global word range [startWordIndex, endWordIndex].
   */
  public async getWordsInRange(
    startWordIndex: number,
    endWordIndex: number
  ): Promise<string[]> {
    if (startWordIndex > endWordIndex) return [];

    const chunks = await documentStorageService.getChunksForWordRange(
      this.id,
      startWordIndex,
      endWordIndex
    );

    // Warm cache
    for (const c of chunks) {
      this.chunkCache.set(c.chunkIndex, c);
    }

    // Combine chunk text and split into words
    const allWords: string[] = [];
    for (const chunk of chunks) {
      const chunkWords = chunk.text.trim().split(/\s+/).filter(Boolean);
      for (let i = 0; i < chunkWords.length; i++) {
        const globalIdx = chunk.startWordIndex + i;
        if (globalIdx >= startWordIndex && globalIdx <= endWordIndex) {
          allWords.push(chunkWords[i]);
        }
      }
    }

    return allWords;
  }

  /**
   * Returns document paragraphs.
   */
  public async getParagraphs(): Promise<string[]> {
    const text = await this.getFullText();
    return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  }

  /**
   * Calculates chunk location, relative offset within chunk, and overall reading progress.
   */
  public async getLocationInfo(wordIndex: number): Promise<{
    chunkIndex: number;
    wordIndexInChunk: number;
    progressPercent: number;
    totalWords: number;
  }> {
    const meta = await this.getMetadata();
    const totalWords = Math.max(1, meta.totalWords);
    const clampedWordIdx = Math.max(0, Math.min(wordIndex, totalWords - 1));

    const allChunks = await documentStorageService.getAllChunks(this.id);
    const chunkIdx = findChunkIndexForWord(allChunks, clampedWordIdx);
    const activeChunk = allChunks[chunkIdx];

    const wordIndexInChunk = activeChunk
      ? Math.max(0, clampedWordIdx - activeChunk.startWordIndex)
      : 0;

    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round(((clampedWordIdx + 1) / totalWords) * 100))
    );

    return {
      chunkIndex: chunkIdx,
      wordIndexInChunk,
      progressPercent,
      totalWords: meta.totalWords,
    };
  }

  /**
   * Retrieves the full text of the document.
   */
  public async getFullText(): Promise<string> {
    if (this.fullTextCache !== null) {
      return this.fullTextCache;
    }

    const text = await documentStorageService.getDocumentText(this.id);
    this.fullTextCache = text ?? '';
    return this.fullTextCache;
  }

  /**
   * Updates reading progress index in storage and updates cached metadata.
   */
  public async updateProgress(wordIndex: number): Promise<void> {
    await documentStorageService.updateReadingProgress(this.id, wordIndex);
    if (this.cachedMetadata) {
      this.cachedMetadata.lastReadWordIndex = wordIndex;
      this.cachedMetadata.updatedAt = Date.now();
    }
  }

  /**
   * Invalidates internal caches if document changed externally.
   */
  public invalidateCache(): void {
    this.cachedMetadata = null;
    this.chunkCache.clear();
    this.fullTextCache = null;
  }
}

/**
 * Creates a ReaderDocumentHandle instance for an existing document.
 */
export function createDocumentHandle(
  documentId: string,
  initialMetadata?: DocumentMetadata
): ReaderDocumentHandle {
  return new DocumentHandle(documentId, initialMetadata);
}

/**
 * Helper to create a new document in storage and return its ReaderDocumentHandle.
 */
export async function createAndStoreDocumentHandle(input: {
  id?: string;
  title: string;
  text: string;
  sourceType?: DocumentMetadata['sourceType'];
  sourceUrl?: string;
  fileName?: string;
  direction?: 'ltr' | 'rtl';
  category?: string;
}): Promise<ReaderDocumentHandle> {
  const { metadata } = await documentStorageService.createAndSaveDocument(input);
  return new DocumentHandle(metadata.id, metadata);
}
