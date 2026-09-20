/**
 * Phase 3 Document Structure & Location Index: Structure Builder
 * 
 * Extracts and indexes structural landmarks:
 * - PDF physical page boundaries (exact word ranges, start/end indices)
 * - Markdown hierarchical headings (H1, H2, H3 preserved with parent-child links)
 * - Plain TXT logical sections (conservative, no fake pagination)
 * - URL article headings
 * - Paragraph boundaries
 */

import {
  DocumentStructure,
  StructuralNode,
  PageIndexEntry,
  ParagraphIndexEntry,
  InputSourceType,
} from '../../types';
import { countWordsFast } from '../../utils/textParser';
import { markdownToReadableText } from '../import/extractMarkdown';
import { normalizeText } from '../../utils/normalizeText';

export interface PdfOutlineItem {
  title: string;
  pageNumber: number; // 1-based page number
  level?: number;
}

/**
 * Builds a PDF DocumentStructure from per-page text extractions.
 * Crucial rule: Record exact start and end word indices for every single page.
 */
export function buildPdfStructure(
  documentId: string,
  pageTexts: string[],
  outlines?: PdfOutlineItem[]
): {
  structure: DocumentStructure;
  pages: PageIndexEntry[];
  fullText: string;
} {
  const pages: PageIndexEntry[] = [];
  let cumulativeWordIndex = 0;
  let cumulativeCharIndex = 0;
  const normalizedPageTexts: string[] = [];

  for (let i = 0; i < pageTexts.length; i++) {
    const pageNum = i + 1; // 1-based
    const rawText = pageTexts[i] ?? '';
    const normPageText = normalizeText(rawText);
    normalizedPageTexts.push(normPageText);

    const pageWordCount = countWordsFast(normPageText);
    const startWordIndex = cumulativeWordIndex;
    const endWordIndex = pageWordCount > 0 ? startWordIndex + pageWordCount - 1 : startWordIndex;

    const startCharIndex = cumulativeCharIndex;
    const endCharIndex = startCharIndex + normPageText.length;

    // Create a compact preview snippet (first ~80 chars)
    const preview = normPageText.slice(0, 100).replace(/\s+/g, ' ').trim();

    pages.push({
      pageNumber: pageNum,
      startWordIndex,
      endWordIndex,
      wordCount: pageWordCount,
      startCharIndex,
      endCharIndex,
      textPreview: preview || undefined,
    });

    cumulativeWordIndex += pageWordCount;
    // Account for double newline join between pages in full text
    cumulativeCharIndex = endCharIndex + 2;
  }

  const fullText = normalizedPageTexts.join('\n\n');
  const totalWords = cumulativeWordIndex;

  // Build chapters & sections from outlines or heading detection
  const { chapters, sections } = buildPdfChapters(documentId, pages, outlines, normalizedPageTexts);

  // Build paragraphs
  const paragraphs = buildParagraphIndex(fullText);

  const structure: DocumentStructure = {
    documentId,
    chapters,
    sections,
    pages,
    paragraphs,
    createdAt: Date.now(),
  };

  return { structure, pages, fullText };
}

/**
 * Helper to build chapters for PDF from bookmarks/outlines or heading detection
 */
