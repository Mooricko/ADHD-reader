/**
 * Worker Processing Service (Main Thread Client)
 * 
 * Coordinates asynchronous off-thread parsing, manages active documents,
 * guarantees cancellation of stale documents, and provides seamless fallback
 * when Web Workers are unavailable or in test environments.
 */

import { HighlightStyle, HighlightedWordParts } from '../../types';
import {
  DEFAULT_CHUNK_SIZE_WORDS,
  WorkerToMainMessage,
  ProgressPayload,
  ChunkReadyPayload,
} from './workerProtocol';
import { processChunkPure, createWorkerChunks } from './chunkProcessor';

export interface ProcessDocumentOptions {
  documentId: string;
  text?: string;
  chunks?: Array<{ chunkIndex: number; text: string; startWordIndex: number; wordCount?: number }>;
  targetChunkWords?: number;
  highlightStyle?: HighlightStyle;
  direction?: 'ltr' | 'rtl';
  onProgress?: (progress: ProgressPayload) => void;
  onChunkReady?: (chunk: ChunkReadyPayload) => void;
  signal?: AbortSignal;
}

export interface ProcessedDocumentResult {
  documentId: string;
  totalWords: number;
  totalChunks: number;
  chunkWords: Map<number, HighlightedWordParts[]>;
  durationMs: number;
}

export class WorkerProcessingService {
  private worker: Worker | null = null;
  private isFallbackMode: boolean = false;
  private activeDocumentId: string | null = null;
  private documentSessions = new Map<string, string>();

  // Listeners by documentId
  private progressListeners = new Map<string, (p: ProgressPayload) => void>();
  private chunkListeners = new Map<string, (c: ChunkReadyPayload) => void>();
  private completeResolvers = new Map<
    string,
    {
      resolve: (res: ProcessedDocumentResult) => void;
      reject: (err: any) => void;
      accumulatedWords: Map<number, HighlightedWordParts[]>;
      startTime: number;
    }
  >();

  // Single chunk promises: key `${documentId}:${chunkIndex}`
  private pendingChunkRequests = new Map<
    string,
    {
      resolve: (res: ChunkReadyPayload) => void;
      reject: (err: any) => void;
      timeoutId?: ReturnType<typeof setTimeout>;
    }
  >();

  constructor() {
    this.checkWorkerSupport();
  }

