/**
 * Phase 2 Scalable Document Model: localStorage -> IndexedDB Migration Service
 * 
 * Safely migrates legacy full-text documents stored in localStorage to IndexedDB.
 * Strips large text bodies from localStorage while preserving user library records,
 * titles, word counts, categories, and reading indices.
 */

import { SavedDocument } from '../../types';
import { safeStorage } from '../../utils/safeStorage';
import { documentStorageService } from './documentStorageService';
import { detectTextDirection } from '../../utils/normalizeText';
import { SAMPLE_TEXTS } from '../../data/sampleTexts';

export const DOCUMENT_STORAGE_KEYS = {
  CURRENT_TEXT: 'adhd_reader_text_v1',
  LEGACY_CURRENT_TEXT_ALT: 'adhd_reader_current_text_v1',
  CURRENT_TITLE: 'adhd_reader_title_v1',
  SAVED_DOCS: 'adhd_reader_saved_docs_v1',
  CURRENT_INDEX: 'adhd_reader_index_v1',
  SETTINGS: 'adhd_reader_settings_v1',
  VIEW_MODE: 'adhd_reader_view_mode_v1',
  ACTIVE_DOC_ID: 'adhd_reader_active_doc_id_v2',
  MIGRATION_V2_DONE: 'adhd_reader_migration_v2_done',
} as const;

export interface MigrationResult {
  migratedCount: number;
  activeDocId: string | null;
  clearedLegacyBytes: number;
}

/**
 * Strips large text from SavedDocument records so localStorage only holds lightweight metadata.
 */
export function sanitizeSavedDocumentForLocalStorage(doc: SavedDocument): SavedDocument {
  const { text, ...lightweight } = doc;
  return lightweight;
}

/**
 * Runs backward-compatible migration:
 * 1. Migrates legacy SAVED_DOCS full text into IndexedDB chunks.
 * 2. Replaces SAVED_DOCS in localStorage with lightweight records (no text payload).
 * 3. Migrates legacy CURRENT_TEXT to an active IndexedDB document and removes it from localStorage.
 * 4. Ensures sample texts are available in IndexedDB if the library is empty.
 */
export async function migrateLocalStorageToIndexedDB(): Promise<MigrationResult> {
  let migratedCount = 0;
  let clearedLegacyBytes = 0;
  let activeDocId: string | null = safeStorage.getItem(DOCUMENT_STORAGE_KEYS.ACTIVE_DOC_ID);

  try {
    // 1. Check legacy SAVED_DOCS in localStorage
    const savedDocsRaw = safeStorage.getItem(DOCUMENT_STORAGE_KEYS.SAVED_DOCS);
    if (savedDocsRaw) {
      try {
        const parsed: SavedDocument[] = JSON.parse(savedDocsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const lightweightDocs: SavedDocument[] = [];

          for (const doc of parsed) {
            // Check if document already exists in IndexedDB
            const existingMeta = await documentStorageService.getMetadata(doc.id);

            // If document has legacy text, migrate to IndexedDB
            if (doc.text && typeof doc.text === 'string' && doc.text.trim()) {
              if (!existingMeta) {
                await documentStorageService.createAndSaveDocument({
                  id: doc.id,
                  title: doc.title,
                  text: doc.text,
                  sourceType: doc.sourceType || 'text',
                  sourceUrl: doc.sourceUrl,
                  fileName: doc.fileName,
                  direction: doc.direction || detectTextDirection(doc.text),
                  category: doc.category,
                  lastReadWordIndex: doc.lastReadIndex || 0,
                });
                migratedCount++;
              }
              clearedLegacyBytes += doc.text.length * 2;
            } else if (!existingMeta) {
              // Legacy doc with no text? Check if it matches a sample text
              const sampleMatch = SAMPLE_TEXTS.find((s) => s.id === doc.id);
              if (sampleMatch && sampleMatch.text) {
                await documentStorageService.createAndSaveDocument({
                  id: sampleMatch.id,
                  title: sampleMatch.title,
                  text: sampleMatch.text,
                  sourceType: 'text',
                  direction: detectTextDirection(sampleMatch.text),
                  category: sampleMatch.category,
                  lastReadWordIndex: doc.lastReadIndex || 0,
                });
                migratedCount++;
              }
            }

            // Always add sanitized lightweight version (without full text)
            lightweightDocs.push(sanitizeSavedDocumentForLocalStorage(doc));
          }

          // Replace localStorage SAVED_DOCS with lightweight version
          safeStorage.setItem(
            DOCUMENT_STORAGE_KEYS.SAVED_DOCS,
            JSON.stringify(lightweightDocs)
          );
        }
      } catch (parseErr) {
        console.warn('[Migration] Could not parse legacy SAVED_DOCS:', parseErr);
      }
    }

    // 2. Check legacy CURRENT_TEXT in localStorage (checks both key aliases)
    const legacyCurrentText =
      safeStorage.getItem(DOCUMENT_STORAGE_KEYS.CURRENT_TEXT) ||
      safeStorage.getItem(DOCUMENT_STORAGE_KEYS.LEGACY_CURRENT_TEXT_ALT);

    const legacyCurrentTitle =
      safeStorage.getItem(DOCUMENT_STORAGE_KEYS.CURRENT_TITLE) || 'Active Reading';

    if (legacyCurrentText && typeof legacyCurrentText === 'string' && legacyCurrentText.trim()) {
      // If we don't have an activeDocId or it's not yet in IndexedDB, create it
      if (!activeDocId) {
        const docId = `doc-migrated-current-${Date.now()}`;
        await documentStorageService.createAndSaveDocument({
          id: docId,
          title: legacyCurrentTitle,
          text: legacyCurrentText,
          sourceType: 'text',
          direction: detectTextDirection(legacyCurrentText),
          lastReadWordIndex: 0,
        });
        activeDocId = docId;
        safeStorage.setItem(DOCUMENT_STORAGE_KEYS.ACTIVE_DOC_ID, activeDocId);
        migratedCount++;
      }
      clearedLegacyBytes += legacyCurrentText.length * 2;

      // Remove large text from localStorage to prevent quota exhaustion
      safeStorage.removeItem(DOCUMENT_STORAGE_KEYS.CURRENT_TEXT);
      safeStorage.removeItem(DOCUMENT_STORAGE_KEYS.LEGACY_CURRENT_TEXT_ALT);
    }

    // 3. Ensure sample texts exist in IndexedDB if library is completely empty
    const dbDocCount = await documentStorageService.countDocuments();
    if (dbDocCount === 0) {
      for (const sample of SAMPLE_TEXTS) {
        if (sample.text) {
          await documentStorageService.createAndSaveDocument({
            id: sample.id,
            title: sample.title,
            text: sample.text,
            sourceType: 'text',
            direction: detectTextDirection(sample.text),
            category: sample.category,
            lastReadWordIndex: 0,
          });
        }
      }
    }

    // Mark migration completed
    safeStorage.setItem(DOCUMENT_STORAGE_KEYS.MIGRATION_V2_DONE, 'true');

    return {
      migratedCount,
      activeDocId,
      clearedLegacyBytes,
    };
  } catch (err) {
    console.error('[Migration] Error during localStorage to IndexedDB migration:', err);
    return {
      migratedCount,
      activeDocId,
      clearedLegacyBytes,
    };
  }
}