function buildPdfChapters(
  documentId: string,
  pages: PageIndexEntry[],
  outlines?: PdfOutlineItem[],
  pageTexts?: string[]
): { chapters: StructuralNode[]; sections: StructuralNode[] } {
  const chapters: StructuralNode[] = [];
  const sections: StructuralNode[] = [];

  if (outlines && outlines.length > 0) {
    // Map outline items to page word boundaries
    for (let i = 0; i < outlines.length; i++) {
      const item = outlines[i];
      const pageNum = Math.max(1, Math.min(item.pageNumber, pages.length));
      const pageEntry = pages[pageNum - 1];

      const startWordIndex = pageEntry ? pageEntry.startWordIndex : 0;
      
      // End word index is either next outline item's start - 1, or end of document
      let endWordIndex = pages[pages.length - 1]?.endWordIndex ?? startWordIndex;
      if (i + 1 < outlines.length) {
        const nextItem = outlines[i + 1];
        const nextPageNum = Math.max(1, Math.min(nextItem.pageNumber, pages.length));
        const nextPageEntry = pages[nextPageNum - 1];
        if (nextPageEntry) {
          endWordIndex = Math.max(startWordIndex, nextPageEntry.startWordIndex - 1);
        }
      }

      const node: StructuralNode = {
        id: `chap-${i + 1}`,
        title: item.title.trim() || `Chapter ${i + 1}`,
        level: item.level || 1,
        startWordIndex,
        endWordIndex,
        pageStart: pageNum,
        pageEnd: i + 1 < outlines.length ? Math.max(pageNum, outlines[i + 1].pageNumber) : pages.length,
      };

      sections.push(node);
      if (node.level === 1) {
        chapters.push(node);
      }
    }
  } else if (pageTexts && pageTexts.length > 0) {
    // Fallback: detect chapter-like headers in page text
    const detected: Array<{ title: string; pageNum: number; wordOffsetInPage: number }> = [];
    const chapterRegex = /^(?:chapter|part|section)\s+([0-9ivxlcdm]+|[a-z]+)[:\s\.\-—]*(.*)$/im;

    for (let p = 0; p < pageTexts.length; p++) {
      const lines = pageTexts[p].split('\n');
      let wordOffset = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (chapterRegex.test(trimmed)) {
          detected.push({
            title: trimmed,
            pageNum: p + 1,
            wordOffsetInPage: wordOffset,
          });
        }
        wordOffset += countWordsFast(trimmed);
      }
    }

    for (let i = 0; i < detected.length; i++) {
      const d = detected[i];
      const pageEntry = pages[d.pageNum - 1];
      const startWordIndex = (pageEntry ? pageEntry.startWordIndex : 0) + d.wordOffsetInPage;

      let endWordIndex = pages[pages.length - 1]?.endWordIndex ?? startWordIndex;
      let pageEnd = pages.length;
      if (i + 1 < detected.length) {
        const next = detected[i + 1];
        const nextEntry = pages[next.pageNum - 1];
        const nextStart = (nextEntry ? nextEntry.startWordIndex : 0) + next.wordOffsetInPage;
        endWordIndex = Math.max(startWordIndex, nextStart - 1);
        pageEnd = next.pageNum;
      }

      const node: StructuralNode = {
        id: `chap-${i + 1}`,
        title: d.title,
        level: 1,
        startWordIndex,
        endWordIndex,
        pageStart: d.pageNum,
        pageEnd,
      };

      chapters.push(node);
      sections.push(node);
    }
  }

  return { chapters, sections };
}

/**
 * Builds a hierarchical Markdown DocumentStructure.
 * Preserves H1, H2, H3 levels and exact word indices in the normalized prose.
 */
