/**
 * Phase 2 Scalable Document Model: Centralized IndexedDB Document Storage Service
 * 
 * Provides an asynchronous, typed interface for storing and retrieving
 * document metadata and chunks.
 * Handles IndexedDB with an automatic in-memory fallback for environments
 * where IndexedDB is unavailable, restricted, or in Node.js test environments.
 */

import {
  DocumentMetadata,
  DocumentChunk,
  InputSourceType,
  DocumentStructure,
  PageIndexEntry,
  DocumentLocationIndex,
} from '../../types';
import { chunkDocument, reconstructTextFromChunks, buildLocationIndex } from './chunking';
import { countWordsFast } from '../../utils/textParser';
import { detectTextDirection } from '../../utils/normalizeText';
import { buildDocumentStructure } from '../structure/structureBuilder';

const DB_NAME = 'adhd_reader_db';
const DB_VERSION = 3;

const STORES = {
  METADATA: 'metadata',
  CHUNKS: 'chunks',
  STRUCTURES: 'structures',
  LOCATION_INDEXES: 'location_indexes',
} as const;

export interface CreateDocumentInput {
  id?: string;
  title: string;
  text: string;
  sourceType?: InputSourceType;
  sourceUrl?: string;
  fileName?: string;
  direction?: 'ltr' | 'rtl';
  category?: string;
  lastReadWordIndex?: number;
  targetChunkWords?: number;
  structure?: DocumentStructure;
  pages?: PageIndexEntry[];
  options?: {
    pageTexts?: string[];
    outlines?: any[];
    headings?: string[];
    markdown?: string;
  };
}

export class DocumentStorageService {
  private db: IDBDatabase | null = null;
  private isFallbackMode = false;
  private initPromise: Promise<void> | null = null;

  // In-memory fallback stores
  private memoryMetadata: Map<string, DocumentMetadata> = new Map();
  private memoryChunks: Map<string, DocumentChunk> = new Map(); // key: `${documentId}:${chunkIndex}`
  private memoryStructures: Map<string, DocumentStructure> = new Map();
  private memoryLocationIndexes: Map<string, DocumentLocationIndex> = new Map();

  constructor() {
    // Determine if IndexedDB is available
    if (typeof window === 'undefined' || !window.indexedDB) {
      this.isFallbackMode = true;
    }
  }

  /**
   * Initializes the database connection and creates stores if needed.
   */
  public async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (this.isFallbackMode) {
        resolve();
        return;
      }

      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // 1. Metadata Object Store
          if (!db.objectStoreNames.contains(STORES.METADATA)) {
            const metaStore = db.createObjectStore(STORES.METADATA, { keyPath: 'id' });
            metaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            metaStore.createIndex('title', 'title', { unique: false });
            metaStore.createIndex('sourceType', 'sourceType', { unique: false });
          }

          // 2. Chunks Object Store (Compound primary key: [documentId, chunkIndex])
          if (!db.objectStoreNames.contains(STORES.CHUNKS)) {
            const chunksStore = db.createObjectStore(STORES.CHUNKS, {
              keyPath: ['documentId', 'chunkIndex'],
            });
            chunksStore.createIndex('documentId', 'documentId', { unique: false });
            chunksStore.createIndex('startWordIndex', 'startWordIndex', { unique: false });
          }

          // 3. Structures Object Store (Primary key: documentId)
          if (!db.objectStoreNames.contains(STORES.STRUCTURES)) {
            db.createObjectStore(STORES.STRUCTURES, { keyPath: 'documentId' });
          }

