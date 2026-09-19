/**
 * Phase 1 Test Suite: Large Document Stability, Diagnostics & Low-Risk Optimizations
 */

import {
  LARGE_DOCUMENT_CHARACTER_THRESHOLD,
  LARGE_DOCUMENT_WORD_THRESHOLD,
  VERY_LARGE_DOCUMENT_CHARACTER_THRESHOLD,
  EXTREME_DOCUMENT_CHARACTER_THRESHOLD,
  classifyDocumentScale,
  isLargeDocument,
  measureDevTiming,
  getRecentDiagnostics,
} from '../performanceDiagnostics';
import { safeStorage, SAFE_MAX_STORAGE_ITEM_BYTES } from '../safeStorage';
import { countWordsFast, calculateTextStats, parseTextIntoWords, isRtlText } from '../textParser';
import { normalizeText, countWords } from '../normalizeText';
import { isUrlString, isMarkdownString } from '../../services/import/detectInput';

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

console.log('=============================================');
console.log('🧪 Starting Phase 1 Performance & Stability Test Suite');
console.log('=============================================\n');

// 1. Thresholds & Classification
console.log('--- 1. Large Document Thresholds & Scale Classification ---');
assert(LARGE_DOCUMENT_CHARACTER_THRESHOLD === 100_000, 'LARGE_DOCUMENT_CHARACTER_THRESHOLD is 100,000');
assert(LARGE_DOCUMENT_WORD_THRESHOLD === 20_000, 'LARGE_DOCUMENT_WORD_THRESHOLD is 20,000');
assert(VERY_LARGE_DOCUMENT_CHARACTER_THRESHOLD === 500_000, 'VERY_LARGE_DOCUMENT_CHARACTER_THRESHOLD is 500,000');
assert(EXTREME_DOCUMENT_CHARACTER_THRESHOLD === 1_000_000, 'EXTREME_DOCUMENT_CHARACTER_THRESHOLD is 1,000,000');

assert(classifyDocumentScale(5_000, 800) === 'normal', 'Classifies standard doc as normal');
assert(classifyDocumentScale(120_000, 18_000) === 'large', 'Classifies 120k chars as large');
assert(classifyDocumentScale(600_000) === 'very-large', 'Classifies 600k chars as very-large');
assert(classifyDocumentScale(1_200_000) === 'extreme', 'Classifies 1.2M chars as extreme');

assert(!isLargeDocument(50_000, 8_000), 'isLargeDocument is false for 50k chars');
assert(isLargeDocument(105_000), 'isLargeDocument is true for 105k chars');
assert(isLargeDocument(10_000, 22_000), 'isLargeDocument is true for 22k words');

// 2. Fast Word Counting & Statistics
console.log('\n--- 2. Allocation-Free Fast Word Count & Stats ---');
assert(countWordsFast('') === 0, 'countWordsFast handles empty text');
assert(countWordsFast('   ') === 0, 'countWordsFast handles pure whitespace');
assert(countWordsFast('Hello world from ADHD reader') === 5, 'countWordsFast counts standard sentence');
assert(countWordsFast('  Multiple   spaces \n\n and \t tabs  ') === 4, 'countWordsFast handles irregular spacing');

const persianSentence = 'این یک متن آزمایشی برای خواننده بیش‌فعالی است';
assert(countWordsFast(persianSentence) === countWords(persianSentence), 'countWordsFast matches countWords for RTL');

// Test 100,000+ character document
const repeatedBlock = 'The quick brown fox jumps over the lazy dog. '; // 45 chars, 9 words
const largeDoc = repeatedBlock.repeat(3_000); // 135,000 characters, 27,000 words
const t0 = performance.now();
const largeWordCount = countWordsFast(largeDoc);
const countDuration = performance.now() - t0;

assert(largeDoc.length > 100_000, 'Test document exceeds 100k characters');
assert(largeWordCount === 27_000, `Accurately counted 27,000 words in large document (found ${largeWordCount})`);
assert(countDuration < 50, `Fast word count took ${countDuration.toFixed(2)}ms (< 50ms requirement)`);

