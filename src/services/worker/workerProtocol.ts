/**
 * Phase 4 Web Worker Protocol: Typed Message Contract
 * 
 * Defines all message payloads exchanged between Main UI Thread and TextWorker.
 */

import { HighlightStyle, HighlightedWordParts } from '../../types';

// Configurable bounded chunk parameters
export const DEFAULT_CHUNK_SIZE_WORDS = 3000; // Benchmarked optimal balance for CPU and IPC
export const MIN_CHUNK_SIZE_WORDS = 1000;
export const MAX_CHUNK_SIZE_WORDS = 5000;
export const DEFAULT_ACTIVE_CACHE_CHUNKS = 3; // Window: [current - 1, current, current + 1]

// ==========================================
// MAIN -> WORKER MESSAGES
// ==========================================

export interface ProcessChunkPayload {
  type: 'PROCESS_CHUNK';
  documentId: string;
  sessionId?: string;
  requestId?: string;
  chunkIndex: number;
  text: string;
  startWordIndex: number;
  highlightStyle: HighlightStyle;
  options?: {
    direction?: 'ltr' | 'rtl';
    sourceType?: string;
  };
}

export interface ProcessDocumentPayload {
  type: 'PROCESS_DOCUMENT';
  documentId: string;
  sessionId?: string;
  requestId?: string;
  chunks: Array<{
    chunkIndex: number;
    text: string;
    startWordIndex: number;
  }>;
  highlightStyle: HighlightStyle;
  options?: {
    direction?: 'ltr' | 'rtl';
    sourceType?: string;
  };
}

export interface CancelDocumentPayload {
  type: 'CANCEL_DOCUMENT';
  documentId: string;
  sessionId?: string;
}

export type MainToWorkerMessage =
  | ProcessChunkPayload
  | ProcessDocumentPayload
  | CancelDocumentPayload;

// ==========================================
// WORKER -> MAIN MESSAGES
// ==========================================

export interface ChunkReadyMetadata {
  startWordIndex: number;
  endWordIndex: number;
  wordCount: number;
  paragraphCount: number;
  isRtl: boolean;
  durationMs?: number;
}

export interface ChunkReadyPayload {
  type: 'CHUNK_READY';
  documentId: string;
  sessionId?: string;
  requestId?: string;
  chunkIndex: number;
  words: HighlightedWordParts[];
  metadata: ChunkReadyMetadata;
}

export interface ProgressPayload {
  type: 'PROGRESS';
  documentId: string;
  sessionId?: string;
  completedChunks: number;
  totalChunks: number;
  percent: number; // 0 to 100
  stage?: 'reading' | 'extracting' | 'indexing' | 'processing' | 'preparing';
  message?: string;
}

export interface DocumentCompletePayload {
  type: 'DOCUMENT_COMPLETE';
  documentId: string;
  sessionId?: string;
  totalWords: number;
  totalChunks: number;
  durationMs: number;
}

export interface WorkerErrorPayload {
  type: 'ERROR';
  documentId: string;
  sessionId?: string;
  requestId?: string;
  chunkIndex?: number;
  error: string;
  recoverable: boolean;
}

export interface CancelledPayload {
  type: 'CANCELLED';
  documentId: string;
  sessionId?: string;
}

export type WorkerToMainMessage =
  | ChunkReadyPayload
  | ProgressPayload
  | DocumentCompletePayload
  | WorkerErrorPayload
  | CancelledPayload;
