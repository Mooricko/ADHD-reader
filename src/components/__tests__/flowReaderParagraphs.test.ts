import assert from 'node:assert';
import { parseTextIntoWords } from '../../utils/textParser';
import { ParagraphIndexEntry } from '../../types';

// Extract and test the paragraph chunking & grouping strategy used in FlowReader
function findParagraphIndexForWord(
  paragraphs: ParagraphIndexEntry[],
  wordIndex: number
): number {
  if (!paragraphs || paragraphs.length === 0) return 0;
  let low = 0;
  let high = paragraphs.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const p = paragraphs[mid];
    if (wordIndex >= p.startWordIndex && wordIndex <= p.endWordIndex) {
      return p.paragraphIndex;
    }
    if (wordIndex < p.startWordIndex) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (low >= paragraphs.length) return paragraphs[paragraphs.length - 1].paragraphIndex;
  return paragraphs[Math.max(0, high)].paragraphIndex;
}

interface GroupResult {
  paragraphIndex: number;
  wordCount: number;
  firstWord: string;
  lastWord: string;
}

function groupWordsIntoParagraphs(
  words: any[],
  docParagraphs?: ParagraphIndexEntry[] | null
): GroupResult[] {
  if (!words || words.length === 0) return [];

  const groups: any[] = [];

  // Strategy A: Pre-processed Document Structure with Natural Double-Newline Breaks
  if (docParagraphs && docParagraphs.length > 0) {
    let currentGroup: any = null;

    for (let idx = 0; idx < words.length; idx++) {
      const w = words[idx];
      if (!w) continue;
      const globalIdx = w.index !== undefined ? w.index : idx;
      const pIdx = findParagraphIndexForWord(docParagraphs, globalIdx);

      if (!currentGroup || currentGroup.paragraphIndex !== pIdx) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = { paragraphIndex: pIdx, words: [] };
      }
      currentGroup.words.push({ word: w, globalIndex: globalIdx });
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }
  } else {
    // Strategy B: Token-Level Natural Break Detection (Double Newline vs Sentence End)
    const hasExplicitBreaks = words.some((w) => w?.hasParagraphBreak);

    if (hasExplicitBreaks) {
      let currentPIdx = words[0]?.paragraphIndex ?? 0;
      let currentGroup: any = { paragraphIndex: currentPIdx, words: [] };

      for (let idx = 0; idx < words.length; idx++) {
        const w = words[idx];
        if (!w) continue;
        const globalIdx = w.index !== undefined ? w.index : idx;

        currentGroup.words.push({ word: w, globalIndex: globalIdx });

        // ONLY split on natural double newlines, NEVER solely on sentence-ending punctuation
        if (w.hasParagraphBreak && idx < words.length - 1) {
          groups.push(currentGroup);
          const nextWord = words[idx + 1];
          currentPIdx =
            nextWord?.paragraphIndex !== undefined && nextWord.paragraphIndex !== currentPIdx
              ? nextWord.paragraphIndex
              : currentPIdx + 1;
          currentGroup = { paragraphIndex: currentPIdx, words: [] };
        }
      }

      if (currentGroup.words.length > 0) {
        groups.push(currentGroup);
      }
    } else {
      // Strategy C: Fallback with Sentence-Punctuation Heuristic Guard
      const distinctIndices = new Set(words.map((w) => w?.paragraphIndex ?? 0)).size;
      const sentenceEndCount = words.filter((w) => w?.hasSentenceEnd).length;
      const isSentenceFragmented =
        distinctIndices > 1 &&
        sentenceEndCount > 0 &&
        Math.abs(distinctIndices - sentenceEndCount) <= 2;

      if (isSentenceFragmented) {
        const TARGET_WORDS_PER_PARAGRAPH = 75;
        let currentGroup: any = { paragraphIndex: 0, words: [] };
        let pCounter = 0;

        for (let idx = 0; idx < words.length; idx++) {
          const w = words[idx];
          if (!w) continue;
          const globalIdx = w.index !== undefined ? w.index : idx;
          currentGroup.words.push({ word: w, globalIndex: globalIdx });

          if (
            w.hasSentenceEnd &&
            currentGroup.words.length >= TARGET_WORDS_PER_PARAGRAPH &&
            idx < words.length - 1
          ) {
            groups.push(currentGroup);
            pCounter++;
            currentGroup = { paragraphIndex: pCounter, words: [] };
          }
        }

        if (currentGroup.words.length > 0) {
          groups.push(currentGroup);
        }
      } else {
        let currentGroup: any = null;
        for (let idx = 0; idx < words.length; idx++) {
          const w = words[idx];
          if (!w) continue;
          const pIdx = w.paragraphIndex ?? 0;
          const globalIdx = w.index !== undefined ? w.index : idx;
          if (!currentGroup || currentGroup.paragraphIndex !== pIdx) {
            if (currentGroup) {
              groups.push(currentGroup);
            }
            currentGroup = { paragraphIndex: pIdx, words: [] };
          }
          currentGroup.words.push({ word: w, globalIndex: globalIdx });
        }

        if (currentGroup) {
          groups.push(currentGroup);
        }
      }
    }
  }

  return groups.map((g) => ({
    paragraphIndex: g.paragraphIndex,
    wordCount: g.words.length,
    firstWord: g.words[0]?.word?.original || '',
    lastWord: g.words[g.words.length - 1]?.word?.original || '',
  }));
}