  /**
   * Returns or creates a fresh session token for the given documentId.
   */
  public getOrCreateSession(documentId: string): string {
    let session = this.documentSessions.get(documentId);
    if (!session) {
      session = `${documentId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.documentSessions.set(documentId, session);
    }
    return session;
  }

  /**
   * Explicitly resets/starts a new session token for the given documentId.
   */
  public resetSession(documentId: string): string {
    const session = `${documentId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.documentSessions.set(documentId, session);
    return session;
  }

  /**
   * Checks if Web Workers are supported in the current runtime.
   */
  private checkWorkerSupport(): boolean {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.isFallbackMode = true;
      return false;
    }
    return true;
  }

  /**
   * Lazily initializes and binds the dedicated Web Worker.
   */
  public getWorker(): Worker | null {
    if (this.isFallbackMode) return null;
    if (this.worker) return this.worker;

    try {
      this.worker = new Worker(new URL('./textWorker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (e: MessageEvent<WorkerToMainMessage>) => {
        this.handleWorkerMessage(e.data);
      };

      this.worker.onerror = (err) => {
        console.warn('[WorkerProcessingService] Worker error, rejecting in-flight requests:', err);
        const errorMsg = "Couldn't finish preparing this document.";
        
        // Reject all in-flight chunk requests
        for (const [key, req] of this.pendingChunkRequests.entries()) {
          if (req.timeoutId) clearTimeout(req.timeoutId);
          req.reject(new Error(errorMsg));
        }
        this.pendingChunkRequests.clear();

        // Reject all document resolvers
        for (const [_, docJob] of this.completeResolvers.entries()) {
          docJob.reject(new Error(errorMsg));
        }
        this.completeResolvers.clear();
        this.chunkListeners.clear();
        this.progressListeners.clear();

        this.terminateWorker();
      };

      return this.worker;
    } catch (err) {
      console.warn('[WorkerProcessingService] Failed to create Worker, using pure fallback:', err);
      this.isFallbackMode = true;
      return null;
    }
  }

  /**
   * Restarts the dedicated worker process cleanly after an unrecoverable failure.
   */
  public restartWorker(): Worker | null {
    this.terminateWorker();
    this.isFallbackMode = false;
    this.checkWorkerSupport();
    return this.getWorker();
  }

  /**
   * Handles messages returned from the Web Worker.
   * Discards messages from inactive or superseded sessions!
   */
  private handleWorkerMessage(msg: WorkerToMainMessage) {
    if (!msg || !msg.documentId) return;

    // Verify session if provided
    const currentSession = this.documentSessions.get(msg.documentId);
    if (msg.sessionId && currentSession && msg.sessionId !== currentSession) {
      return; // Stale session message discarded
    }

    // MANDATORY CANCELLATION CHECK:
    // If the message is for a document that is no longer active, discard it!
    if (msg.documentId !== this.activeDocumentId) {
      return;
    }

    switch (msg.type) {
      case 'PROGRESS': {
        const listener = this.progressListeners.get(msg.documentId);
        if (listener) {
          listener(msg);
        }
        break;
      }

      case 'CHUNK_READY': {
        // 1. Single chunk request resolver
        const chunkKey = `${msg.documentId}:${msg.chunkIndex}`;
        const singleChunkReq = this.pendingChunkRequests.get(chunkKey);
        if (singleChunkReq) {
          if (singleChunkReq.timeoutId) clearTimeout(singleChunkReq.timeoutId);
          this.pendingChunkRequests.delete(chunkKey);
          singleChunkReq.resolve(msg);
        }

        // 2. Stream listener
        const streamListener = this.chunkListeners.get(msg.documentId);
        if (streamListener) {
          streamListener(msg);
        }

        // 3. Accumulate in document job
        const docJob = this.completeResolvers.get(msg.documentId);
        if (docJob) {
          docJob.accumulatedWords.set(msg.chunkIndex, msg.words);
        }
        break;
      }

      case 'DOCUMENT_COMPLETE': {
        const docJob = this.completeResolvers.get(msg.documentId);
        if (docJob) {
          this.cleanupDocument(msg.documentId);
          docJob.resolve({
            documentId: msg.documentId,
            totalWords: msg.totalWords,
            totalChunks: msg.totalChunks,
            chunkWords: docJob.accumulatedWords,
            durationMs: msg.durationMs,
          });
        }
        break;
      }

      case 'ERROR': {
        if (msg.chunkIndex !== undefined) {
          const chunkKey = `${msg.documentId}:${msg.chunkIndex}`;
          const singleChunkReq = this.pendingChunkRequests.get(chunkKey);
          if (singleChunkReq) {
            if (singleChunkReq.timeoutId) clearTimeout(singleChunkReq.timeoutId);
            this.pendingChunkRequests.delete(chunkKey);
            singleChunkReq.reject(new Error(msg.error || "Couldn't finish preparing this document."));
          }
        }
        const docJob = this.completeResolvers.get(msg.documentId);
        if (docJob) {
          this.cleanupDocument(msg.documentId);
          docJob.reject(new Error(msg.error || "Couldn't finish preparing this document."));
        }
        break;
      }

      case 'CANCELLED': {
        this.cleanupDocument(msg.documentId);
        break;
      }
    }
  }

  /**
   * Sets the active document ID and immediately cancels any previously running document.
   */
  public setActiveDocument(documentId: string): void {
    if (this.activeDocumentId && this.activeDocumentId !== documentId) {
      this.cancelDocument(this.activeDocumentId);
    }
    this.activeDocumentId = documentId;
    this.getOrCreateSession(documentId);
  }

  /**
   * Gets the currently active document ID.
   */
  public getActiveDocumentId(): string | null {
    return this.activeDocumentId;
  }

  /**
   * Cancels a document by ID.
   * Informs the worker with the session token, clears listeners, and rejects pending promises.
   * Crucially, removes the session so reopening this document gets a fresh unpoisoned session.
   */
  public cancelDocument(documentId: string): void {
    const session = this.documentSessions.get(documentId);

    // 1. If worker is alive, post cancellation with sessionId
    if (this.worker) {
      try {
        this.worker.postMessage({
          type: 'CANCEL_DOCUMENT',
          documentId,
          sessionId: session,
        });
      } catch {
        // Ignore postMessage errors on teardown
      }
    }

    // 2. Reject pending complete promise
    const docJob = this.completeResolvers.get(documentId);
    if (docJob) {
      docJob.reject(new Error(`Document processing cancelled: ${documentId}`));
    }

    // 3. Clear listeners and requests
    this.cleanupDocument(documentId);

    // 4. Remove session so reopening starts fresh
    this.documentSessions.delete(documentId);

    // 5. If this was the active document, clear it
    if (this.activeDocumentId === documentId) {
      this.activeDocumentId = null;
    }
  }

  private cleanupDocument(documentId: string) {
    this.progressListeners.delete(documentId);
    this.chunkListeners.delete(documentId);
    this.completeResolvers.delete(documentId);

    // Clear single chunk requests for this document
    for (const [key, req] of this.pendingChunkRequests.entries()) {
      if (key.startsWith(`${documentId}:`)) {
        if (req.timeoutId) clearTimeout(req.timeoutId);
        req.reject(new Error(`Chunk request cancelled: ${key}`));
        this.pendingChunkRequests.delete(key);
      }
    }
  }

  /**
   * Terminates the existing Web Worker instance.
   */
  public terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Sets fallback mode manually (useful for unit testing).
   */
  public setFallbackMode(enabled: boolean): void {
    this.isFallbackMode = enabled;
    if (enabled) {
      this.terminateWorker();
    }
  }

  /**
   * Returns whether worker service is running in pure JS fallback mode.
   */
  public isFallbackActive(): boolean {
    return this.isFallbackMode;
  }

  /**
   * Processes a single chunk on-demand with session support and timeout guard.
   */
  public async processChunk(
    documentId: string,
    chunkIndex: number,
    text: string,
    startWordIndex: number,
    highlightStyle: HighlightStyle = 'middle-two',
    options?: { direction?: 'ltr' | 'rtl'; sourceType?: string }
  ): Promise<ChunkReadyPayload> {
    // Fallback mode: compute directly
    if (this.isFallbackMode || !this.getWorker()) {
      const res = processChunkPure({
        documentId,
        chunkIndex,
        text,
        startWordIndex,
        highlightStyle,
        options,
      });
      return {
        type: 'CHUNK_READY',
        documentId,
        chunkIndex,
        words: res.words,
        metadata: res.metadata,
      };
    }

    const worker = this.getWorker()!;
    const chunkKey = `${documentId}:${chunkIndex}`;
    const sessionId = this.getOrCreateSession(documentId);
    const requestId = `${chunkKey}:${Date.now()}`;

    return new Promise<ChunkReadyPayload>((resolve, reject) => {
      // 15-second timeout guard so promises never hang indefinitely
      const timeoutId = setTimeout(() => {
        if (this.pendingChunkRequests.has(chunkKey)) {
          this.pendingChunkRequests.delete(chunkKey);
          reject(new Error(`Chunk request timed out: ${chunkKey}`));
        }
      }, 15000);

      this.pendingChunkRequests.set(chunkKey, { resolve, reject, timeoutId });
      worker.postMessage({
        type: 'PROCESS_CHUNK',
        documentId,
        sessionId,
        requestId,
        chunkIndex,
        text,
        startWordIndex,
        highlightStyle,
        options,
      });
    });
  }

  /**
   * Processes an entire document in bounded chunks via Web Worker.
   * Emits progress after every completed chunk.
   */
  public async processDocument(
    options: ProcessDocumentOptions
  ): Promise<ProcessedDocumentResult> {
    const { documentId, text, highlightStyle = 'middle-two', direction, onProgress, onChunkReady } = options;

    // Enforce active document tracking
    this.setActiveDocument(documentId);
    const sessionId = this.getOrCreateSession(documentId);

    // Prepare bounded chunks (2,000–5,000 words each)
    let chunks = options.chunks;
    if (!chunks && text) {
      chunks = createWorkerChunks(text, options.targetChunkWords || DEFAULT_CHUNK_SIZE_WORDS);
    }
    if (!chunks || chunks.length === 0) {
      chunks = [{ chunkIndex: 0, text: '', startWordIndex: 0, wordCount: 0 }];
    }

    const totalChunks = chunks.length;

    // Handle cancellation signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.cancelDocument(documentId);
      });
    }

