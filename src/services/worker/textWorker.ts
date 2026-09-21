/**
 * Phase 4 Text Web Worker
 * 
 * Offloads heavy normalization, tokenization, RTL detection, paragraph mapping,
 * and fixation highlighting off the React Main UI Thread.
 */

import { MainToWorkerMessage, WorkerToMainMessage } from './workerProtocol';
import { processChunkPure } from './chunkProcessor';

// Bounded set of cancelled document IDs to prevent processing cancelled jobs
const cancelledDocumentIds = new Set<string>();

// Handle incoming messages from the Main UI Thread
self.onmessage = async (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'CANCEL_DOCUMENT': {
      cancelledDocumentIds.add(msg.documentId);
      // Clean up bounded set to max 200 IDs
      if (cancelledDocumentIds.size > 200) {
        const first = cancelledDocumentIds.values().next().value;
        if (first) cancelledDocumentIds.delete(first);
      }
      const response: WorkerToMainMessage = {
        type: 'CANCELLED',
        documentId: msg.documentId,
      };
      self.postMessage(response);
      break;
    }

    case 'PROCESS_CHUNK': {
      const { documentId, chunkIndex, text, startWordIndex, highlightStyle, options } = msg;

      if (cancelledDocumentIds.has(documentId)) {
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

        if (cancelledDocumentIds.has(documentId)) {
          return;
        }

        const chunkReadyMsg: WorkerToMainMessage = {
          type: 'CHUNK_READY',
          documentId,
          chunkIndex,
          words: result.words,
          metadata: result.metadata,
        };
        self.postMessage(chunkReadyMsg);
      } catch (err: any) {
        const errorMsg: WorkerToMainMessage = {
          type: 'ERROR',
          documentId,
          chunkIndex,
          error: err?.message || 'Error processing chunk in worker',
          recoverable: true,
        };
        self.postMessage(errorMsg);
      }
      break;
    }

    case 'PROCESS_DOCUMENT': {
      const { documentId, chunks, highlightStyle, options } = msg;

      if (cancelledDocumentIds.has(documentId)) {
        return;
      }

      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const totalChunks = chunks.length;
      let totalWords = 0;

      try {
        for (let i = 0; i < totalChunks; i++) {
          // Check cancellation before every chunk
          if (cancelledDocumentIds.has(documentId)) {
            const cancelResp: WorkerToMainMessage = {
              type: 'CANCELLED',
              documentId,
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
          if (cancelledDocumentIds.has(documentId)) {
            return;
          }

          totalWords += result.words.length;

          // Emit chunk result
          const chunkReadyMsg: WorkerToMainMessage = {
            type: 'CHUNK_READY',
            documentId,
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
          totalWords,
          totalChunks,
          durationMs,
        };
        self.postMessage(completeMsg);
      } catch (err: any) {
        const errorMsg: WorkerToMainMessage = {
          type: 'ERROR',
          documentId,
          error: err?.message || 'Error processing document in worker',
          recoverable: true,
        };
        self.postMessage(errorMsg);
      }
      break;
    }
  }
};