          // 4. Location Indexes Object Store (Primary key: documentId)
          if (!db.objectStoreNames.contains(STORES.LOCATION_INDEXES)) {
            db.createObjectStore(STORES.LOCATION_INDEXES, { keyPath: 'documentId' });
          }
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve();
        };

        request.onerror = (event) => {
          console.warn('[DocumentStorageService] IndexedDB open error, falling back to memory store:', (event.target as IDBOpenDBRequest).error);
          this.isFallbackMode = true;
          resolve(); // Resolve so the app continues gracefully in memory
        };

        request.onblocked = () => {
          console.warn('[DocumentStorageService] IndexedDB open blocked. Upgrading or another tab open.');
        };
      } catch (err) {
        console.warn('[DocumentStorageService] Exception opening IndexedDB, falling back to memory:', err);
        this.isFallbackMode = true;
        resolve();
      }
    });

    return this.initPromise;
  }

  /**
   * Helper to execute a transaction
   */
  private async getStore(
    storeName: string,
    mode: IDBTransactionMode = 'readonly'
  ): Promise<IDBObjectStore | null> {
    await this.initialize();
    if (this.isFallbackMode || !this.db) {
      return null;
    }
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Saves document metadata record.
   */
  public async saveDocumentMetadata(meta: DocumentMetadata): Promise<void> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      this.memoryMetadata.set(meta.id, { ...meta, updatedAt: Date.now() });
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.METADATA, 'readwrite');
        const store = tx.objectStore(STORES.METADATA);
        const record = { ...meta, updatedAt: Date.now() };
        const req = store.put(record);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        // Fallback
        this.memoryMetadata.set(meta.id, { ...meta, updatedAt: Date.now() });
        resolve();
      }
    });
  }

  /**
   * Saves an array of chunks in bulk.
   */
  public async saveChunks(chunks: DocumentChunk[]): Promise<void> {
    if (!chunks || chunks.length === 0) return;
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      for (const chunk of chunks) {
        const key = `${chunk.documentId}:${chunk.chunkIndex}`;
        this.memoryChunks.set(key, { ...chunk });
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.CHUNKS, 'readwrite');
        const store = tx.objectStore(STORES.CHUNKS);

        for (const chunk of chunks) {
          store.put(chunk);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        for (const chunk of chunks) {
          const key = `${chunk.documentId}:${chunk.chunkIndex}`;
          this.memoryChunks.set(key, { ...chunk });
        }
        resolve();
      }
    });
  }

  /**
   * Saves document structure record.
   */
  public async saveStructure(structure: DocumentStructure): Promise<void> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      this.memoryStructures.set(structure.documentId, { ...structure });
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.STRUCTURES, 'readwrite');
        const store = tx.objectStore(STORES.STRUCTURES);
        const req = store.put(structure);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        this.memoryStructures.set(structure.documentId, { ...structure });
        resolve();
      }
    });
  }

  /**
   * Retrieves document structure by documentId.
   */
  public async getStructure(documentId: string): Promise<DocumentStructure | null> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      return this.memoryStructures.get(documentId) || null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.STRUCTURES, 'readonly');
        const store = tx.objectStore(STORES.STRUCTURES);
        const req = store.get(documentId);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve(this.memoryStructures.get(documentId) || null);
      }
    });
  }

  /**
   * Saves lightweight document location index record.
   */
  public async saveLocationIndex(locationIndex: DocumentLocationIndex): Promise<void> {
    await this.initialize();
    this.memoryLocationIndexes.set(locationIndex.documentId, { ...locationIndex });

    if (this.isFallbackMode || !this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.LOCATION_INDEXES, 'readwrite');
        const store = tx.objectStore(STORES.LOCATION_INDEXES);
        const req = store.put(locationIndex);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        resolve();
      }
    });
  }

  /**
   * Retrieves document location index by documentId.
   * If not found, attempts to reconstruct it once and cache it.
   */
  public async getLocationIndex(documentId: string): Promise<DocumentLocationIndex | null> {
    await this.initialize();

    if (this.memoryLocationIndexes.has(documentId)) {
      return this.memoryLocationIndexes.get(documentId)!;
    }

    if (!this.isFallbackMode && this.db) {
      const idxFromDb = await new Promise<DocumentLocationIndex | null>((resolve) => {
        try {
          const tx = this.db!.transaction(STORES.LOCATION_INDEXES, 'readonly');
          const store = tx.objectStore(STORES.LOCATION_INDEXES);
          const req = store.get(documentId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });

      if (idxFromDb) {
        this.memoryLocationIndexes.set(documentId, idxFromDb);
        return idxFromDb;
      }
    }

    // Fallback: If not found in index store, reconstruct once from chunk ranges and persist
    const chunks = await this.getAllChunks(documentId);
    if (!chunks || chunks.length === 0) {
      return null;
    }
    const meta = await this.getMetadata(documentId);
    const totalChars = meta?.totalCharacters ?? 0;
    const reconstructed = buildLocationIndex(documentId, chunks, totalChars);
    await this.saveLocationIndex(reconstructed);
    return reconstructed;
  }

  /**
   * Convenience method to save metadata, chunks, structure, and locationIndex together.
   */
  public async saveDocument(
    meta: DocumentMetadata,
    chunks: DocumentChunk[],
    structure?: DocumentStructure,
    locationIndex?: DocumentLocationIndex
  ): Promise<void> {
    const updatedMeta: DocumentMetadata = {
      ...meta,
      totalChunks: chunks.length,
      hasStructure: Boolean(structure),
      pageCount: structure?.pages?.length ?? meta.pageCount,
      updatedAt: Date.now(),
    };

    const locIndex =
      locationIndex || buildLocationIndex(meta.id, chunks, meta.totalCharacters);

    const promises: Promise<void>[] = [
      this.saveDocumentMetadata(updatedMeta),
      this.saveChunks(chunks),
      this.saveLocationIndex(locIndex),
    ];
    if (structure) {
      promises.push(this.saveStructure(structure));
    }
    await Promise.all(promises);
  }

  /**
   * Creates a full scalable document: generates metadata, chunks, structure, location index, and persists to IndexedDB.
   */
  public async createAndSaveDocument(input: CreateDocumentInput): Promise<{
    metadata: DocumentMetadata;
    chunks: DocumentChunk[];
    structure: DocumentStructure;
    locationIndex: DocumentLocationIndex;
  }> {
    const docId = input.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const text = input.text ?? '';
    const chunks = chunkDocument(docId, text, input.targetChunkWords);
    const totalWords = countWordsFast(text);
    const totalChars = text.length;
    const direction = input.direction || detectTextDirection(text);

    // Build or use provided structure
    let structure = input.structure;
    if (!structure) {
      structure = buildDocumentStructure(docId, input.sourceType || 'text', text, {
        pageTexts: input.options?.pageTexts,
        outlines: input.options?.outlines,
        headings: input.options?.headings,
        markdown: input.options?.markdown,
      });
      if (input.pages && input.pages.length > 0) {
        structure.pages = input.pages;
      }
    }

    const pageCount = structure.pages?.length ?? (input.pages?.length || undefined);

    const metadata: DocumentMetadata = {
      id: docId,
      title: input.title || 'Untitled Document',
      sourceType: input.sourceType || 'text',
      sourceUrl: input.sourceUrl,
      fileName: input.fileName,
      direction,
      totalCharacters: totalChars,
      totalWords,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastReadWordIndex: input.lastReadWordIndex ?? 0,
      category: input.category,
      totalChunks: chunks.length,
      pageCount,
      hasStructure: true,
    };

    const locationIndex = buildLocationIndex(docId, chunks, totalChars);

    await this.saveDocument(metadata, chunks, structure, locationIndex);
    return { metadata, chunks, structure, locationIndex };
  }

  /**
   * Retrieves metadata for a document by ID.
   */
  public async getMetadata(id: string): Promise<DocumentMetadata | null> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      return this.memoryMetadata.get(id) || null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.METADATA, 'readonly');
        const store = tx.objectStore(STORES.METADATA);
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        resolve(this.memoryMetadata.get(id) || null);
      }
    });
  }

  /**
   * Retrieves a single chunk by documentId and chunkIndex.
   */
  public async getChunk(documentId: string, chunkIndex: number): Promise<DocumentChunk | null> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      const key = `${documentId}:${chunkIndex}`;
      return this.memoryChunks.get(key) || null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.CHUNKS, 'readonly');
        const store = tx.objectStore(STORES.CHUNKS);
        const req = store.get([documentId, chunkIndex]);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        const key = `${documentId}:${chunkIndex}`;
        resolve(this.memoryChunks.get(key) || null);
      }
    });
  }

  /**
   * Retrieves adjacent chunks surrounding a given chunk index.
   * Useful for smooth pre-buffering in reading views.
   */
  public async getAdjacentChunks(
    documentId: string,
    chunkIndex: number,
    radius: number = 1
  ): Promise<DocumentChunk[]> {
    const minIdx = Math.max(0, chunkIndex - radius);
    const maxIdx = chunkIndex + radius;

    const promises: Promise<DocumentChunk | null>[] = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      promises.push(this.getChunk(documentId, i));
    }

    const results = await Promise.all(promises);
    return results.filter((c): c is DocumentChunk => c !== null);
  }

  /**
   * Retrieves all chunks belonging to a document, ordered by chunkIndex.
   */
  public async getAllChunks(documentId: string): Promise<DocumentChunk[]> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      const chunks: DocumentChunk[] = [];
      for (const [key, chunk] of this.memoryChunks.entries()) {
        if (chunk.documentId === documentId) {
          chunks.push(chunk);
        }
      }
      return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.CHUNKS, 'readonly');
        const store = tx.objectStore(STORES.CHUNKS);
        const index = store.index('documentId');
        const req = index.getAll(IDBKeyRange.only(documentId));

        req.onsuccess = () => {
          const results: DocumentChunk[] = req.result || [];
          results.sort((a, b) => a.chunkIndex - b.chunkIndex);
          resolve(results);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        const chunks: DocumentChunk[] = [];
        for (const [key, chunk] of this.memoryChunks.entries()) {
          if (chunk.documentId === documentId) {
            chunks.push(chunk);
          }
        }
        resolve(chunks.sort((a, b) => a.chunkIndex - b.chunkIndex));
      }
    });
  }

  /**
   * Retrieves chunks that intersect with a given word range [startWordIndex, endWordIndex].
   */
  public async getChunksForWordRange(
    documentId: string,
    startWordIndex: number,
    endWordIndex: number
  ): Promise<DocumentChunk[]> {
    const all = await this.getAllChunks(documentId);
    return all.filter(
      (c) => c.startWordIndex <= endWordIndex && c.endWordIndex >= startWordIndex
    );
  }

  /**
   * Retrieves full document text by reconstructing from all chunks.
   */
  public async getDocumentText(id: string): Promise<string | null> {
    const chunks = await this.getAllChunks(id);
    if (!chunks || chunks.length === 0) {
      return null;
    }
    return reconstructTextFromChunks(chunks);
  }

  /**
   * Deletes a document, its metadata, chunks, and structure from IndexedDB.
   */
  public async deleteDocument(id: string): Promise<void> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      this.memoryMetadata.delete(id);
      this.memoryStructures.delete(id);
      this.memoryLocationIndexes.delete(id);
      for (const [key, chunk] of this.memoryChunks.entries()) {
        if (chunk.documentId === id) {
          this.memoryChunks.delete(key);
        }
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.METADATA, STORES.CHUNKS, STORES.STRUCTURES, STORES.LOCATION_INDEXES],
          'readwrite'
        );
        const metaStore = tx.objectStore(STORES.METADATA);
        const chunksStore = tx.objectStore(STORES.CHUNKS);
        const structuresStore = tx.objectStore(STORES.STRUCTURES);
        const locationIndexesStore = tx.objectStore(STORES.LOCATION_INDEXES);

        metaStore.delete(id);
        structuresStore.delete(id);
        locationIndexesStore.delete(id);

        // Delete all chunks for this document
        const index = chunksStore.index('documentId');
        const req = index.openKeyCursor(IDBKeyRange.only(id));

        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursor>).result;
          if (cursor) {
            chunksStore.delete(cursor.primaryKey);
            cursor.continue();
          }
        };

        tx.oncomplete = () => {
          this.memoryMetadata.delete(id);
          this.memoryStructures.delete(id);
          this.memoryLocationIndexes.delete(id);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        this.memoryMetadata.delete(id);
        this.memoryStructures.delete(id);
        this.memoryLocationIndexes.delete(id);
        resolve();
      }
    });
  }

  /**
   * Lists all document metadata records, sorted by updatedAt descending.
   */
  public async listDocuments(): Promise<DocumentMetadata[]> {
    await this.initialize();

    if (this.isFallbackMode || !this.db) {
      const list = Array.from(this.memoryMetadata.values());
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORES.METADATA, 'readonly');
        const store = tx.objectStore(STORES.METADATA);
        const req = store.getAll();

        req.onsuccess = () => {
          const list: DocumentMetadata[] = req.result || [];
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        const list = Array.from(this.memoryMetadata.values());
        resolve(list.sort((a, b) => b.updatedAt - a.updatedAt));
      }
    });
  }

  /**
   * Updates only the reading progress (lastReadWordIndex) of a document.
   */
  public async updateReadingProgress(
    documentId: string,
    lastReadWordIndex: number
  ): Promise<void> {
    const meta = await this.getMetadata(documentId);
    if (!meta) return;

    meta.lastReadWordIndex = lastReadWordIndex;
    meta.updatedAt = Date.now();
    await this.saveDocumentMetadata(meta);
  }

  /**
   * Returns the count of documents currently stored.
   */
  public async countDocuments(): Promise<number> {
    const list = await this.listDocuments();
    return list.length;
  }

  /**
   * Clears all metadata, chunks, structures, and location indexes.
   */
  public async clearAll(): Promise<void> {
    await this.initialize();
    this.memoryMetadata.clear();
    this.memoryChunks.clear();
    this.memoryStructures.clear();
    this.memoryLocationIndexes.clear();

    if (this.isFallbackMode || !this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(
          [STORES.METADATA, STORES.CHUNKS, STORES.STRUCTURES, STORES.LOCATION_INDEXES],
          'readwrite'
        );
        tx.objectStore(STORES.METADATA).clear();
        tx.objectStore(STORES.CHUNKS).clear();
        tx.objectStore(STORES.STRUCTURES).clear();
        tx.objectStore(STORES.LOCATION_INDEXES).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch {
        resolve();
      }
    });
  }

  /**
   * Sets fallback mode manually (useful for unit tests verifying memory adapter).
   */
  public setFallbackMode(enabled: boolean): void {
    this.isFallbackMode = enabled;
  }
}

// Export singleton instance
export const documentStorageService = new DocumentStorageService();
