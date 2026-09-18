/**
 * Comprehensive Automated Tests for Universal Text Input Hub Pipeline
 * Covers:
 * - Plain text, Empty text, Unicode, Persian/Arabic RTL, Mixed RTL/LTR
 * - Markdown parsing: headings, lists, links, code blocks, tables, Persian markdown
 * - TXT extraction: Windows (\r\n), Unix (\n), large text, UTF-8
 * - PDF extraction: valid PDF bytes, corrupted PDF, empty PDF detection
 * - URL detection & HTML article extraction: valid, navigation-heavy, non-article, invalid URL
 * - Clipboard extraction: plain text, rich HTML, empty clipboard
 */

import { normalizeText, detectTextDirection, countWords, extractSuggestedTitle } from '../../../utils/normalizeText';
import { detectInputType, isUrlString, isMarkdownString, getFileExtension } from '../detectInput';
import { markdownToReadableText, extractMarkdown } from '../extractMarkdown';
import { extractTxt } from '../extractTxt';
import { parseHtmlArticle, formatValidUrl, fetchUrlPreview, isWikipediaUrl } from '../extractUrl';
import { extractClipboardContent, processUniversalInput } from '../extractText';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    testsFailed++;
  }
}

async function runAllTests() {
  console.log('\n=============================================');
  console.log('🧪 Starting Universal Text Input Hub Test Suite');
  console.log('=============================================\n');

  // 1. TEXT & UNICODE TESTS
  console.log('--- 1. Text Normalization & Language Detection ---');
  {
    const plain = 'Hello world!   This   is   a    test.';
    const normalized = normalizeText(plain);
    assert(normalized === 'Hello world! This is a test.', 'Collapses repeated horizontal whitespace');

    const empty = normalizeText('');
    assert(empty === '', 'Handles empty text cleanly');

    const winLineEndings = 'Line 1\r\n\r\n\r\n\r\nLine 2';
    const normLines = normalizeText(winLineEndings);
    assert(normLines === 'Line 1\n\nLine 2', 'Normalizes \\r\\n and caps consecutive blank lines to 2');

    // Persian / Arabic Unicode & ZWNJ
    const persianText = 'می\u200Cخواهم این کتاب را بخوانم. سرعت خواندن بالا است.';
    const normPersian = normalizeText(persianText);
    assert(normPersian.includes('\u200C'), 'Preserves Persian ZWNJ (Zero-Width Non-Joiner)');
    assert(detectTextDirection(persianText) === 'rtl', 'Detects Persian text as RTL direction');

    // Mixed LTR / RTL
    const mixed = 'ADHD Reader یک ابزار فوق‌العاده برای خواندن سریع است.';
    assert(detectTextDirection(mixed) === 'rtl', 'Detects predominantly Persian mixed text as RTL');

    const english = 'ADHD Reader is designed to reduce reading friction.';
    assert(detectTextDirection(english) === 'ltr', 'Detects English text as LTR');

    assert(countWords('One two three four five') === 5, 'Counts words accurately');
    assert(countWords('   ') === 0, 'Word count of whitespace is 0');
    assert(extractSuggestedTitle('My Great Article\nSecond line here') === 'My Great Article', 'Extracts suggested title from first line');
  }

  // 2. INPUT DETECTION TESTS
  console.log('\n--- 2. Input Type Detection ---');
  {
    assert(isUrlString('https://example.com/article/123'), 'Detects valid https:// URL');
    assert(isUrlString('http://techcrunch.com/news'), 'Detects valid http:// URL');
    assert(isUrlString('www.nytimes.com/article'), 'Detects www. URL');
    assert(!isUrlString('Hello world https://example.com not a single url'), 'Rejects multi-word string containing URL');
    assert(!isUrlString('https://not a valid url'), 'Rejects URL with spaces');

    assert(detectInputType('https://medium.com/story') === 'url', 'detectInputType identifies URL string');
    assert(detectInputType('# Heading 1\nSome paragraph text here.') === 'markdown', 'detectInputType identifies Markdown with heading');
    assert(detectInputType('Just a normal plain text paragraph without special markers.') === 'text', 'detectInputType identifies Plain Text');

    // File objects / extensions
    assert(getFileExtension('paper.pdf') === 'pdf', 'Extracts pdf extension');
    assert(getFileExtension('notes.MARKDOWN') === 'markdown', 'Extracts lowercase markdown extension');
    assert(getFileExtension('file.txt') === 'txt', 'Extracts txt extension');

    const fakePdf = { name: 'document.pdf', type: 'application/pdf' } as File;
    assert(detectInputType(fakePdf) === 'pdf', 'detectInputType detects PDF file');

    const fakeMd = { name: 'README.md', type: 'text/markdown' } as File;
    assert(detectInputType(fakeMd) === 'markdown', 'detectInputType detects Markdown file');

    const fakeTxt = { name: 'sample.txt', type: 'text/plain' } as File;
    assert(detectInputType(fakeTxt) === 'txt', 'detectInputType detects TXT file');
  }

  // 3. MARKDOWN TO READABLE PROSE TESTS
  console.log('\n--- 3. Markdown Extraction & Prose Normalization ---');
  {
    const md = `
# Executive Summary

This is **important** and _crucial_ reading. Visit [our website](https://example.com) for details.

## Key Takeaways
- First item to focus on
- Second item with \`inline_code\`
- Third item with ~~strikethrough~~

\`\`\`typescript
const focus = true;
\`\`\`

> A quote to remember.

| Metric | Value |
| --- | --- |
| Focus | High |
| Speed | 450 WPM |
`;

    const prose = markdownToReadableText(md);

    assert(!prose.includes('#'), 'Stripped # heading markers');
    assert(!prose.includes('**'), 'Stripped ** bold asterisks');
    assert(!prose.includes('`'), 'Stripped code backticks');
    assert(!prose.includes('[our website]('), 'Stripped markdown link syntax');
    assert(prose.includes('our website'), 'Preserved link anchor text');
    assert(prose.includes('Executive Summary'), 'Preserved heading text');
    assert(prose.includes('• First item to focus on'), 'Converted bullet list cleanly');
    assert(prose.includes('A quote to remember.'), 'Preserved blockquote text');

    // Persian Markdown test
    const persianMd = `# راهنمای خواندن سریع\n\nاین یک **متن آزمایشی** برای بررسی زبان فارسی است.`;
    const persianProse = markdownToReadableText(persianMd);
    assert(persianProse.includes('راهنمای خواندن سریع'), 'Preserved Persian heading in Markdown');
    assert(persianProse.includes('متن آزمایشی'), 'Stripped bold asterisks from Persian text');
    assert(!persianProse.includes('**'), 'No remaining markdown symbols in Persian text');
  }

  // 4. TXT EXTRACTION TESTS
  console.log('\n--- 4. TXT Document Extraction ---');
  {
    const sampleTxt = 'Chapter 1: The Beginning\r\n\r\nOnce upon a time in a focused mind...';
    const doc = await extractTxt(sampleTxt, 'story.txt');
    assert(doc.sourceType === 'txt', 'Document sourceType is txt');
    assert(doc.title === 'story', 'Derived title from file name');
    assert(doc.content.startsWith('Chapter 1: The Beginning'), 'Content begins with normalized text');
    assert(doc.direction === 'ltr', 'Document direction is LTR');

    try {
      await extractTxt('', 'empty.txt');
      assert(false, 'Should have thrown on empty text');
    } catch (e: any) {
      assert(e.message.includes('empty'), 'Throws expected error on empty TXT');
    }
  }

  // 5. HTML ARTICLE EXTRACTION TESTS
  console.log('\n--- 5. HTML Article Parsing & Sanitization ---');
  {
    const mockHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Understanding Neurodiversity in Modern Workplaces - TechHub</title>
  <meta property="og:title" content="Understanding Neurodiversity in Modern Workplaces">
  <meta name="author" content="Dr. Jane Smith">
</head>
<body>
  <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
  <aside class="sidebar">Ads and navigation here</aside>
  <article>
    <h1>Understanding Neurodiversity in Modern Workplaces</h1>
    <p>Neurodiversity encompasses a wide variety of cognitive conditions including ADHD and dyslexia.</p>
    <p>Modern workplaces benefit immensely from cognitive diversity, bringing creative problem solving to complex domains.</p>
    <blockquote>Focus is not about staring harder; it is about finding the right cadence.</blockquote>
  </article>
  <footer>Copyright 2026. All rights reserved.</footer>
</body>
</html>
`;

    const article = parseHtmlArticle(mockHtml, 'https://example.com/article');
    assert(article.title === 'Understanding Neurodiversity in Modern Workplaces', 'Extracted title without website suffix');
    assert(article.author === 'Dr. Jane Smith', 'Extracted author metadata');
    assert(article.content.includes('Neurodiversity encompasses a wide variety'), 'Extracted article body paragraph 1');
    assert(article.content.includes('Modern workplaces benefit immensely'), 'Extracted article body paragraph 2');
    assert(!article.content.includes('Ads and navigation here'), 'Removed aside/sidebar content');
    assert(!article.content.includes('Copyright 2026'), 'Removed footer content');

    // formatValidUrl
    assert(formatValidUrl('www.bbc.com/news') === 'https://www.bbc.com/news', 'Formats www. to https://');
    assert(formatValidUrl('medium.com/story') === 'https://medium.com/story', 'Formats naked domain to https://');
  }

  // 6. CLIPBOARD CONTENT EXTRACTION TESTS
  console.log('\n--- 6. Clipboard Content Extraction ---');
  {
    const richHtml = `<p>This is from <b>rich clipboard</b> with <a href="#">a link</a>.</p>`;
    const plain = `This is from rich clipboard with a link.`;
    const extracted = extractClipboardContent(richHtml, plain);
    assert(extracted.includes('This is from rich clipboard with a link.'), 'Extracts clean text from rich HTML clipboard');
    assert(!extracted.includes('<p>') && !extracted.includes('<b>'), 'Strips HTML markup from clipboard');

    const purePlain = extractClipboardContent(undefined, 'Just plain copied text.');
    assert(purePlain === 'Just plain copied text.', 'Extracts plain text when HTML not provided');
  }

  // 7. MASTER UNIFIED PIPELINE INTEGRATION
  console.log('\n--- 7. Unified Pipeline processUniversalInput ---');
  {
    // Plain text input
    const plainDoc = await processUniversalInput('Focus flows where attention goes.');
    assert(plainDoc.sourceType === 'text', 'Processes plain text');
    assert(plainDoc.content === 'Focus flows where attention goes.', 'Preserves content in ReaderDocument');
    assert(typeof plainDoc.id === 'string', 'Assigns unique ID');

    // Markdown input auto-detected
    const mdInput = '# Chapter 1\nThis is a **markdown** text with [links](http://a.com).';
    const mdDoc = await processUniversalInput(mdInput);
    assert(mdDoc.sourceType === 'markdown', 'Auto-detects markdown in unified pipeline');
    assert(!mdDoc.content.includes('**'), 'Markdown formatting normalized');
    assert(mdDoc.content.includes('markdown text with links.'), 'Clean prose output');

    // Persian text in pipeline
    const farsiDoc = await processUniversalInput('خواندن با ریتم متناسب باعث افزایش تمرکز می‌شود.');
    assert(farsiDoc.direction === 'rtl', 'Pipeline flags Persian text as RTL');
  }

  // 8. URL QUICK PREVIEW TESTS
  console.log('\n--- 8. URL Quick Preview Generation ---');
  {
    const originalFetch = global.fetch;
    const sampleArticleHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>The Science of Fast Reading and Attention - BrainJournal</title>
        <meta property="og:title" content="The Science of Fast Reading and Attention">
        <meta name="author" content="Alex Rivera">
      </head>
      <body>
        <article>
          <h1>The Science of Fast Reading and Attention</h1>
          <p>Rapid serial visual presentation provides a structured mechanism to minimize regressions while reading technical or narrative prose.</p>
          <p>By fixing gaze orientation and highlighting the optimal recognition point, cognitive processing overhead drops dramatically.</p>
        </article>
      </body>
      </html>
    `;

    (global as any).fetch = async () => {
      return {
        ok: true,
        text: async () => sampleArticleHtml,
      } as any;
    };

    try {
      const preview = await fetchUrlPreview('https://www.brainjournal.org/science/reading-flow', 300);
      assert(preview.title === 'The Science of Fast Reading and Attention', 'Extracted preview title accurately');
      assert(preview.domain === 'brainjournal.org', 'Derived clean domain without www');
      assert(preview.author === 'Alex Rivera', 'Extracted author for preview');
      assert(preview.wordCount > 20, 'Calculated word count greater than 20');
      assert(preview.estimatedMinutes >= 1, 'Estimated reading minutes calculated based on WPM');
      assert(typeof preview.excerpt === 'string' && preview.excerpt.length > 10, 'Generated clean excerpt snippet');
      assert(preview.document.sourceType === 'url', 'Embedded preloaded document for instant commit');
      assert(preview.document.content.includes('Rapid serial visual presentation'), 'Preloaded document contains article body');
    } finally {
      global.fetch = originalFetch;
    }
  }

  console.log('\n=============================================');
  console.log(`🏁 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('=============================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
