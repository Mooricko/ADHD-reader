/**
 * Phase 4 Text Web Worker
 * 
 * Offloads heavy normalization, tokenization, RTL detection, paragraph mapping,
 * and fixation highlighting off the React Main UI Thread.
 */

import { MainToWorkerMessage, WorkerToMainMessage } from './workerProtocol';
import { processChunkPure } from './chunkProcessor';

// Bounded tracking of active session IDs and cancelled session tokens
const activeDocumentSessions = new Map<string, string>();
const cancelledSessionIds = new Set<string>();

function isSessionCancelled(documentId: string, sessionId?: string): boolean {
  if (sessionId && cancelledSessionIds.has(sessionId)) {
    return true;
  }
  const currentActiveSession = activeDocumentSessions.get(documentId);
  if (sessionId && currentActiveSession && sessionId !== currentActiveSession) {
    return true; // Superseded by a newer session
  }
  return false;
}

// Handle incoming messages from the Main UI Thread
self.onmessage = async (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'CANCEL_DOCUMENT': {
      const { documentId, sessionId } = msg;
      const targetSession = sessionId || activeDocumentSessions.get(documentId);
      if (targetSession) {
        cancelledSessionIds.add(targetSession);
        // Clean up bounded set to max 500 IDs
        if (cancelledSessionIds.size > 500) {
          const first = cancelledSessionIds.values().next().value;
          if (first) cancelledSessionIds.delete(first);
        }
      }
      activeDocumentSessions.delete(documentId);

      const response: WorkerToMainMessage = {
        type: 'CANCELLED',
        documentId,
        sessionId: targetSession,
      };
      self.postMessage(response);
      break;
    }

    case 'PROCESS_CHUNK': {
      const { documentId, sessionId, requestId, chunkIndex, text, startWordIndex, highlightStyle, options } = msg;

      // Register or update active session
      if (sessionId) {
        activeDocumentSessions.set(documentId, sessionId);
      }

      if (isSessionCancelled(documentId, sessionId)) {
        return;
      }

      try {
        const result = processChunkPure({
          documentId,
          chunkIndex,
          text,
          startWordIndex,
          highlightStyle,
          options,
        });

        if (isSessionCancelled(documentId, sessionId)) {
          return;
        }

        const chunkReadyMsg: WorkerToMainMessage = {
          type: 'CHUNK_READY',
          documentId,
          sessionId,
          requestId,
          chunkIndex,
          words: result.words,
          metadata: result.metadata,
        };
        self.postMessage(chunkReadyMsg);
      } catch (err: any) {
        const errorMsg: WorkerToMainMessage = {
          type: 'ERROR',
          documentId,
          sessionId,
          requestId,
          chunkIndex,
          error: err?.message || 'Error processing chunk in worker',
          recoverable: true,
        };
        self.postMessage(errorMsg);
      }
      break;
    }

    case 'PROCESS_DOCUMENT': {
      const { documentId, sessionId, chunks, highlightStyle, options } = msg;

      if (sessionId) {
        activeDocumentSessions.set(documentId, sessionId);
      }

      if (isSessionCancelled(documentId, sessionId)) {
        return;
      }

      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const totalChunks = chunks.length;
      let totalWords = 0;

      try {
        for (let i = 0; i < totalChunks; i++) {
          // Check cancellation before every chunk
          if (isSessionCancelled(documentId, sessionId)) {
            const cancelResp: WorkerToMainMessage = {
              type: 'CANCELLED',
              documentId,
              sessionId,
            };
            self.postMessage(cancelResp);
            return;
          }

          const c = chunks[i];
          const result = processChunkPure({
            documentId,
            chunkIndex: c.chunkIndex,
            text: c.text,
            startWordIndex: c.startWordIndex,
            highlightStyle,
            options,
          });

          // Check cancellation after processing chunk
          if (isSessionCancelled(documentId, sessionId)) {
            return;
          }

          totalWords += result.words.length;

          // Emit chunk result
          const chunkReadyMsg: WorkerToMainMessage = {
            type: 'CHUNK_READY',
            documentId,
            sessionId,
            chunkIndex: c.chunkIndex,
            words: result.words,
            metadata: result.metadata,
          };
          self.postMessage(chunkReadyMsg);

          // Emit actual progress
          const completedCount = i + 1;
          const percent = Math.min(100, Math.round((completedCount / totalChunks) * 100));
          const progressMsg: WorkerToMainMessage = {
            type: 'PROGRESS',
            documentId,
            sessionId,
            completedChunks: completedCount,
            totalChunks,
            percent,
            stage: 'processing',
            message: `Processing chunk ${completedCount} of ${totalChunks}...`,
          };
          self.postMessage(progressMsg);
        }

        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.round((endTime - startTime) * 100) / 100;

        const completeMsg: WorkerToMainMessage = {
          type: 'DOCUMENT_COMPLETE',
          documentId,
          sessionId,
          totalWords,
          totalChunks,
          durationMs,
        };
        self.postMessage(completeMsg);
      } catch (err: any) {
        const errorMsg: WorkerToMainMessage = {
          type: 'ERROR',
          documentId,
          sessionId,
          error: err?.message || 'Error processing document in worker',
          recoverable: true,
        };
        self.postMessage(errorMsg);
      }
      break;
    }
  }
};
