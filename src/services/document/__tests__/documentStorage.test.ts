/**
 * Phase 2 Comprehensive Test Suite: Scalable Document Model & IndexedDB Persistence
 * 
 * Verifies:
 * 1. Document creation & chunking
 * 2. Document saving & retrieval
 * 3. Saving & retrieving discrete chunks and adjacent chunk ranges
 * 4. Progress tracking & reading updates
 * 5. Document deletion & cleanup
 * 6. Migration of old localStorage documents (full-text stripping & preservation)
 * 7. Persian / RTL document processing and chunking
 * 8. Handling of very large strings (150,000+ characters)
 * 9. ReaderDocumentHandle application abstraction
 */

import { documentStorageService } from '../documentStorageService';
import { chunkDocument, findChunkIndexForWord, buildLocationIndex } from '../chunking';
import { createDocumentHandle } from '../documentHandle';
import {
  migrateLocalStorageToIndexedDB,
  sanitizeSavedDocumentForLocalStorage,
  DOCUMENT_STORAGE_KEYS,
} from '../migration';
import { safeStorage } from '../../../utils/safeStorage';
import { countWordsFast } from '../../../utils/textParser';
import { SavedDocument } from '../../../types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting Phase 2 Scalable Document Model Test Suite');
  console.log('========================================================\n');

  // Use singleton in fallback/memory mode for isolated testing
  const service = documentStorageService;
  service.setFallbackMode(true);
  await service.initialize();
  await service.clearAll();

  // ----------------------------------------------------
  // 1. Document Creation & Chunking
  // ----------------------------------------------------
  console.log('--- 1. Document Creation & Intelligent Chunking ---');
  const shortText = 'First paragraph with five words.\n\nSecond paragraph with four words.';
  const shortChunks = chunkDocument('doc-short-1', shortText);
  assert(shortChunks.length === 1, 'Short text creates exactly 1 chunk');
  assert(shortChunks[0].wordCount === 10, 'Short chunk word count is accurately 10 words');
  assert(shortChunks[0].startWordIndex === 0, 'Short chunk startWordIndex is 0');
  assert(shortChunks[0].endWordIndex === 9, 'Short chunk endWordIndex is 9');

  // Paragraph-boundary chunking
  const paragraphs: string[] = [];
  for (let i = 0; i < 20; i++) {
    paragraphs.push(`Paragraph ${i + 1} contains several descriptive sentences explaining ADHD reading flow and focus optimization principles.`);
  }
  const multiParaText = paragraphs.join('\n\n');
  const multiChunks = chunkDocument('doc-multi-1', multiParaText, 50);
  assert(multiChunks.length > 1, `Multi-paragraph text creates multiple chunks (created ${multiChunks.length})`);
  assert(multiChunks[0].chunkIndex === 0, 'First chunk has index 0');
  assert(multiChunks[1].chunkIndex === 1, 'Second chunk has index 1');
  assert(
    multiChunks[1].startWordIndex === multiChunks[0].endWordIndex + 1,
    'Sequential chunks have continuous, non-overlapping word indices'
  );

  const locIndex = buildLocationIndex('doc-multi-1', multiChunks, multiParaText.length);
  assert(locIndex.totalChunks === multiChunks.length, 'Location index totalChunks matches');
  assert(locIndex.totalWords === countWordsFast(multiParaText), 'Location index totalWords matches countWordsFast');

  const chunkForWord0 = findChunkIndexForWord(multiChunks, 0);
  assert(chunkForWord0 === 0, 'findChunkIndexForWord finds chunk 0 for word 0');
  const targetWord = multiChunks[1].startWordIndex + 2;
  const chunkForTarget = findChunkIndexForWord(multiChunks, targetWord);
  assert(chunkForTarget === 1, 'findChunkIndexForWord accurately identifies chunk 1');

  // ----------------------------------------------------
  // 2. Saving & Retrieving Documents
  // ----------------------------------------------------
  console.log('\n--- 2. Saving & Retrieving Documents ---');
  const sampleDoc = await service.createAndSaveDocument({
    id: 'doc-alpha',
    title: 'Alpha Science Document',
    text: 'Alpha document content for ADHD speed readers.',
    category: 'Science',
  });

  assert(sampleDoc.metadata.id === 'doc-alpha', 'Document created with requested ID');
  assert(sampleDoc.metadata.totalWords === 7, 'Metadata calculates total words correctly');

  const retrievedMeta = await service.getMetadata('doc-alpha');
  assert(retrievedMeta !== null, 'Retrieved metadata is not null');
  assert(retrievedMeta?.title === 'Alpha Science Document', 'Retrieved metadata matches saved title');
  assert(retrievedMeta?.category === 'Science', 'Retrieved metadata matches category');

  const fullText = await service.getDocumentText('doc-alpha');
  assert(fullText === 'Alpha document content for ADHD speed readers.', 'Reconstructed document text matches original');

  // ----------------------------------------------------
  // 3. Saving & Retrieving Discrete Chunks & Adjacent Chunks
  // ----------------------------------------------------
  console.log('\n--- 3. Discrete Chunks & Adjacent Range Retrieval ---');
  const chunk0 = await service.getChunk('doc-alpha', 0);
  assert(chunk0 !== null, 'getChunk retrieves chunk 0');
  assert(chunk0?.chunkIndex === 0, 'Retrieved chunk has chunkIndex 0');

  const adjacent = await service.getAdjacentChunks('doc-alpha', 0, 1);
  assert(adjacent.length >= 1, 'getAdjacentChunks returns available adjacent chunks');
  assert(adjacent[0].chunkIndex === 0, 'First adjacent chunk is chunk 0');

  // Multi-chunk document
  await service.createAndSaveDocument({
    id: 'doc-beta',
    title: 'Beta Multi-Chunk Document',
    text: multiParaText,
    targetChunkWords: 50,
  });
  const allBetaChunks = await service.getAllChunks('doc-beta');
  assert(allBetaChunks.length > 1, `getAllChunks returns all chunks for document (${allBetaChunks.length} chunks)`);
  const adjacentBeta = await service.getAdjacentChunks('doc-beta', 1, 1);
  assert(adjacentBeta.length >= 2, 'getAdjacentChunks returns surrounding chunks (radius 1)');

  // ----------------------------------------------------
  // 4. Progress Tracking & Reading Updates
  // ----------------------------------------------------
  console.log('\n--- 4. Progress Tracking & Reading Updates ---');
  await service.updateReadingProgress('doc-beta', 45);
  const updatedMeta = await service.getMetadata('doc-beta');
  assert(updatedMeta?.lastReadWordIndex === 45, 'updateReadingProgress correctly updates lastReadWordIndex to 45');

  // ----------------------------------------------------
  // 5. Document Deletion & Cleanup
  // ----------------------------------------------------
  console.log('\n--- 5. Document Deletion & Cleanup ---');
  await service.deleteDocument('doc-alpha');
  const deletedMeta = await service.getMetadata('doc-alpha');
  assert(deletedMeta === null, 'getMetadata returns null after document deletion');
  const deletedChunks = await service.getAllChunks('doc-alpha');
  assert(deletedChunks.length === 0, 'getAllChunks returns empty array after document deletion');

  // ----------------------------------------------------
  // 6. ReaderDocumentHandle Application Abstraction
  // ----------------------------------------------------
  console.log('\n--- 6. ReaderDocumentHandle Application Abstraction ---');
  const handle = createDocumentHandle('doc-beta');
  assert(handle.id === 'doc-beta', 'Handle reflects document ID');

  const handleMeta = await handle.getMetadata();
  assert(handleMeta.title === 'Beta Multi-Chunk Document', 'Handle getMetadata returns correct title');

  const handleText = await handle.getFullText();
  assert(handleText.length === multiParaText.length, 'Handle getFullText returns complete text');

  const paragraphsFromHandle = await handle.getParagraphs();
  assert(paragraphsFromHandle.length === 20, 'Handle getParagraphs splits into 20 paragraphs');

  const wordsRange = await handle.getWordsInRange(0, 5);
  assert(wordsRange.length === 6, 'Handle getWordsInRange returns exactly 6 words for range 0..5');

  const locInfo = await handle.getLocationInfo(15);
  assert(locInfo.totalWords === handleMeta.totalWords, 'Location info totalWords matches metadata');
  assert(typeof locInfo.chunkIndex === 'number', 'Location info specifies numeric chunkIndex');
  assert(locInfo.progressPercent > 0, 'Location info provides positive progressPercent');

  await handle.updateProgress(60);
  const reloadedMeta = await handle.getMetadata();
  assert(reloadedMeta.lastReadWordIndex === 60, 'Handle updateProgress updates storage and cache');

  // ----------------------------------------------------
  // 7. Persian / RTL Document Processing
  // ----------------------------------------------------
  console.log('\n--- 7. Persian / RTL Content & Processing ---');
  const persianText = `روش خواندن کلمه به کلمه به ذهن کمک می‌کند تا بدون پرش مداوم چشم روی خطوط، روی نقطه کانونی هر واژه تمرکز کند.

در این روش، پردازش واژگان در مغز تا سه برابر سریع‌تر و با کمترین میزان خستگی انجام می‌پذیرد.

برای کسانی که با چالش کمبود توجه مواجه هستند، حذف این مانع باعث تمرکز عمیق می‌شود.`;

  const persianDoc = await service.createAndSaveDocument({
    id: 'doc-persian',
    title: 'متن آزمایشی پارسی',
    text: persianText,
  });

  assert(persianDoc.metadata.direction === 'rtl', 'Persian text is automatically detected as direction: rtl');
  assert(persianDoc.metadata.totalWords === countWordsFast(persianText), 'Persian text word count is accurate');
  assert(persianDoc.chunks.length > 0, 'Persian chunks generated successfully');

  const persianHandle = createDocumentHandle('doc-persian');
  const retrievedPersianText = await persianHandle.getFullText();
  assert(retrievedPersianText === persianText, 'Persian reconstructed text matches original exactly');

  // ----------------------------------------------------
  // 8. Very Large Strings & Scalability
  // ----------------------------------------------------
  console.log('\n--- 8. Very Large Documents (150,000+ characters) ---');
  const baseSentence = 'The quick brown fox jumps over the lazy dog to demonstrate ADHD reader scalability under heavy text payloads. ';
  const largeParagraph = baseSentence.repeat(10);
  const largeText = Array.from({ length: 150 }, () => largeParagraph).join('\n\n');
  assert(largeText.length > 150_000, `Large test document generated with ${largeText.length} characters`);

  const largeDoc = await service.createAndSaveDocument({
    id: 'doc-huge',
    title: 'Huge 150k Document',
    text: largeText,
  });

  assert(largeDoc.chunks.length >= 10, `Huge document split into ${largeDoc.chunks.length} discrete chunks`);
  const hugeMeta = await service.getMetadata('doc-huge');
  assert(hugeMeta?.totalCharacters === largeText.length, 'Huge document totalCharacters matches');
  assert(hugeMeta?.totalChunks === largeDoc.chunks.length, 'Huge document totalChunks matches');

  // Verify adjacent chunks work smoothly for huge docs
  const midChunkIdx = Math.floor(largeDoc.chunks.length / 2);
  const midAdjacent = await service.getAdjacentChunks('doc-huge', midChunkIdx, 2);
  assert(midAdjacent.length === 5, 'getAdjacentChunks fetches 5 chunks around middle (radius 2)');

  // ----------------------------------------------------
  // 9. localStorage Migration & Backward Compatibility
  // ----------------------------------------------------
  console.log('\n--- 9. localStorage Migration & Sanitization ---');

  // Mock legacy localStorage state
  const legacySavedDocs: SavedDocument[] = [
    {
      id: 'legacy-doc-1',
      title: 'Legacy Saved Document 1',
      text: 'This is a legacy saved document that previously stored full text in localStorage.',
      wordCount: 13,
      lastReadIndex: 5,
      lastReadDate: new Date().toISOString(),
      category: 'Legacy',
    },
    {
      id: 'legacy-doc-2',
      title: 'Legacy Saved Document 2',
      text: 'Second legacy document with significant text body.',
      wordCount: 7,
      lastReadIndex: 2,
      lastReadDate: new Date().toISOString(),
    },
  ];

  const legacyCurrentText = 'This is active reading text previously stored in current_text localStorage.';
  safeStorage.setItem(DOCUMENT_STORAGE_KEYS.SAVED_DOCS, JSON.stringify(legacySavedDocs));
  safeStorage.setItem(DOCUMENT_STORAGE_KEYS.CURRENT_TEXT, legacyCurrentText);
  safeStorage.setItem(DOCUMENT_STORAGE_KEYS.CURRENT_TITLE, 'Legacy Active Reading');

  // Verify sanitization helper
  const sanitized = sanitizeSavedDocumentForLocalStorage(legacySavedDocs[0]);
  assert(sanitized.text === undefined, 'Sanitized SavedDocument strips text property');
  assert(sanitized.id === 'legacy-doc-1', 'Sanitized SavedDocument preserves id');
  assert(sanitized.wordCount === 13, 'Sanitized SavedDocument preserves wordCount');

  // Run migration
  const migrationRes = await migrateLocalStorageToIndexedDB();
  assert(migrationRes.migratedCount >= 2, `Migration successfully migrated ${migrationRes.migratedCount} legacy docs`);
  assert(migrationRes.clearedLegacyBytes > 0, `Migration calculated cleared legacy bytes: ${migrationRes.clearedLegacyBytes}`);

  // Verify full text was moved to IndexedDB
  const migratedDoc1 = await service.getMetadata('legacy-doc-1');
  assert(migratedDoc1 !== null, 'Legacy doc 1 exists in IndexedDB');
  assert(migratedDoc1?.title === 'Legacy Saved Document 1', 'Legacy doc 1 title preserved');

  const migratedDoc1Text = await service.getDocumentText('legacy-doc-1');
  assert(migratedDoc1Text === legacySavedDocs[0].text, 'Legacy doc 1 full text preserved in IndexedDB');

  // Verify localStorage no longer stores giant raw text
  const remainingCurrentText = safeStorage.getItem(DOCUMENT_STORAGE_KEYS.CURRENT_TEXT);
  assert(remainingCurrentText === null, 'CURRENT_TEXT removed from localStorage after migration');

  const updatedSavedDocsRaw = safeStorage.getItem(DOCUMENT_STORAGE_KEYS.SAVED_DOCS);
  assert(updatedSavedDocsRaw !== null, 'SAVED_DOCS remains in localStorage');
  const parsedUpdatedSavedDocs = JSON.parse(updatedSavedDocsRaw!);
  assert(parsedUpdatedSavedDocs[0].text === undefined, 'SAVED_DOCS in localStorage no longer has text property');

  console.log('\n========================================================');
  console.log(`🏁 Phase 2 Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
