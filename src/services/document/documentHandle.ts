/**
 * Phase 2 Scalable Document Model: ReaderDocumentHandle
 * 
 * Clean application-level abstraction that allows readers to request content
 * without knowing how the document is physically stored (IndexedDB, memory, etc.).
 */

import {
  DocumentMetadata,
  DocumentChunk,
  ReaderDocumentHandle,
  DocumentStructure,
  PageIndexEntry,
  DocumentPosition,
  ResolvedDocumentPosition,
  SearchOptions,
  SearchResult,
  DocumentLocationIndex,
} from '../../types';
import { documentStorageService } from './documentStorageService';
import { findChunkIndexForWord } from './chunking';
import { countWordsFast } from '../../utils/textParser';
import {
  resolvePosition,
  resolvePage,
  resolveChapter,
  resolveSection,
  resolveWordIndex,
} from '../structure/locationResolver';
import { searchDocument } from '../structure/searchIndex';

export class DocumentHandle implements ReaderDocumentHandle {
  public readonly id: string;
  private cachedMetadata: DocumentMetadata | null = null;
  private cachedStructure: DocumentStructure | null = null;
  private cachedLocationIndex: DocumentLocationIndex | null = null;
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
   * Retrieves the document location index, using cache if available.
   */
  public async getLocationIndex(): Promise<DocumentLocationIndex | null> {
    if (this.cachedLocationIndex) {
      return this.cachedLocationIndex;
    }

    const idx = await documentStorageService.getLocationIndex(this.id);
    this.cachedLocationIndex = idx;
    return idx;
  }

  /**
   * Returns document paragraphs without requiring full text reconstruction when structure exists.
   */
  public async getParagraphs(): Promise<string[]> {
    const structure = await this.getStructure();
    if (structure?.paragraphs && structure.paragraphs.length > 0) {
      return structure.paragraphs.map((p) => p.preview || '');
    }
    const text = await this.getFullText();
    return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  }

  /**
   * Calculates chunk location, relative offset within chunk, and overall reading progress.
   * Uses O(log N) binary search over lightweight DocumentLocationIndex without loading full chunks.
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

    const locationIndex = await this.getLocationIndex();
    const chunkRanges = locationIndex?.chunks || locationIndex?.chunkRanges || [];
    const chunkIdx = findChunkIndexForWord(chunkRanges, clampedWordIdx);
    const activeRange = chunkRanges[chunkIdx];

    const wordIndexInChunk = activeRange
      ? Math.max(0, clampedWordIdx - activeRange.startWordIndex)
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
   * Retrieves the document structure, using cache if available.
   */
  public async getStructure(): Promise<DocumentStructure | null> {
    if (this.cachedStructure) {
      return this.cachedStructure;
    }

    const structure = await documentStorageService.getStructure(this.id);
    this.cachedStructure = structure;
    return structure;
  }

  /**
   * Retrieves the PDF page index entries (if paginated).
   */
  public async getPages(): Promise<PageIndexEntry[] | null> {
    const structure = await this.getStructure();
    return structure?.pages || null;
  }

  private getResolverContext() {
    return {
      meta: this.cachedMetadata,
      structure: this.cachedStructure,
      locationIndex: this.cachedLocationIndex,
    };
  }

  /**
   * Resolves a source-aware position into a canonical reading position.
   */
  public async resolvePosition(position: DocumentPosition): Promise<ResolvedDocumentPosition> {
    return resolvePosition(this.id, position, this.getResolverContext());
  }

  /**
   * Resolves a page number into a canonical reading position.
   */
  public async resolvePage(pageNumber: number): Promise<ResolvedDocumentPosition> {
    return resolvePage(this.id, pageNumber, 0, this.getResolverContext());
  }

  /**
   * Resolves a chapter ID into a canonical reading position.
   */
  public async resolveChapter(chapterId: string): Promise<ResolvedDocumentPosition> {
    return resolveChapter(this.id, chapterId, 0, this.getResolverContext());
  }

  /**
   * Resolves a section ID into a canonical reading position.
   */
  public async resolveSection(sectionId: string): Promise<ResolvedDocumentPosition> {
    return resolveSection(this.id, sectionId, 0, this.getResolverContext());
  }

  /**
   * Resolves a word index into a canonical reading position.
   */
  public async resolveWordIndex(wordIndex: number): Promise<ResolvedDocumentPosition> {
    return resolveWordIndex(this.id, wordIndex, this.getResolverContext());
  }

  /**
   * Searches the document for a query term.
   */
  public async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return searchDocument(this.id, query, options);
  }

  /**
   * Invalidates internal caches if document changed externally.
   */
  public invalidateCache(): void {
    this.cachedMetadata = null;
    this.cachedStructure = null;
    this.cachedLocationIndex = null;
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