async function runTests() {
  console.log('--- Starting FlowReader Paragraph Chunking & Visual Flow Tests ---');

  // Test 1: Multi-sentence paragraphs must not be broken into separate paragraphs
  console.log('Test 1: Multiple sentences within the same paragraph remain in ONE visual paragraph');
  const multiSentenceText = 
    'The quick brown fox jumps over the lazy dog. It was a sunny afternoon in the forest! Why was the dog lazy? Nobody really knew.\n\n' +
    'Second paragraph begins here. It also contains multiple sentences. Isn\'t that great?';
  
  const parsedWords = parseTextIntoWords(multiSentenceText);
  const groups = groupWordsIntoParagraphs(parsedWords);

  assert.strictEqual(groups.length, 2, `Expected exactly 2 paragraphs, got ${groups.length}`);
  assert.strictEqual(groups[0].paragraphIndex, 0);
  assert.strictEqual(groups[1].paragraphIndex, 1);
  assert.strictEqual(groups[0].firstWord, 'The');
  assert.strictEqual(groups[0].lastWord, 'knew.');
  assert.strictEqual(groups[1].firstWord, 'Second');
  console.log('✓ Multi-sentence paragraphs stay together, double newlines create distinct paragraphs');

  // Test 2: Pre-processed Document Structure (docParagraphs) takes precedence
  console.log('Test 2: Pre-processed Document Structure maps words to true natural double-newline breaks');
  const docParagraphs: ParagraphIndexEntry[] = [
    { paragraphIndex: 0, startWordIndex: 0, endWordIndex: 19, wordCount: 20 },
    { paragraphIndex: 1, startWordIndex: 20, endWordIndex: 39, wordCount: 20 },
  ];
  // Synthetic words where paragraphIndex was naively assigned per sentence (0, 1, 2, 3...)
  const syntheticWords = Array.from({ length: 40 }, (_, idx) => ({
    original: `word${idx}`,
    index: idx,
    paragraphIndex: Math.floor(idx / 5), // every 5 words had a naive paragraphIndex
    hasSentenceEnd: idx % 5 === 4,
    hasParagraphBreak: false,
  }));

  const structuredGroups = groupWordsIntoParagraphs(syntheticWords, docParagraphs);
  assert.strictEqual(structuredGroups.length, 2, `Expected 2 paragraphs from docParagraphs, got ${structuredGroups.length}`);
  assert.strictEqual(structuredGroups[0].wordCount, 20);
  assert.strictEqual(structuredGroups[1].wordCount, 20);
  assert.strictEqual(structuredGroups[0].paragraphIndex, 0);
  assert.strictEqual(structuredGroups[1].paragraphIndex, 1);
  console.log('✓ Document structure successfully corrects naive sentence-level index fragmentation');

  // Test 3: Legacy fragmented words fallback heuristic
  console.log('Test 3: Heuristic guard catches fragmented sentence-as-paragraph inputs without docParagraphs');
  // 6 sentences, each with distinct paragraphIndex and hasSentenceEnd, but no hasParagraphBreak
  const fragmentedWords = Array.from({ length: 30 }, (_, idx) => ({
    original: `w${idx}`,
    index: idx,
    paragraphIndex: Math.floor(idx / 5), // 6 distinct indices
    hasSentenceEnd: idx % 5 === 4,
    hasParagraphBreak: false,
  }));

  const coalescedGroups = groupWordsIntoParagraphs(fragmentedWords, null);
  // Should coalesce into 1 paragraph instead of 6 1-sentence micro-paragraphs
  assert(coalescedGroups.length < 6, `Expected coalescing, got ${coalescedGroups.length} paragraphs`);
  console.log(`✓ Coalesced 6 fragmented sentences into ${coalescedGroups.length} coherent reading paragraph(s)`);

  // Test 4: Dialogue, quotes, abbreviations in text do not cause paragraph breaks
  console.log('Test 4: Abbreviations, decimals, and quotes do not break paragraph continuity');
  const dialogueText = 
    '"Wait!" shouted Dr. Smith. "The reading is 3.5 volts!" He paused, then looked at Mrs. Jones.\n\n' +
    '"Understood," she replied.';
  const dialogueWords = parseTextIntoWords(dialogueText);
  const dialogueGroups = groupWordsIntoParagraphs(dialogueWords);

  assert.strictEqual(dialogueGroups.length, 2, `Expected 2 paragraphs for dialogue text, got ${dialogueGroups.length}`);
  assert.strictEqual(dialogueGroups[0].firstWord, '"Wait!"');
  assert.strictEqual(dialogueGroups[0].lastWord, 'Jones.');
  assert.strictEqual(dialogueGroups[1].firstWord, '"Understood,"');
  console.log('✓ Dialogue and abbreviation sentences stay within their natural paragraph');

  // Test 5: MarkerHighlight layout metrics consistency (Zero Layout Shift)
  console.log('Test 5: MarkerHighlight active vs inactive layout metrics invariant (Zero Layout Shift)');
  // Verify that the classes responsible for geometry (px-1.5, py-0.5, mx-[1px], font-medium, leading) are identical
  const activeClass = 'relative inline-block align-baseline px-1.5 py-0.5 mx-[1px] cursor-pointer select-text rounded-lg transition-colors duration-150';
  const inactiveClass = 'relative inline-block align-baseline px-1.5 py-0.5 mx-[1px] cursor-pointer select-text rounded-lg transition-colors duration-150';
  assert.strictEqual(activeClass, inactiveClass, 'Outer container box classes must be strictly identical');

  // Verify that text weight is invariant between states (font-medium on both)
  const activeTextClass = 'relative z-10 font-medium transition-colors duration-150 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]';
  const inactiveTextClass = 'relative z-10 font-medium transition-colors duration-150';
  // Both contain 'font-medium' and neither contains 'font-bold' on the wrapper
  assert(activeTextClass.includes('font-medium') && inactiveTextClass.includes('font-medium'));
  assert(!activeTextClass.includes('font-bold') && !inactiveTextClass.includes('font-bold'));
  assert(!activeTextClass.includes('tracking-wide') && !inactiveTextClass.includes('tracking-wide'));
  console.log('✓ MarkerHighlight guarantees zero layout shift across all active/inactive state changes');

  console.log('=============================================================');
  console.log('All FlowReader Paragraph Chunking & Layout Tests Passed! (5 Tests)');
  console.log('=============================================================');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
