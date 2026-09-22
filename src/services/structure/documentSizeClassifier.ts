/**
 * Phase 6 Large Document Detection & Size Classifier
 * 
 * Provides derived document size classification (Normal, Large, Very Large)
 * based on word count, page count, and character count with configurable thresholds.
 * Also provides source-aware location and metadata formatting.
 */

import { InputSourceType, ResolvedDocumentPosition, DocumentStructure } from '../../types';

export type DocumentSizeCategory = 'normal' | 'large' | 'very-large';

export interface DocumentSizeThresholds {
  largeWords: number; // Default 10,000
  veryLargeWords: number; // Default 100,000
  largePages: number; // Default 50
  veryLargePages: number; // Default 500
  largeChars: number; // Default 50,000
  veryLargeChars: number; // Default 500,000
}

export const DEFAULT_SIZE_THRESHOLDS: DocumentSizeThresholds = {
  largeWords: 10000,
  veryLargeWords: 100000,
  largePages: 50,
  veryLargePages: 500,
  largeChars: 50000,
  veryLargeChars: 500000,
};

export interface DocumentMetrics {
  totalWords?: number;
  wordCount?: number;
  pageCount?: number;
  totalCharacters?: number;
  sourceType?: InputSourceType;
  chapterCount?: number;
}

export interface DocumentSizeClassification {
  category: DocumentSizeCategory;
  isLargeOrAbove: boolean;
  label: string;
  badgeColor: string;
  reason: string;
}

/**
 * Classifies document scale dynamically based on words, pages, and character count.
 */
export function classifyDocumentSize(
  metrics: DocumentMetrics,
  thresholds: Partial<DocumentSizeThresholds> = {}
): DocumentSizeClassification {
  const config = { ...DEFAULT_SIZE_THRESHOLDS, ...thresholds };
  const words = Math.max(0, metrics.totalWords ?? metrics.wordCount ?? 0);
  const pages = Math.max(0, metrics.pageCount ?? 0);
  const chars = Math.max(0, metrics.totalCharacters ?? 0);

  // 1. Very Large check
  if (words >= config.veryLargeWords || pages >= config.veryLargePages || chars >= config.veryLargeChars) {
    let reason = `${words.toLocaleString()} words`;
    if (pages >= config.veryLargePages) reason = `${pages.toLocaleString()} pages`;
    else if (words >= config.veryLargeWords) reason = `${words.toLocaleString()} words`;
    else if (chars >= config.veryLargeChars) reason = `${chars.toLocaleString()} characters`;

    return {
      category: 'very-large',
      isLargeOrAbove: true,
      label: 'Very Large Document',
      badgeColor: 'text-rose-400 bg-rose-950/60 border-rose-800/80',
      reason,
    };
  }

  // 2. Large check
  if (words >= config.largeWords || pages >= config.largePages || chars >= config.largeChars) {
    let reason = `${words.toLocaleString()} words`;
    if (pages >= config.largePages) reason = `${pages.toLocaleString()} pages`;
    else if (words >= config.largeWords) reason = `${words.toLocaleString()} words`;
    else if (chars >= config.largeChars) reason = `${chars.toLocaleString()} characters`;

    return {
      category: 'large',
      isLargeOrAbove: true,
      label: 'Large Document',
      badgeColor: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
      reason,
    };
  }

  // 3. Normal check
  return {
    category: 'normal',
    isLargeOrAbove: false,
    label: 'Standard Reading',
    badgeColor: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80',
    reason: `${words.toLocaleString()} words`,
  };
}

/**
 * Formats source-aware document summary metadata.
 * e.g. "1,024 pages · 184,000 words" for PDF
 * e.g. "18,400 words · 14 chapters" for Markdown
 * e.g. "12,500 words · ~63% through document" for TXT
 */
export function formatSourceAwareSummary(params: {
  sourceType?: InputSourceType;
  wordCount: number;
  pageCount?: number;
  chapterCount?: number;
}): string {
  const { sourceType, wordCount, pageCount, chapterCount } = params;
  const wordStr = `${wordCount.toLocaleString()} words`;

  if (sourceType === 'pdf' && pageCount && pageCount > 0) {
    return `${pageCount.toLocaleString()} pages · ${wordStr}`;
  }

  if (sourceType === 'markdown' && chapterCount && chapterCount > 0) {
    return `${wordStr} · ${chapterCount} sections`;
  }

  if (chapterCount && chapterCount > 0) {
    return `${wordStr} · ${chapterCount} chapters`;
  }

  return wordStr;
}

/**
 * Formats source-aware reading location for Resume banner and navigation badges.
 * PART C:
 * - PDF: "Page X / Y" or "Chapter 7 · Page 287"
 * - Markdown: "Chapter X / Section Y", not fake pages
 * - TXT: "Section 4 · ~63% through document", no fake pages
 */
export function formatSourceAwarePosition(params: {
  sourceType?: InputSourceType;
  resolved?: ResolvedDocumentPosition | null;
  totalWords: number;
  pageCount?: number;
  structure?: DocumentStructure | null;
}): string {
  const { sourceType, resolved, totalWords, pageCount, structure } = params;

  if (!resolved) {
    return 'Beginning of document';
  }

  const globalWord = resolved.globalWordIndex;
  const percent = totalWords > 0 ? Math.min(100, Math.round(((globalWord + 1) / totalWords) * 100)) : 0;
  const chapterTitle = resolved.chapter?.title;
  const sectionTitle = resolved.section?.title;

  // 1. PDF Documents: Physical Page is primary
  if (sourceType === 'pdf') {
    const pageNum = resolved.pageNumber;
    const totalPages = pageCount ?? structure?.pages?.length;
    const pagePart = pageNum ? (totalPages ? `Page ${pageNum} / ${totalPages}` : `Page ${pageNum}`) : `Page 1`;

    if (chapterTitle) {
      return `${chapterTitle} · ${pagePart}`;
    }
    return pagePart;
  }

  // 2. Markdown Documents: Hierarchical Headings
  if (sourceType === 'markdown') {
    if (chapterTitle && sectionTitle && chapterTitle !== sectionTitle) {
      return `${chapterTitle} › ${sectionTitle} · ~${percent}%`;
    }
    if (chapterTitle) {
      return `${chapterTitle} · ~${percent}%`;
    }
    return `~${percent}% through document`;
  }

  // 3. Plain TXT Documents: Logical Sections / Percentage (No fake pages)
  if (sourceType === 'txt' || sourceType === 'text') {
    if (resolved.section?.title) {
      return `${resolved.section.title} · ~${percent}% through document`;
    }
    if (resolved.paragraphIndex !== undefined) {
      return `Section ${resolved.paragraphIndex + 1} · ~${percent}% through document`;
    }
    return `~${percent}% through document`;
  }

  // Fallback
  if (chapterTitle) {
    return `${chapterTitle} · ~${percent}%`;
  }
  return `Word ${(globalWord + 1).toLocaleString()} of ${totalWords.toLocaleString()} (${percent}%)`;
}