    // Fallback mode execution (Node.js test or worker unavailable)
    if (this.isFallbackMode || !this.getWorker()) {
      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const chunkWords = new Map<number, HighlightedWordParts[]>();
      let totalWords = 0;

      for (let i = 0; i < totalChunks; i++) {
        // Abort check
        if (this.activeDocumentId !== documentId) {
          throw new Error(`Document processing cancelled: ${documentId}`);
        }

        const c = chunks[i];
        const res = processChunkPure({
          documentId,
          chunkIndex: c.chunkIndex,
          text: c.text,
          startWordIndex: c.startWordIndex,
          highlightStyle,
          options: { direction },
        });

        if (this.activeDocumentId !== documentId) {
          throw new Error(`Document processing cancelled: ${documentId}`);
        }

        totalWords += res.words.length;
        chunkWords.set(c.chunkIndex, res.words);

        const chunkReadyMsg: ChunkReadyPayload = {
          type: 'CHUNK_READY',
          documentId,
          sessionId,
          chunkIndex: c.chunkIndex,
          words: res.words,
          metadata: res.metadata,
        };

        if (onChunkReady) {
          onChunkReady(chunkReadyMsg);
        }

        const completedCount = i + 1;
        const percent = Math.min(100, Math.round((completedCount / totalChunks) * 100));

        if (onProgress) {
          onProgress({
            type: 'PROGRESS',
            documentId,
            sessionId,
            completedChunks: completedCount,
            totalChunks,
            percent,
            stage: 'processing',
            message: `Processing chunk ${completedCount} of ${totalChunks}...`,
          });
        }

        // Yield slightly in fallback mode so call stack is not locked
        if (totalChunks > 10 && i % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        documentId,
        totalWords,
        totalChunks,
        chunkWords,
        durationMs: Math.round((endTime - startTime) * 100) / 100,
      };
    }

    // Web Worker execution
    const worker = this.getWorker()!;

    if (onProgress) {
      this.progressListeners.set(documentId, onProgress);
    }
    if (onChunkReady) {
      this.chunkListeners.set(documentId, onChunkReady);
    }

    return new Promise<ProcessedDocumentResult>((resolve, reject) => {
      this.completeResolvers.set(documentId, {
        resolve,
        reject,
        accumulatedWords: new Map(),
        startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });

      // Send PROCESS_DOCUMENT message to worker
      worker.postMessage({
        type: 'PROCESS_DOCUMENT',
        documentId,
        sessionId,
        chunks: chunks!.map((c) => ({
          chunkIndex: c.chunkIndex,
          text: c.text,
          startWordIndex: c.startWordIndex,
        })),
        highlightStyle,
        options: { direction },
      });
    });
  }
}
// Global singleton instance
export const workerProcessingService = new WorkerProcessingService();
