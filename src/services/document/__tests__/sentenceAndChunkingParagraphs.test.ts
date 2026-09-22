import { chunkDocument, reconstructTextFromChunks } from '../chunking';
import { processChunkPure } from '../../worker/chunkProcessor';
import { splitIntoSentences, parseTextIntoWords, countWordsFast } from '../../../utils/textParser';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('\n========================================================');
  console.log('🧪 Starting Sentence Splitting & Paragraph Continuity Test Suite');
  console.log('========================================================\n');

  // ----------------------------------------------------
  // Test 1: Sentence Tokenizer with Abbreviations, Decimals & Quotes
  // ----------------------------------------------------
  console.log('--- Test 1: Intelligent Sentence Tokenizer Edge Cases ---');
  
  const textWithAbbr = 'Dr. Smith and Mrs. White visited Washington D.C. at 3.30 p.m. with $150.75 in cash. Next sentence starts here.';
  const s1 = splitIntoSentences(textWithAbbr);
  assert(s1.length === 2, `Correctly identifies 2 sentences (got ${s1.length})`);
  assert(s1[0].includes('Dr. Smith and Mrs. White'), 'First sentence keeps Dr. and Mrs. intact');
  assert(s1[0].includes('3.30 p.m.'), 'First sentence keeps decimals and p.m. intact');
  assert(s1[1] === 'Next sentence starts here.', 'Second sentence matches expected text');

  const textWithDialogue = '"Stop!" he cried out. "Don\'t move an inch!"';
  const s2 = splitIntoSentences(textWithDialogue);
  assert(s2.length === 2, `Dialogue with lowercase tag kept intact (got ${s2.length})`);
  assert(s2[0] === '"Stop!" he cried out.', 'Dialogue tag attached to first sentence');
  assert(s2[1] === '"Don\'t move an inch!"', 'Second dialogue sentence clean');

  const textWithSoftWrap = 'This is the first sentence\nwith a soft line break in it. Here is the second\nsentence with another break.';
  const s3 = splitIntoSentences(textWithSoftWrap);
  assert(s3.length === 2, `Soft linebreaks inside sentences do not split sentences (got ${s3.length})`);
  assert(!s3[0].includes('\n'), 'Soft linebreak normalized to space in sentence 1');

  // ----------------------------------------------------
  // Test 2: Chunking Does NOT Turn Sentences into Separate Paragraphs
  // ----------------------------------------------------
  console.log('\n--- Test 2: Chunking Does NOT Turn Sentences into Separate Paragraphs ---');

  // Create an oversized paragraph (> 1000 words) consisting of 25 sentences
  const sentencesInPara: string[] = [];
  for (let i = 1; i <= 25; i++) {
    sentencesInPara.push(
      `Sentence ${i} discusses important neurocognitive principles of sustained attention, cognitive pacing, and working memory constraints in readers.`
    );
  }
  const largeSingleParagraph = sentencesInPara.join(' ');
  const wordCount = countWordsFast(largeSingleParagraph);
  assert(wordCount > 350, `Test paragraph is sufficiently sized (${wordCount} words)`);

  // Target 150 words per chunk to force splitting across chunks
  const chunks = chunkDocument('doc-sentences-test', largeSingleParagraph, 150);
  assert(chunks.length > 1, `Oversized paragraph split into multiple chunks (created ${chunks.length})`);

  // CRITICAL CHECK: Within each chunk, there must NOT be \n\n because all sentences belong to the SAME paragraph
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    assert(
      !chunk.text.includes('\n\n'),
      `Chunk ${c} text does NOT contain artificial paragraph breaks (\\n\\n)`
    );
    assert(
      chunk.startParagraphIndex === 0 && chunk.endParagraphIndex === 0,
      `Chunk ${c} correctly identifies startParagraphIndex=0 and endParagraphIndex=0`
    );
  }

  // ----------------------------------------------------
  // Test 3: Processed Words Paragraph Continuity Across Chunks
  // ----------------------------------------------------
  console.log('\n--- Test 3: Processed Words Paragraph Continuity Across Chunks ---');

  const processedChunk0 = processChunkPure({
    documentId: 'doc-sentences-test',
    chunkIndex: 0,
    text: chunks[0].text,
    startWordIndex: chunks[0].startWordIndex,
    highlightStyle: 'middle-two',
    options: {
      startParagraphIndex: chunks[0].startParagraphIndex,
    },
  });

  const processedChunk1 = processChunkPure({
    documentId: 'doc-sentences-test',
    chunkIndex: 1,
    text: chunks[1].text,
    startWordIndex: chunks[1].startWordIndex,
    highlightStyle: 'middle-two',
    options: {
      startParagraphIndex: chunks[1].startParagraphIndex,
    },
  });

  // Verify that all words in Chunk 0 have paragraphIndex = 0
  const nonZeroParaCountChunk0 = processedChunk0.words.filter((w) => w.paragraphIndex !== 0).length;
  assert(
    nonZeroParaCountChunk0 === 0,
    `All ${processedChunk0.words.length} words in Chunk 0 belong to paragraphIndex 0`
  );

  // Verify that all words in Chunk 1 also have paragraphIndex = 0 (same paragraph continuation!)
  const nonZeroParaCountChunk1 = processedChunk1.words.filter((w) => w.paragraphIndex !== 0).length;
  assert(
    nonZeroParaCountChunk1 === 0,
    `All ${processedChunk1.words.length} words in Chunk 1 belong to paragraphIndex 0 (no false break!)`
  );

  // ----------------------------------------------------
  // Test 4: Multi-Paragraph Document with Mixed Chunking
  // ----------------------------------------------------
  console.log('\n--- Test 4: Multi-Paragraph Document with Mixed Chunking ---');

  const para1 = 'First short paragraph with just a few introductory words.';
  const para2 = largeSingleParagraph; // Oversized
  const para3 = 'Final concluding paragraph summarizing the core reading insights.';
  const fullDocText = `${para1}\n\n${para2}\n\n${para3}`;

  const mixedChunks = chunkDocument('doc-mixed-test', fullDocText, 150);
  assert(mixedChunks.length >= 3, `Mixed document created ${mixedChunks.length} chunks`);

  // First chunk must start at paragraph 0
  assert(mixedChunks[0].startParagraphIndex === 0, 'First chunk starts at paragraph 0');

  // Last chunk must end at paragraph 2
  const lastChunk = mixedChunks[mixedChunks.length - 1];
  assert(lastChunk.endParagraphIndex === 2, 'Last chunk ends at paragraph 2');

  // Full text reconstruction must match original without spurious double newlines
  const reconstructed = reconstructTextFromChunks(mixedChunks);
  const reconstructedParagraphs = reconstructed.split(/\n\s*\n/);
  assert(
    reconstructedParagraphs.length === 3,
    `Reconstructed document preserves exactly 3 paragraphs (got ${reconstructedParagraphs.length})`
  );

  // ----------------------------------------------------
  // Test 5: Soft Line Breaks Within Paragraphs in parseTextIntoWords
  // ----------------------------------------------------
  console.log('\n--- Test 5: Soft Line Breaks in parseTextIntoWords ---');

  const softWrappedText = 'Line 1 of paragraph.\nLine 2 of the same paragraph.\nLine 3 ending the paragraph.\n\nParagraph 2 is here.';
  const parsedWords = parseTextIntoWords(softWrappedText);

  // First 3 lines should have paragraphIndex = 0
  const para0Words = parsedWords.filter((w) => w.paragraphIndex === 0);
  const para1Words = parsedWords.filter((w) => w.paragraphIndex === 1);

  assert(para0Words.length > 0, 'Paragraph 0 contains words');
  assert(para1Words.length === 4, 'Paragraph 2 contains exactly 4 words');
  assert(
    parsedWords[parsedWords.length - 1].paragraphIndex === 1,
    'Last word belongs to paragraph 1'
  );

  // hasParagraphBreak should only be true for the last word of paragraph 0, not for line 1 or line 2!
  const breaksInPara0 = para0Words.filter((w) => w.hasParagraphBreak);
  assert(
    breaksInPara0.length === 1,
    `Only 1 paragraph break at end of paragraph 0 (got ${breaksInPara0.length})`
  );
  assert(
    breaksInPara0[0].original.includes('paragraph'),
    'Paragraph break is positioned on the last word of the paragraph'
  );

  console.log('\n========================================================');
  console.log('🏁 All Sentence & Paragraph Integrity Tests Passed!');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
