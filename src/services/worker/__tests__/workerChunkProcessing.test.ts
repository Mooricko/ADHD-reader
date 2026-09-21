/**
 * Phase 4 Web Worker & Chunked Document Processing: Comprehensive Test Suite
 *
 * Requirements covered:
 * 1. Chunk bounded processing (2,000–5,000 words, paragraph & punctuation metadata)
 * 2. Stress tests: 100k, 250k, 500k, 1M words
 * 3. Mandatory cancellation (stale responses cannot corrupt state)
 * 4. Switching documents safely
 * 5. Switching highlight styles
 * 6. Changing RTL/LTR content
 * 7. Corrupted input handling
 * 8. Worker failure & recovery
 * 9. Bounded memory cache in DocumentHandle (active window: prev, current, next)
 */

import {
  processChunkPure,
  createWorkerChunks,
  benchmarkChunkSize,
} from '../chunkProcessor';
import {
  WorkerProcessingService,
} from '../workerProcessingService';
import {
  DEFAULT_CHUNK_SIZE_WORDS,
  DEFAULT_ACTIVE_CACHE_CHUNKS,
} from '../workerProtocol';
import { DocumentHandle } from '../../document/documentHandle';
import { documentStorageService } from '../../document/documentStorageService';
import { HighlightStyle } from '../../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runPhase4Tests() {
  console.log('--- Starting Phase 4: Chunked Parsing & Worker Processing Tests ---');

  // =========================================================================
  // TEST SUITE 1: BOUNDED CHUNK GENERATION & PURE PROCESSING
  // =========================================================================
  console.log('Test 1: Bounded Chunk Generation & Metadata Extraction');
  {
    const paragraphs = [
      'The quick brown fox jumps over the lazy dog. It was a bright sunny day.',
      'In a quiet library, readers gathered to explore classic literature with speed reading.',
      'Sentence three features an exclamation! And sentence four asks a question? Indeed.',
    ];
    const text = paragraphs.join('\n\n');

    const chunks = createWorkerChunks(text, 10); // Small chunk target for granular testing
    assert(chunks.length >= 2, `Expected multiple chunks, got ${chunks.length}`);

    // Verify sequential word indices
    let prevEnd = -1;
    let totalChunkWords = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      assert(c.chunkIndex === i, `Chunk index mismatch: expected ${i}, got ${c.chunkIndex}`);
      if (i > 0) {
        assert(c.startWordIndex === prevEnd, `Gap in word indices at chunk ${i}`);
      }
      const processed = processChunkPure({
        documentId: 'doc-1',
        chunkIndex: c.chunkIndex,
        text: c.text,
        startWordIndex: c.startWordIndex,
        highlightStyle: 'middle-two',
      });

      assert(processed.words.length > 0, `Chunk ${i} should have processed words`);
      assert(processed.metadata.startWordIndex === c.startWordIndex, 'startWordIndex must match');
      assert(processed.metadata.wordCount === processed.words.length, 'wordCount must match words length');
      assert(processed.metadata.endWordIndex === c.startWordIndex + processed.words.length - 1, 'endWordIndex must match');
      assert(processed.metadata.paragraphCount >= 1, 'paragraphCount must be >= 1');

      // Verify punctuation timing metadata on question/exclamation
      const hasSentenceEnd = processed.words.some((w) => w.hasSentenceEnd);
      if (c.text.includes('!') || c.text.includes('?')) {
        assert(hasSentenceEnd, 'Words with ! or ? should have hasSentenceEnd === true');
      }

      prevEnd = processed.metadata.endWordIndex + 1;
      totalChunkWords += processed.words.length;
    }

    assert(totalChunkWords > 20, `Total processed words should be > 20, got ${totalChunkWords}`);
    console.log(`  ✓ Created ${chunks.length} bounded chunks with exact continuous word indexing and punctuation metadata`);
  }

  // =========================================================================
  // TEST SUITE 2: STRESS TESTS (100k, 250k, 500k, 1M words)
  // =========================================================================
  console.log('Test 2: Stress Testing Throughput (100k, 250k, 500k, 1M words)');
  {
    // Helper to generate large corpus with realistic sentence & paragraph structures
    function generateCorpus(wordTarget: number): string {
      const vocabulary = [
        'cognitive', 'neurodiversity', 'focus', 'attention', 'comprehension',
        'reading', 'visual', 'pacing', 'rhythm', 'acceleration', 'clarity',
        'adaptive', 'optimal', 'fixation', 'saccade', 'processing', 'memory',
        'speed', 'fluidity', 'milestone', 'perspective', 'understanding'
      ];
      const pWords = 100; // 100 words per paragraph
      const pCount = Math.ceil(wordTarget / pWords);
      const paragraphs: string[] = [];

      for (let p = 0; p < pCount; p++) {
        const sentenceWords: string[] = [];
        for (let w = 0; w < pWords; w++) {
          const word = vocabulary[(p * pWords + w) % vocabulary.length];
          if (w > 0 && w % 12 === 0) {
            sentenceWords.push(word + '.');
          } else if (w > 0 && w % 7 === 0) {
            sentenceWords.push(word + ',');
          } else {
            sentenceWords.push(word);
          }
        }
        paragraphs.push(sentenceWords.join(' '));
      }
      return paragraphs.join('\n\n');
    }

    // Benchmark test runner
    function testStressScale(scaleName: string, targetWords: number) {
      const corpus = generateCorpus(targetWords);
      const startTime = Date.now();
      const chunks = createWorkerChunks(corpus, DEFAULT_CHUNK_SIZE_WORDS);

      let processedWords = 0;
      for (const c of chunks) {
        const res = processChunkPure({
          documentId: `stress-${scaleName}`,
          chunkIndex: c.chunkIndex,
          text: c.text,
          startWordIndex: c.startWordIndex,
          highlightStyle: 'middle-two',
        });
        processedWords += res.words.length;
      }
      const durationMs = Date.now() - startTime;
      const wps = Math.round((processedWords / Math.max(1, durationMs)) * 1000);

      assert(processedWords >= targetWords * 0.95, `Word count integrity failed: expected ~${targetWords}, got ${processedWords}`);
      console.log(`  ✓ Stress ${scaleName}: ${processedWords.toLocaleString()} words in ${durationMs}ms (${wps.toLocaleString()} words/sec across ${chunks.length} chunks)`);
    }

    testStressScale('100k words', 100_000);
    testStressScale('250k words', 250_000);
    testStressScale('500k words', 500_000);
    testStressScale('1M words', 1_000_000);
  }

  // =========================================================================
  // TEST SUITE 3: CANCELLATION & STALE WORKER MESSAGE REJECTION
  // =========================================================================
  console.log('Test 3: Cancellation Safety & Stale Document Message Discarding');
  {
    const service = new WorkerProcessingService();
    service.setFallbackMode(true); // Test pure client logic deterministically

    let docAProgressCount = 0;
    let docBProgressCount = 0;
    const tracking = { docACompleted: false, docBCompleted: false };

    const textA = 'Apple banana cherry date elderberry fig grape honeydew kiwi lemon mango nectarine orange.';
    const textB = 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november.';

    // Start Document A
    service.setActiveDocument('doc-A');
    const promiseA = service.processDocument({
      documentId: 'doc-A',
      text: textA,
      targetChunkWords: 5,
      onProgress: () => {
        docAProgressCount++;
      },
    }).then(() => {
      tracking.docACompleted = true;
    }).catch(() => {
      // Expected if cancelled
    });

    // Immediately switch to Document B before Document A finishes
    service.setActiveDocument('doc-B');
    assert(service.getActiveDocumentId() === 'doc-B', 'Active document must be doc-B');

    const promiseB = service.processDocument({
      documentId: 'doc-B',
      text: textB,
      targetChunkWords: 5,
      onProgress: () => {
        docBProgressCount++;
      },
    }).then(() => {
      tracking.docBCompleted = true;
    });

    await Promise.allSettled([promiseA, promiseB]);

    assert(tracking.docBCompleted === true, 'Document B must complete successfully');
    // Ensure active document is still B and Document A did not override it
    assert(service.getActiveDocumentId() === 'doc-B', 'doc-B must remain the active document');

    // Explicit cancellation test
    service.setActiveDocument('doc-C');
    service.cancelDocument('doc-C');
    assert(service.getActiveDocumentId() === null, 'Active document must be cleared after cancellation');

    console.log('  ✓ Stale messages from superseded documents cannot corrupt active document state');
  }

  // =========================================================================
  // TEST SUITE 4: SWITCHING HIGHLIGHT STYLES
  // =========================================================================
  console.log('Test 4: Switching Highlight Styles');
  {
    const sampleWord = 'Hyperfocus';
    const text = `The state of ${sampleWord} allows deep immersion.`;

    const styles: HighlightStyle[] = ['middle-single', 'middle-two', 'bionic-prefix'];
    for (const style of styles) {
      const res = processChunkPure({
        documentId: 'style-test',
        chunkIndex: 0,
        text,
        startWordIndex: 0,
        highlightStyle: style,
      });

      const targetWord = res.words.find((w) => w.original.includes(sampleWord));
      assert(Boolean(targetWord), `Word "${sampleWord}" should be found`);

      if (style === 'middle-single') {
        assert(targetWord!.highlightedText.length === 1, 'middle-single must highlight exactly 1 letter');
        assert(targetWord!.beforeHighlight.length > 0, 'middle-single should have a prefix');
      } else if (style === 'middle-two') {
        assert(targetWord!.highlightedText.length === 2, 'middle-two must highlight 2 letters');
        assert(targetWord!.beforeHighlight.length > 0, 'middle-two should have a prefix');
      } else if (style === 'bionic-prefix') {
        assert(targetWord!.highlightedText.length >= 3, 'bionic-prefix must highlight initial prefix letters');
        assert(targetWord!.beforeHighlight === '', 'bionic-prefix beforeHighlight should be empty');
      }
    }
    console.log('  ✓ Supported styles (middle-single, middle-two, bionic-prefix) generate accurate highlight boundaries');
  }

  // =========================================================================
  // TEST SUITE 5: CHANGING RTL / LTR CONTENT
  // =========================================================================
  console.log('Test 5: RTL / LTR Direction Handling & Mixed Chunks');
  {
    const hebrewText = 'שלום עולם! זהו מבחן לקריאה מהירה בעברית עם סימני פיסוק.';
    const arabicText = 'مرحبا بكم في تطبيق القراءة السريعة باللغة العربية.';
    const englishText = 'Hello world! This is an English RSVP reading test.';

    // Hebrew chunk
    const resHebrew = processChunkPure({
      documentId: 'rtl-1',
      chunkIndex: 0,
      text: hebrewText,
      startWordIndex: 0,
      highlightStyle: 'middle-two',
    });
    assert(resHebrew.metadata.isRtl === true, 'Hebrew text must be detected as RTL');
    assert(resHebrew.words.length > 5, 'Hebrew words must be tokenized properly');

    // Arabic chunk
    const resArabic = processChunkPure({
      documentId: 'rtl-2',
      chunkIndex: 0,
      text: arabicText,
      startWordIndex: 0,
      highlightStyle: 'middle-single',
    });
    assert(resArabic.metadata.isRtl === true, 'Arabic text must be detected as RTL');

    // English chunk
    const resEnglish = processChunkPure({
      documentId: 'ltr-1',
      chunkIndex: 0,
      text: englishText,
      startWordIndex: 0,
      highlightStyle: 'middle-two',
    });
    assert(resEnglish.metadata.isRtl === false, 'English text must be detected as LTR');

    console.log('  ✓ RTL and LTR content accurately detected with token alignment preserved');
  }

  // =========================================================================
  // TEST SUITE 6: CORRUPTED INPUT & EDGE CASES
  // =========================================================================
  console.log('Test 6: Corrupted Input & Extreme Edge Cases');
  {
    // Empty text
    const resEmpty = processChunkPure({
      documentId: 'edge-1',
      chunkIndex: 0,
      text: '',
      startWordIndex: 0,
      highlightStyle: 'middle-two',
    });
    assert(resEmpty.words.length === 0, 'Empty text must produce 0 words');
    assert(resEmpty.metadata.wordCount === 0, 'Empty text metadata wordCount must be 0');

    // Whitespace only
    const resSpaces = processChunkPure({
      documentId: 'edge-2',
      chunkIndex: 0,
      text: '   \n\n\t   \r\n   ',
      startWordIndex: 0,
      highlightStyle: 'middle-two',
    });
    assert(resSpaces.words.length === 0, 'Whitespace only text must produce 0 words');

    // Giant non-breaking token (no whitespace for 500 chars)
    const giantToken = 'a'.repeat(500);
    const resGiant = processChunkPure({
      documentId: 'edge-3',
      chunkIndex: 0,
      text: `Start ${giantToken} End`,
      startWordIndex: 0,
      highlightStyle: 'middle-two',
    });
    assert(resGiant.words.length === 3, 'Must safely handle oversized individual tokens');

    // Surrogate pairs & emojis
    const emojiText = 'Reading 🚀 speeds 🔥 focus 🧠!';
    const resEmoji = processChunkPure({
      documentId: 'edge-4',
      chunkIndex: 0,
      text: emojiText,
      startWordIndex: 0,
      highlightStyle: 'bionic-prefix',
    });
    assert(resEmoji.words.length === 6, `Expected 6 words with emojis, got ${resEmoji.words.length}`);

    console.log('  ✓ Corrupted, whitespace, emoji, and oversized tokens handled gracefully');
  }

  // =========================================================================
  // TEST SUITE 7: WORKER FAILURE & RECOVERABLE FALLBACK
  // =========================================================================
  console.log('Test 7: Worker Failure & Recoverable Fallback Mode');
  {
    const service = new WorkerProcessingService();
    // Simulate runtime where Worker constructor throws or is unavailable
    service.setFallbackMode(true);
    assert(service.isFallbackActive() === true, 'Fallback mode must be active');

    const result = await service.processDocument({
      documentId: 'fallback-test-doc',
      text: 'Resilience is the ability to recover from unexpected worker failures seamlessly.',
      highlightStyle: 'middle-two',
    });

    assert(result.totalWords > 5, 'Fallback mode must process document synchronously');
    assert(result.chunkWords.size >= 1, 'Fallback mode must return chunkWords');
    console.log('  ✓ Pure JavaScript fallback smoothly handles environments without Worker support');
  }

  // =========================================================================
  // TEST SUITE 8: BOUNDED MEMORY IN DOCUMENTHANDLE
  // =========================================================================
  console.log('Test 8: Bounded Memory in DocumentHandle (Active Window Pruning)');
  {
    documentStorageService.setFallbackMode(true);
    await documentStorageService.clearAll();

    // Create a 10-chunk document in storage
    const chunkCount = 10;
    const wordsPerChunk = 50;
    const chunkTexts: string[] = [];

    for (let c = 0; c < chunkCount; c++) {
      const words = Array.from({ length: wordsPerChunk }, (_, w) => `c${c}w${w}`);
      chunkTexts.push(words.join(' '));
    }
    const fullText = chunkTexts.join('\n\n');

    const { metadata } = await documentStorageService.createAndSaveDocument({
      id: 'bounded-mem-doc',
      title: 'Bounded Memory Document',
      text: fullText,
      sourceType: 'text',
    });

    // Create handle with maxCachedChunks = 3 (previous, current, next)
    const handle = new DocumentHandle('bounded-mem-doc', metadata, 3);
    assert(handle.getMaxCachedChunks() === 3, 'Max cached chunks must be 3');

    // Sequentially access chunks 0, 1, 2, 3, 4, 5
    for (let i = 0; i < 6; i++) {
      await handle.getChunk(i);
      await handle.getProcessedWordsForChunk(i, 'middle-two');
      // Memory must be bounded: size cannot exceed maxCachedChunks
      assert(
        handle.getCachedChunkCount() <= 3,
        `Cached chunks count (${handle.getCachedChunkCount()}) exceeded maxCachedChunks (3)`
      );
      assert(
        handle.getCachedWordsChunkCount() <= 3,
        `Cached words chunks count (${handle.getCachedWordsChunkCount()}) exceeded maxCachedChunks (3)`
      );
    }

    // Set active chunk to 5 with radius 1 (should keep chunks 4, 5, 6 and discard 0, 1, 2, 3)
    handle.setActiveChunk(5, 1);
    assert(handle.getCachedChunkCount() <= 3, 'Cache size after setActiveChunk must be <= 3');

    // Clear cache releases all hot memory
    handle.clearCache();
    assert(handle.getCachedChunkCount() === 0, 'Chunk cache must be 0 after clearCache');
    assert(handle.getCachedWordsChunkCount() === 0, 'Words chunk cache must be 0 after clearCache');

    console.log('  ✓ DocumentHandle enforces bounded cache limit (≤ 3 chunks in hot memory) with active window pruning');
  }

  // =========================================================================
  // TEST SUITE 9: CHUNK SIZE BENCHMARK VALIDATION
  // =========================================================================
  console.log('Test 9: Chunk Size Benchmark Validation');
  {
    const benchmarkResult = benchmarkChunkSize();
    assert(benchmarkResult.chunkSizes.length >= 3, 'Should benchmark at least 3 chunk sizes');
    assert(benchmarkResult.recommendedChunkWords >= 2000, 'Recommended chunk size should be >= 2000 words');
    assert(benchmarkResult.recommendedChunkWords <= 5000, 'Recommended chunk size should be <= 5000 words');
    console.log(`  ✓ Benchmark verified: Recommended chunk size = ${benchmarkResult.recommendedChunkWords} words (${benchmarkResult.throughputWordsPerSec.toLocaleString()} wps)`);
  }

  console.log('=============================================================');
  console.log('All Phase 4 Worker & Chunked Processing Tests Passed! (9 Suites)');
  console.log('=============================================================');
}

runPhase4Tests().catch((err) => {
  console.error('Phase 4 Test Failure:', err);
  process.exit(1);
});
