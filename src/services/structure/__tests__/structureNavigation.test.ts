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

  // =========================================================================
  // TEST SUITE 7: EMPTY PHYSICAL PDF PAGE HANDLING & 1:1 ALIGNMENT
  // =========================================================================
  console.log('Test 7: Empty PDF Pages & 1-to-1 Page Mapping Preservation');
  {
    // 8 physical pages where pages 2, 4, 7 are blank/cover/separator pages
    const pageTexts = [
      'Page one has thirty words describing the book introduction and concepts.', // Page 1: 10 words
      '', // Page 2: empty blank page
      'Page three has another ten words detailing the first theorem.', // Page 3: 10 words
      '   ', // Page 4: whitespace only
      'Page five has ten words discussing practical applications in daily life.', // Page 5: 10 words
      'Page six has ten words examining edge cases in detail.', // Page 6: 10 words
      '', // Page 7: empty
      'Page eight has ten words concluding the study with recommendations.', // Page 8: 10 words
    ];

    const emptyDocId = 'pdf-empty-pages-test';
    const { structure, pages, fullText } = buildPdfStructure(emptyDocId, pageTexts);

    // 1-to-1 physical mapping
    assert(pages.length === 8, `Expected 8 physical pages preserved, got ${pages.length}`);
    assert(structure.pages?.length === 8, `Structure pages length must be 8, got ${structure.pages?.length}`);

    // Verify hasText flags
    assert(pages[0].hasText === true && pages[0].wordCount > 0, 'Page 1 must have text');
    assert(pages[1].hasText === false && pages[1].wordCount === 0, 'Page 2 must be marked hasText: false');
    assert(pages[2].hasText === true && pages[2].wordCount > 0, 'Page 3 must have text');
    assert(pages[3].hasText === false && pages[3].wordCount === 0, 'Page 4 must be marked hasText: false');
    assert(pages[6].hasText === false && pages[6].wordCount === 0, 'Page 7 must be marked hasText: false');
    assert(pages[7].hasText === true && pages[7].wordCount > 0, 'Page 8 must have text');

    // Verify word index alignment: Page 3 must start immediately where Page 1 ended
    assert(
      pages[2].startWordIndex === pages[0].endWordIndex + 1,
      `Page 3 startWordIndex (${pages[2].startWordIndex}) must connect to Page 1 endWordIndex (${pages[0].endWordIndex})`
    );

    // Persist and test resolution
    await documentStorageService.createAndSaveDocument({
      id: emptyDocId,
      title: 'PDF With Empty Physical Pages',
      text: fullText,
      sourceType: 'pdf',
      structure,
      pages,
    });

    // Resolve Page 2 (empty page) -> should gracefully map to page 2 entry
    const resEmptyPage = await resolvePage(emptyDocId, 2);
    assert(resEmptyPage.pageNumber === 2, `Expected resolved pageNumber 2, got ${resEmptyPage.pageNumber}`);

    // Resolve Page 3
    const resP3 = await resolvePage(emptyDocId, 3);
    assert(resP3.pageNumber === 3, `Expected resolved pageNumber 3, got ${resP3.pageNumber}`);
    assert(resP3.globalWordIndex === pages[2].startWordIndex, 'Page 3 resolved to exact startWordIndex');

    // Resolve Page 8
    const resP8 = await resolvePage(emptyDocId, 8);
    assert(resP8.pageNumber === 8, `Expected resolved pageNumber 8, got ${resP8.pageNumber}`);

    console.log('✓ Empty physical PDF page preservation & alignment passed');
  }

  // =========================================================================
  // TEST SUITE 8: NESTED PDF OUTLINE HIERARCHY
  // =========================================================================
  console.log('Test 8: Nested PDF Outline Hierarchy (Part -> Chapter -> Section)');
  {
    const pageTexts = [
      'Part I opening text and overview of the entire series.', // Page 1
      'Chapter 1 detailed description of fundamentals and history.', // Page 2
      'Section 1.1 formal mathematical definitions and lemmas.', // Page 3
      'Chapter 2 architecture and engineering implementations.', // Page 4
      'Section 2.1 data flow and caching structures.', // Page 5
      'Part II advanced topics and future paradigms.', // Page 6
    ];

    const nestedOutlines: PdfOutlineItem[] = [
      {
        title: 'Part I: Core Foundations',
        pageNumber: 1,
        level: 1,
        children: [
          {
            title: 'Chapter 1: Theory',
            pageNumber: 2,
            level: 2,
            children: [
              {
                title: 'Section 1.1: Formal Proofs',
                pageNumber: 3,
                level: 3,
              },
            ],
          },
          {
            title: 'Chapter 2: Implementation',
            pageNumber: 4,
            level: 2,
            children: [
              {
                title: 'Section 2.1: Data Structures',
                pageNumber: 5,
                level: 3,
              },
            ],
          },
        ],
      },
      {
        title: 'Part II: Advanced Paradigms',
        pageNumber: 6,
        level: 1,
      },
    ];

    const nestedDocId = 'pdf-nested-outlines-test';
    const { structure, pages, fullText } = buildPdfStructure(nestedDocId, pageTexts, nestedOutlines);

    assert(structure.chapters.length === 2, `Expected 2 top-level chapters (Parts), got ${structure.chapters.length}`);
    const part1 = structure.chapters[0];
    assert(part1.title === 'Part I: Core Foundations', `Expected Part I title, got ${part1.title}`);
    assert(part1.children?.length === 2, `Part I must have 2 Chapter children, got ${part1.children?.length}`);

    const chap1 = part1.children![0];
    assert(chap1.title === 'Chapter 1: Theory', `Expected Chapter 1 title, got ${chap1.title}`);
    assert(chap1.level === 2, `Chapter 1 level must be 2, got ${chap1.level}`);
    assert(chap1.parentId === part1.id, `Chapter 1 parentId must link to Part I, got ${chap1.parentId}`);
    assert(chap1.children?.length === 1, `Chapter 1 must have 1 Section child, got ${chap1.children?.length}`);

    const sec11 = chap1.children![0];
    assert(sec11.title === 'Section 1.1: Formal Proofs', `Expected Section 1.1 title, got ${sec11.title}`);
    assert(sec11.level === 3, `Section 1.1 level must be 3, got ${sec11.level}`);
    assert(sec11.parentId === chap1.id, `Section 1.1 parentId must link to Chapter 1, got ${sec11.parentId}`);

    // All sections flattened in structure.sections
    assert(structure.sections.length === 6, `Expected 6 total outline nodes flattened, got ${structure.sections.length}`);

    await documentStorageService.createAndSaveDocument({
      id: nestedDocId,
      title: 'Nested Outline PDF Document',
      text: fullText,
      sourceType: 'pdf',
      structure,
      pages,
    });

    // Resolve Section 1.1
    const resSec11 = await resolveSection(nestedDocId, sec11.id);
    assert(resSec11.section?.title === sec11.title, `Resolved section title mismatch: ${resSec11.section?.title}`);
    assert(resSec11.chapter?.title === part1.title, `Enclosing top chapter must be Part I: ${resSec11.chapter?.title}`);
    assert(resSec11.pageNumber === 3, `Section 1.1 must resolve to page 3, got ${resSec11.pageNumber}`);

    console.log('✓ Nested PDF outline hierarchy (Part -> Chapter -> Section) verified');
  }

  // =========================================================================
  // TEST SUITE 9: O(log N) RESOLUTION BENCHMARK & LOCATION INDEX PERSISTENCE
  // =========================================================================
  console.log('Test 9: Location Index Persistence & O(log N) Resolution Benchmark');
  {
    const benchDocId = 'pdf-benchmark-1000'; // 1,000 pages, 200,000 words
    const locationIndex = await documentStorageService.getLocationIndex(benchDocId);
    assert(locationIndex !== null, 'DocumentLocationIndex must be persisted and retrieved');
    assert(locationIndex.totalWords >= 199000, `Location index total words must be ~200,000, got ${locationIndex.totalWords}`);
    assert(locationIndex.chunkRanges.length > 0, 'Location index must contain chunk ranges');

    const handle = new DocumentHandle(benchDocId);
    
    // Warm handle caches
    await handle.getMetadata();
    await handle.getStructure();
    await handle.getLocationIndex();

    // Benchmark 200 random location lookups
    const lookupCount = 200;
    const startBench = performance.now();
    for (let i = 0; i < lookupCount; i++) {
      const targetWord = Math.floor(Math.random() * locationIndex.totalWords);
      const pos = await handle.resolveWordIndex(targetWord);
      assert(pos.globalWordIndex === targetWord, `Resolved word index mismatch: ${pos.globalWordIndex} vs ${targetWord}`);
      assert(pos.chunkIndex >= 0, `Invalid chunkIndex: ${pos.chunkIndex}`);
    }
    const elapsed = performance.now() - startBench;
    const avgMs = elapsed / lookupCount;

    assert(avgMs < 0.5, `Average resolveWordIndex must be < 0.5ms (O(log N)), was ${avgMs.toFixed(3)}ms`);
    console.log(`✓ 200 O(log N) binary searches completed in ${elapsed.toFixed(2)}ms (${avgMs.toFixed(3)}ms/lookup)`);
  }

  console.log('\n=============================================================');
  console.log('All Phase 3 Document Structure & Navigation Tests Passed! (9 Suites)');
  console.log('=============================================================');
}

runTests().catch((err) => {
  console.error('Phase 3 tests failed:', err);
  process.exit(1);
});