const stats = calculateTextStats(largeDoc, 300);
assert(stats.wordCount === 27_000, 'calculateTextStats has accurate word count');
assert(stats.charCount === largeDoc.length, 'calculateTextStats has accurate char count');
assert(stats.estimatedMinutes === 90, `Estimated minutes is 90 at 300 WPM (got ${stats.estimatedMinutes})`);

// 3. Performance Instrumentation
console.log('\n--- 3. Performance Measurement Instrumentation ---');
let timingRan = false;
const timedResult = measureDevTiming(
  'test operation',
  () => {
    timingRan = true;
    return 42;
  },
  () => ({ charCount: 100, wordCount: 20 })
);
assert(timingRan && timedResult === 42, 'measureDevTiming executes function and returns result');
const recent = getRecentDiagnostics();
const testEntry = recent.find((r) => r.label === 'test operation');
assert(Boolean(testEntry), 'Diagnostic record stored in ring buffer');
assert(testEntry?.wordCount === 20, 'Diagnostic record captured wordCount');

// 4. Input Detection Optimizations on Oversized Inputs
console.log('\n--- 4. Input Detection Optimizations on Oversized Inputs ---');
assert(!isUrlString(largeDoc), 'isUrlString exits immediately for 135k char document without trimming');
assert(isUrlString('https://en.wikipedia.org/wiki/ADHD'), 'isUrlString still detects valid URL');

const mdHeadingDoc = '# Chapter One\n\n' + largeDoc;
assert(isMarkdownString(mdHeadingDoc), 'isMarkdownString detects markdown on large document via sample');

// 5. Safe Storage & Quota Safety
console.log('\n--- 5. SafeStorage Quota Safety & Diagnostics ---');
const testKey = '__test_key_normal__';
safeStorage.setItem(testKey, 'sample-value');
assert(safeStorage.getItem(testKey) === 'sample-value', 'safeStorage normal setItem/getItem works');
safeStorage.removeItem(testKey);
assert(safeStorage.getItem(testKey) === null, 'safeStorage removeItem clears key');

// Test oversized payload (> 2MB)
const hugePayload = 'A'.repeat(SAFE_MAX_STORAGE_ITEM_BYTES + 500);
const hugeKey = '__test_key_huge__';
safeStorage.setItem(hugeKey, hugePayload);

assert(safeStorage.isFallbackKey(hugeKey), 'Huge item diverted safely to memory fallback without throwing');
assert(safeStorage.getItem(hugeKey) === hugePayload, 'safeStorage retrieves full huge payload intact from fallback');
assert(safeStorage.getItem(hugeKey)?.length === hugePayload.length, 'Document content was never truncated');
safeStorage.removeItem(hugeKey);

const storageDiag = safeStorage.getDiagnostics();
assert(Array.isArray(storageDiag.inMemoryKeys), 'Storage diagnostics provide inMemoryKeys list');

// 6. Tokenizer & RTL Safeguards
console.log('\n--- 6. Tokenizer & RTL Safeguards ---');
const parsed = parseTextIntoWords('Hello, world! This is a test.');
assert(parsed.length === 6, 'parseTextIntoWords produces correct number of tokens');
assert(parsed[0].prefixPunct === '' && parsed[0].highlightedText === 'el', 'splitWordParts highlighted middle letter correctly');
assert(parsed[1].suffixPunct === '!', 'splitWordParts captured trailing punctuation');

assert(isRtlText('سلام دنیا'), 'isRtlText detects Persian greeting');
assert(!isRtlText('The quick brown fox jumps over the lazy dog'), 'isRtlText returns false for pure English text');

console.log('\n=============================================');
console.log(`🏁 Phase 1 Test Results: ${passed} passed, ${failed} failed`);
console.log('=============================================');

if (failed > 0) {
  process.exit(1);
}