export function buildMarkdownStructure(
  documentId: string,
  markdown: string
): {
  structure: DocumentStructure;
  normalizedText: string;
} {
  const normalizedText = markdownToReadableText(markdown);
  const chapters: StructuralNode[] = [];
  const sections: StructuralNode[] = [];

  // Parse markdown line by line to locate headings with exact prose word offsets
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  
  interface HeadingMatch {
    level: number;
    rawTitle: string;
    cleanTitle: string;
    lineIndex: number;
  }

  const headings: HeadingMatch[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  let insideCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      insideCodeFence = !insideCodeFence;
      continue;
    }
    if (insideCodeFence) continue;

    const match = headingRegex.exec(line);
    if (match) {
      const level = match[1].length;
      const rawTitle = match[2].trim();
      // Clean title from inline markdown
      const cleanTitle = rawTitle
        .replace(/[*_`~[\]]/g, '')
        .replace(/\(http[^)]+\)/g, '')
        .trim();

      if (cleanTitle) {
        headings.push({
          level,
          rawTitle,
          cleanTitle,
          lineIndex: i,
        });
      }
    }
  }

  const totalWords = countWordsFast(normalizedText);

  if (headings.length > 0) {
    // Map each heading to its exact word index in the normalized prose
    // We do this by tracking prose chunks between headings
    let currentProseWords = 0;
    let headingCursor = 0;

    // We can also build the normalized text up to each heading's line to obtain the exact word count
    const headingWordIndices: number[] = [];

    for (let h = 0; h < headings.length; h++) {
      const heading = headings[h];
      // Slice raw markdown up to the heading line and convert to readable text to get precise word count
      const markdownBefore = lines.slice(0, heading.lineIndex).join('\n');
      const proseBefore = markdownToReadableText(markdownBefore);
      const wordIdx = countWordsFast(proseBefore);
      headingWordIndices.push(wordIdx);
    }

    const nodeStack: StructuralNode[] = [];

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const startWordIndex = headingWordIndices[i];

      // End word index is either next heading of equal or higher hierarchy (level <= current),
      // or next heading, or end of document
      let endWordIndex = totalWords > 0 ? totalWords - 1 : 0;

      for (let next = i + 1; next < headings.length; next++) {
        if (headings[next].level <= h.level) {
          endWordIndex = Math.max(startWordIndex, headingWordIndices[next] - 1);
          break;
        }
      }

      const node: StructuralNode = {
        id: `sec-${i + 1}`,
        title: h.cleanTitle,
        level: h.level,
        startWordIndex,
        endWordIndex,
        children: [],
      };

      // Handle hierarchy via stack
      while (nodeStack.length > 0 && nodeStack[nodeStack.length - 1].level >= h.level) {
        nodeStack.pop();
      }

      if (nodeStack.length > 0) {
        const parent = nodeStack[nodeStack.length - 1];
        node.parentId = parent.id;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        // Top-level heading
        chapters.push(node);
      }

      nodeStack.push(node);
      sections.push(node);
    }
  }

  const paragraphs = buildParagraphIndex(normalizedText);

  const structure: DocumentStructure = {
    documentId,
    chapters,
    sections,
    pages: undefined, // NO fake pages for markdown
    paragraphs,
    createdAt: Date.now(),
  };

  return { structure, normalizedText };
}

/**
 * Builds a conservative plain TXT DocumentStructure.
 * Rule: Do not invent chapters aggressively. Only use reliable section markers.
 * Rule: Absolutely NO fake pages.
 */
export function buildTxtStructure(
  documentId: string,
  text: string
): DocumentStructure {
  const normText = normalizeText(text);
  const totalWords = countWordsFast(normText);
  const chapters: StructuralNode[] = [];
  const sections: StructuralNode[] = [];

  // Look for unambiguous chapter markers
  // e.g. "Chapter 1", "CHAPTER II", "Section 3", or "=== Title ==="
  const lines = normText.split('\n');
  const chapterRegex = /^(?:chapter|part|section|book)\s+([0-9ivxlcdm]+|[a-z]+)[:\s\.\-—]*(.*)$/i;
  const dividerRegex = /^={3,}\s*(.+?)\s*={3,}$/;

  interface TxtHeading {
    title: string;
    lineIdx: number;
    wordIndex: number;
  }

  const matches: TxtHeading[] = [];
  let runningWords = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length > 0) {
      if (chapterRegex.test(line) || dividerRegex.test(line)) {
        matches.push({
          title: line.replace(/^={3,}\s*|\s*={3,}$/g, '').trim(),
          lineIdx: i,
          wordIndex: runningWords,
        });
      }
      runningWords += countWordsFast(line);
    }
  }

  // Only create chapters if there are at least 2 distinct chapter markers,
  // or at least 1 explicit "Chapter 1" / "Chapter I"
  const isReliable =
    matches.length >= 2 ||
    (matches.length === 1 && /chapter\s+(?:1|i)\b/i.test(matches[0].title));

  if (isReliable) {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const startWordIndex = m.wordIndex;
      const endWordIndex =
        i + 1 < matches.length
          ? Math.max(startWordIndex, matches[i + 1].wordIndex - 1)
          : Math.max(startWordIndex, totalWords - 1);

      const node: StructuralNode = {
        id: `chap-${i + 1}`,
        title: m.title,
        level: 1,
        startWordIndex,
        endWordIndex,
      };

      chapters.push(node);
      sections.push(node);
    }
  }

  const paragraphs = buildParagraphIndex(normText);

  return {
    documentId,
    chapters,
    sections,
    pages: undefined, // Explicitly undefined for plain text
    paragraphs,
    createdAt: Date.now(),
  };
}

/**
 * Builds a URL article DocumentStructure.
 * Uses extracted headings if available, otherwise treats as single document.
 * Never creates fake pages.
 */
export function buildUrlStructure(
  documentId: string,
  text: string,
  headings?: string[]
): DocumentStructure {
  const normText = normalizeText(text);
  const totalWords = countWordsFast(normText);
  const chapters: StructuralNode[] = [];
  const sections: StructuralNode[] = [];

  if (headings && headings.length > 0) {
    let searchStartWord = 0;
    for (let i = 0; i < headings.length; i++) {
      const hTitle = headings[i].trim();
      if (!hTitle) continue;

      // Find approximate word position of heading in text
      const hWords = countWordsFast(hTitle);
      const textIndex = normText.indexOf(hTitle);
      let startWord = searchStartWord;

      if (textIndex !== -1) {
        const beforeText = normText.slice(0, textIndex);
        startWord = countWordsFast(beforeText);
        searchStartWord = startWord + hWords;
      }

      const node: StructuralNode = {
        id: `sec-${i + 1}`,
        title: hTitle,
        level: 2,
        startWordIndex: startWord,
        endWordIndex: totalWords - 1, // updated in post-processing
      };
      sections.push(node);
      chapters.push(node);
    }

    // Fix end word indices
    for (let i = 0; i < sections.length; i++) {
      if (i + 1 < sections.length) {
        sections[i].endWordIndex = Math.max(
          sections[i].startWordIndex,
          sections[i + 1].startWordIndex - 1
        );
      }
    }
  }

  const paragraphs = buildParagraphIndex(normText);

  return {
    documentId,
    chapters,
    sections,
    pages: undefined, // Explicitly undefined
    paragraphs,
    createdAt: Date.now(),
  };
}

/**
 * Universal structure builder routing to appropriate source handler.
 */
export function buildDocumentStructure(
  documentId: string,
  sourceType: InputSourceType,
  text: string,
  options?: {
    pageTexts?: string[];
    outlines?: PdfOutlineItem[];
    headings?: string[];
    markdown?: string;
  }
): DocumentStructure {
  switch (sourceType) {
    case 'pdf':
      if (options?.pageTexts && options.pageTexts.length > 0) {
        return buildPdfStructure(documentId, options.pageTexts, options.outlines).structure;
      }
      return buildTxtStructure(documentId, text);

    case 'markdown':
      return buildMarkdownStructure(documentId, options?.markdown || text).structure;

    case 'url':
      return buildUrlStructure(documentId, text, options?.headings);

    case 'txt':
    case 'text':
    default:
      return buildTxtStructure(documentId, text);
  }
}

/**
 * Builds paragraph index for fine-grained paragraph navigation.
 */
export function buildParagraphIndex(text: string): ParagraphIndexEntry[] {
  if (!text) return [];

  const rawParagraphs = text.split(/\n\s*\n/);
  const entries: ParagraphIndexEntry[] = [];
  let cumulativeWords = 0;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const p = rawParagraphs[i].trim();
    if (!p) continue;

    const words = countWordsFast(p);
    const startWordIndex = cumulativeWords;
    const endWordIndex = words > 0 ? startWordIndex + words - 1 : startWordIndex;

    entries.push({
      paragraphIndex: entries.length,
      startWordIndex,
      endWordIndex,
      wordCount: words,
      preview: p.slice(0, 100).replace(/\s+/g, ' ').trim(),
    });

    cumulativeWords += words;
  }

  return entries;
}
