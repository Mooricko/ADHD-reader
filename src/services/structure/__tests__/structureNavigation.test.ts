/**
 * Phase 3 Document Structure & Location Index: Comprehensive Test Suite
 * 
 * Tests:
 * 1. 1,000-page PDF navigation:
 *    - Page 1, Page 300, Page 1000 resolution without tokenizing all words
 *    - Chapter 7 bookmark resolution to exact word index
 *    - Boundary conditions between consecutive pages
 *    - Storage persistence and handle resolution
 * 2. Markdown hierarchical heading extraction (H1, H2, H3, parent-child links)
 * 3. Plain TXT: conservative chapter detection, no fake pagination
 * 4. Mixed RTL/LTR document structure and word boundary mappings
 * 5. Lightweight chunk-based search index
 * 6. DocumentPosition unified resolver
 */

import {
  buildPdfStructure,
  buildMarkdownStructure,
  buildTxtStructure,
  PdfOutlineItem,
} from '../structureBuilder';
import {
  resolvePage,
  resolveChapter,
  resolveSection,
  resolveWordIndex,
  resolveParagraph,
  resolvePercent,
  resolvePosition,
} from '../locationResolver';
import { searchDocument } from '../searchIndex';
import { documentStorageService } from '../../document/documentStorageService';
import { DocumentHandle } from '../../document/documentHandle';
import { DocumentPosition } from '../../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log('--- Starting Phase 3: Document Structure & Location Index Tests ---');
  documentStorageService.setFallbackMode(true);
  await documentStorageService.clearAll();

  // =========================================================================
  // TEST SUITE 1: 1,000-PAGE PDF SIMULATION
  // =========================================================================
  console.log('Test 1: 1,000-Page PDF Simulation & Location Resolution');
  {
    const totalPages = 1000;
    const wordsPerPage = 200; // ~200,000 total words
    const pageTexts: string[] = [];

    for (let i = 1; i <= totalPages; i++) {
      // Build a page with exactly 200 words
      const words = Array.from({ length: wordsPerPage }, (_, w) => `p${i}w${w + 1}`);
      pageTexts.push(words.join(' '));
    }

    const outlines: PdfOutlineItem[] = [
      { title: 'Chapter 1: Genesis', pageNumber: 1, level: 1 },
      { title: 'Chapter 2: Foundations', pageNumber: 50, level: 1 },
      { title: 'Chapter 7: The Breakthrough', pageNumber: 300, level: 1 },
      { title: 'Chapter 12: Epilogue', pageNumber: 950, level: 1 },
    ];

    const pdfDocId = 'pdf-benchmark-1000';
    const { structure, pages, fullText } = buildPdfStructure(pdfDocId, pageTexts, outlines);

    assert(pages.length === 1000, `Expected 1000 pages, got ${pages.length}`);
    assert(structure.pages !== undefined, 'PDF structure must have pages defined');
    assert(structure.chapters.length === 4, `Expected 4 chapters, got ${structure.chapters.length}`);

    // Persist document to storage service
    await documentStorageService.createAndSaveDocument({
      id: pdfDocId,
      title: 'Massive 1000-Page Reference',
      text: fullText,
      sourceType: 'pdf',
      structure,
      pages,
    });

    // Test Page 1 Resolution
    const p1 = await resolvePage(pdfDocId, 1);
    assert(p1.globalWordIndex === 0, `Page 1 start word must be 0, got ${p1.globalWordIndex}`);
    assert(p1.pageNumber === 1, `Page number must be 1, got ${p1.pageNumber}`);
    assert(p1.chunkIndex === 0, `Page 1 chunk must be 0, got ${p1.chunkIndex}`);
    assert(p1.chapter?.title === 'Chapter 1: Genesis', `Expected Chapter 1, got ${p1.chapter?.title}`);

    // Test Page 300 Resolution (Acceptance Criteria)
    // Page 300 start word index should be exactly: 299 pages * 200 words = 59,800
    const expectedP300Start = 299 * wordsPerPage;
    const startTimer = performance.now();
    const p300 = await resolvePage(pdfDocId, 300);
    const duration = performance.now() - startTimer;

    assert(
      p300.globalWordIndex === expectedP300Start,
      `Page 300 start word must be ${expectedP300Start}, got ${p300.globalWordIndex}`
    );
    assert(p300.pageNumber === 300, `Expected page number 300, got ${p300.pageNumber}`);
    assert(
      p300.chapter?.title === 'Chapter 7: The Breakthrough',
      `Page 300 should be inside Chapter 7, got ${p300.chapter?.title}`
    );
    assert(duration < 10, `Page 300 resolution must be instant (<10ms), took ${duration.toFixed(2)}ms`);

    // Test Page 300 with word offset
    const p300Offset = await resolvePage(pdfDocId, 300, 25);
    assert(
      p300Offset.globalWordIndex === expectedP300Start + 25,
      `Page 300 offset 25 must resolve to ${expectedP300Start + 25}, got ${p300Offset.globalWordIndex}`
    );

    // Test Last Page (Page 1000)
    const expectedP1000Start = 999 * wordsPerPage;
    const p1000 = await resolvePage(pdfDocId, 1000);
    assert(
      p1000.globalWordIndex === expectedP1000Start,
      `Page 1000 start word must be ${expectedP1000Start}, got ${p1000.globalWordIndex}`
    );
    assert(p1000.pageNumber === 1000, `Expected page number 1000, got ${p1000.pageNumber}`);
    assert(
      p1000.chapter?.title === 'Chapter 12: Epilogue',
      `Page 1000 should be inside Chapter 12, got ${p1000.chapter?.title}`
    );

    // Test Page Boundaries: Page 299 vs Page 300
    const page299Entry = pages[298];
    const page300Entry = pages[299];
    assert(
      page299Entry.endWordIndex + 1 === page300Entry.startWordIndex,
      `Consecutive pages must touch with zero gap: p299 end (${page299Entry.endWordIndex}) vs p300 start (${page300Entry.startWordIndex})`
    );

    // Test Chapter 7 Resolution (Acceptance Criteria)
    const chap7 = await resolveChapter(pdfDocId, 'chap-3'); // 3rd outline item is Chapter 7
    assert(
      chap7.chapter?.title === 'Chapter 7: The Breakthrough',
      `Expected Chapter 7, got ${chap7.chapter?.title}`
    );
    assert(
      chap7.globalWordIndex === expectedP300Start,
      `Chapter 7 start word must match Page 300 start word (${expectedP300Start}), got ${chap7.globalWordIndex}`
    );
    assert(chap7.pageNumber === 300, `Chapter 7 must resolve to page 300, got ${chap7.pageNumber}`);

    // Verify ReaderDocumentHandle integration
    const handle = new DocumentHandle(pdfDocId);
    const resolvedViaHandle = await handle.resolvePage(300);
    assert(
      resolvedViaHandle.globalWordIndex === expectedP300Start,
      'DocumentHandle.resolvePage must match direct resolution'
    );
    const handlePages = await handle.getPages();
    assert(handlePages?.length === 1000, `Handle getPages() returned ${handlePages?.length} pages`);

    console.log('✓ 1,000-page PDF navigation & chapter resolution passed');
  }

  // =========================================================================
  // TEST SUITE 2: MARKDOWN HIERARCHICAL STRUCTURE (H1, H2, H3)
  // =========================================================================
  console.log('Test 2: Markdown Hierarchical Headings & Section Navigation');
  {
    const markdown = `# Chapter One: Foundations
This is the opening text of chapter one.

## Section 1.1: Background Principles
Background details on cognitive load and attention span.

### Subsection 1.1.1: Neurodiversity in Reading
Detailed analysis of ADHD focus rhythms.

## Section 1.2: Design Paradigms
Overview of RSVP versus Flow reading paradigms.

# Chapter Two: Algorithmic Architecture
Here begins the second chapter with deep technical specifications.

## Section 2.1: Chunking Engine
How documents are partitioned into resilient chunks.
`;

    const mdDocId = 'md-hierarchical-test';
    const { structure, normalizedText } = buildMarkdownStructure(mdDocId, markdown);

    assert(structure.pages === undefined, 'Markdown must NEVER create fake pages');
    assert(structure.chapters.length === 2, `Expected 2 H1 chapters, got ${structure.chapters.length}`);
    assert(structure.sections.length === 6, `Expected 6 total headings, got ${structure.sections.length}`);

    // Verify Hierarchy
    const chap1 = structure.chapters[0];
    assert(chap1.title === 'Chapter One: Foundations', `Expected Chapter One title, got ${chap1.title}`);
    assert(chap1.children?.length === 2, `Chapter One must have 2 H2 children, got ${chap1.children?.length}`);

    const sec11 = chap1.children![0];
    assert(sec11.title === 'Section 1.1: Background Principles', `Expected Sec 1.1 title, got ${sec11.title}`);
    assert(sec11.level === 2, `Sec 1.1 level must be 2, got ${sec11.level}`);
    assert(sec11.children?.length === 1, `Sec 1.1 must have 1 H3 child, got ${sec11.children?.length}`);

    const subsec111 = sec11.children![0];
    assert(subsec111.title === 'Subsection 1.1.1: Neurodiversity in Reading', `Expected SubSec 1.1.1 title, got ${subsec111.title}`);
    assert(subsec111.level === 3, `SubSec 1.1.1 level must be 3, got ${subsec111.level}`);
    assert(subsec111.parentId === sec11.id, `SubSec parentId must link to Sec 1.1, got ${subsec111.parentId}`);

    // Persist and test resolution
    await documentStorageService.createAndSaveDocument({
      id: mdDocId,
      title: 'Hierarchical Markdown Book',
      text: normalizedText,
      sourceType: 'markdown',
      structure,
    });

    // Resolve by Section ID
    const resolvedSec = await resolveSection(mdDocId, sec11.id);
    assert(
      resolvedSec.section?.title === sec11.title,
      `Resolved section title mismatch: ${resolvedSec.section?.title}`
    );
    assert(
      resolvedSec.chapter?.title === chap1.title,
      `Resolved section should belong to Chapter One: ${resolvedSec.chapter?.title}`
    );
    assert(resolvedSec.pageNumber === undefined, 'Markdown section resolution must not have pageNumber');

    // Attempting to resolve page on Markdown should cleanly throw error
    let threwPageError = false;
    try {
      await resolvePage(mdDocId, 1);
    } catch (err: any) {
      threwPageError = true;
      assert(err.message.includes('not paginated'), `Expected "not paginated" error, got: ${err.message}`);
    }
    assert(threwPageError, 'resolvePage must throw error for unpaginated markdown');

    console.log('✓ Markdown H1, H2, H3 hierarchy & section navigation passed');
  }

  // =========================================================================
  // TEST SUITE 3: PLAIN TXT (NO FAKE PAGINATION, CONSERVATIVE CHAPTERS)
  // =========================================================================
  console.log('Test 3: Plain TXT (No Fake Pagination, Conservative Chapters)');
  {
    // Case A: TXT without chapters
    const unchapteredTxt = `First paragraph of plain text. This is general notes without any formal chapters.

Second paragraph providing additional commentary and context for the user.

Third paragraph concluding the notes with a summary.`;

    const txtDocId = 'txt-plain-test';
    const txtStructure = buildTxtStructure(txtDocId, unchapteredTxt);

    assert(txtStructure.pages === undefined, 'TXT must NEVER create fake pages');
    assert(txtStructure.chapters.length === 0, 'TXT without chapters must not invent fake chapters');
    assert(txtStructure.paragraphs?.length === 3, `Expected 3 paragraphs, got ${txtStructure.paragraphs?.length}`);

    await documentStorageService.createAndSaveDocument({
      id: txtDocId,
      title: 'Quick Scratchpad',
      text: unchapteredTxt,
      sourceType: 'txt',
      structure: txtStructure,
    });

    // Resolve paragraph in TXT
    const resolvedP2 = await resolveParagraph(txtDocId, 1);
    assert(resolvedP2.paragraphIndex === 1, `Expected paragraphIndex 1, got ${resolvedP2.paragraphIndex}`);
    assert(resolvedP2.pageNumber === undefined, 'TXT paragraph resolution must not have pageNumber');

    // Case B: TXT with reliable chapter markers
    const chapteredTxt = `Chapter 1: The Awakening
The morning sun rose over the quiet town.

Chapter 2: The Departure
By noon, the journey had begun in earnest.
`;
    const chapteredStructure = buildTxtStructure('txt-chap-test', chapteredTxt);
    assert(
      chapteredStructure.chapters.length === 2,
      `Reliable chapters in TXT should be detected (expected 2, got ${chapteredStructure.chapters.length})`
    );
    assert(chapteredStructure.pages === undefined, 'Chaptered TXT must still NOT have fake pages');

    console.log('✓ Plain TXT conservative structure & no fake pagination verified');
  }

  // =========================================================================
  // TEST SUITE 4: MIXED RTL/LTR DOCUMENTS
  // =========================================================================
  console.log('Test 4: Mixed RTL/LTR Documents');
  {
    const mixedMarkdown = `# فصل اول: مقدمه و راهنمای خواندن
این بخش به زبان فارسی نوشته شده است و اصول خواندن سریع را توضیح می‌دهد.

## Section 2: English Technical Core
This section switches to English to discuss computational algorithms and RSVP pacing.

## بخش ۳: جمع‌بندی نهایی
در این قسمت نتیجه‌گیری کلی بیان می‌شود.
`;

    const rtlDocId = 'mixed-rtl-ltr-doc';
    const { structure, normalizedText } = buildMarkdownStructure(rtlDocId, mixedMarkdown);

    assert(structure.sections.length === 3, `Expected 3 sections in mixed RTL doc, got ${structure.sections.length}`);
    assert(structure.sections[0].title.includes('فصل اول'), 'Section 1 must preserve Persian characters');
    assert(structure.sections[1].title.includes('English Technical Core'), 'Section 2 must preserve English characters');

    await documentStorageService.createAndSaveDocument({
      id: rtlDocId,
      title: 'کتاب راهنمای مطالعه سریع',
      text: normalizedText,
      sourceType: 'markdown',
      structure,
    });

    const resolvedRtlSec = await resolveSection(rtlDocId, structure.sections[0].id);
    assert(resolvedRtlSec.globalWordIndex === 0, 'First Persian section must start at word index 0');
    assert(resolvedRtlSec.chapter?.title.includes('فصل اول'), 'Resolved chapter must match Persian title');

    console.log('✓ Mixed RTL/LTR document structural mapping verified');
  }

  // =========================================================================
  // TEST SUITE 5: LIGHTWEIGHT SEARCH INDEX
  // =========================================================================
  console.log('Test 5: Lightweight Search Index Boundary');
  {
    const searchDocId = 'pdf-benchmark-1000'; // reuse our 1000-page doc
    // In our doc, page 300 words look like: "p300w1 p300w2 ... p300w200"
    const results = await searchDocument(searchDocId, 'p300w50');

    assert(results.length >= 1, `Expected search match for "p300w50", got ${results.length}`);
    const match = results[0];
    assert(match.pageNumber === 300, `Search match must identify page 300, got ${match.pageNumber}`);
    assert(
      match.chapterTitle === 'Chapter 7: The Breakthrough',
      `Search match must identify Chapter 7, got ${match.chapterTitle}`
    );
    assert(match.snippet.includes('p300w50'), `Snippet must contain query term, got: ${match.snippet}`);
    assert(match.globalWordIndex >= 299 * 200, `Word index must be in page 300 range, got ${match.globalWordIndex}`);

    console.log('✓ Search index boundary & landmark attribution verified');
  }

  // =========================================================================
  // TEST SUITE 6: UNIFIED DocumentPosition DISPATCHER
  // =========================================================================
  console.log('Test 6: Unified DocumentPosition Dispatcher');
  {
    const pdfDocId = 'pdf-benchmark-1000';

    // 1. Kind 'word'
    const resWord = await resolvePosition(pdfDocId, { kind: 'word', wordIndex: 500 });
    assert(resWord.globalWordIndex === 500, `Word kind failed: ${resWord.globalWordIndex}`);

    // 2. Kind 'pdf-page'
    const resPage = await resolvePosition(pdfDocId, { kind: 'pdf-page', pageNumber: 50 });
    assert(resPage.pageNumber === 50, `Page kind failed: ${resPage.pageNumber}`);

    // 3. Kind 'chapter'
    const resChap = await resolvePosition(pdfDocId, { kind: 'chapter', chapterId: 'chap-3' });
    assert(resChap.chapter?.title === 'Chapter 7: The Breakthrough', `Chapter kind failed: ${resChap.chapter?.title}`);

    // 4. Kind 'percent'
    const resPercent = await resolvePosition(pdfDocId, { kind: 'percent', percent: 50 });
    assert(resPercent.progressPercent >= 49 && resPercent.progressPercent <= 51, `Percent kind failed: ${resPercent.progressPercent}`);

    console.log('✓ Unified DocumentPosition dispatcher passed');
  }

  console.log('\n=============================================================');
  console.log('All Phase 3 Document Structure & Navigation Tests Passed! (6 Suites)');
  console.log('=============================================================');
}

runTests().catch((err) => {
  console.error('Phase 3 tests failed:', err);
  process.exit(1);
});
