/**
 * Phase 3 Document Structure & Location Index: Location Resolver
 * 
 * Resolves source-aware locations (chapter, section, PDF page, paragraph, percentage, word)
 * into one canonical reading position (globalWordIndex + chunkIndex + wordIndexInChunk).
 * 
 * Works without tokenizing or rendering words for massive documents (e.g. 1,000+ page PDFs).
 */

import {
  DocumentPosition,
  ResolvedDocumentPosition,
  DocumentStructure,
  StructuralNode,
  PageIndexEntry,
  ParagraphIndexEntry,
  DocumentChunk,
  DocumentLocationIndex,
  DocumentMetadata,
  LocationChunkRange,
} from '../../types';
import { documentStorageService } from '../document/documentStorageService';
import { findChunkIndexForWord } from '../document/chunking';

export interface ResolverContext {
  meta?: DocumentMetadata | null;
  structure?: DocumentStructure | null;
  locationIndex?: DocumentLocationIndex | null;
}

/**
 * Binary search to find the page containing a given global word index.
 */
export function findPageForWordIndex(
  pages: PageIndexEntry[],
  wordIndex: number
): PageIndexEntry | null {
  if (!pages || pages.length === 0) return null;

  let low = 0;
  let high = pages.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const page = pages[mid];

    // If page is empty, route search according to boundary
    if (page.hasText === false || page.wordCount === 0) {
      if (wordIndex < page.startWordIndex) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
      continue;
    }

    if (wordIndex < page.startWordIndex) {
      high = mid - 1;
    } else if (wordIndex > page.endWordIndex) {
      low = mid + 1;
    } else {
      return page;
    }
  }

  // Fallback if at boundary
  if (high >= 0 && high < pages.length) return pages[high];
  if (low >= 0 && low < pages.length) return pages[low];
  return null;
}

/**
 * Finds the chapter and section enclosing a given global word index.
 */
export function findStructuralNodesForWord(
  structure: DocumentStructure,
  wordIndex: number
): { chapter?: StructuralNode; section?: StructuralNode } {
  let matchedChapter: StructuralNode | undefined;
  let matchedSection: StructuralNode | undefined;

  // Check top-level chapters
  for (const chap of structure.chapters) {
    if (wordIndex >= chap.startWordIndex && wordIndex <= chap.endWordIndex) {
      matchedChapter = chap;
      break;
    }
  }

  // Check all sections (flattened) for most specific match
  let deepestLevel = -1;
  for (const sec of structure.sections) {
    if (wordIndex >= sec.startWordIndex && wordIndex <= sec.endWordIndex) {
      if (sec.level > deepestLevel) {
        deepestLevel = sec.level;
        matchedSection = sec;
      }
    }
  }

  return { chapter: matchedChapter, section: matchedSection };
}

/**
 * Finds the paragraph enclosing a given global word index.
 */
export function findParagraphForWord(
  paragraphs: ParagraphIndexEntry[] | undefined,
  wordIndex: number
): ParagraphIndexEntry | null {
  if (!paragraphs || paragraphs.length === 0) return null;

  let low = 0;
  let high = paragraphs.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const p = paragraphs[mid];

    if (wordIndex < p.startWordIndex) {
      high = mid - 1;
    } else if (wordIndex > p.endWordIndex) {
      low = mid + 1;
    } else {
      return p;
    }
  }

  return null;
}

/**
 * Helper to build the final canonical ResolvedDocumentPosition in O(log N)
 * using lightweight chunk range indexing without loading full chunk bodies.
 */
function buildResolvedPosition(params: {
  documentId: string;
  globalWordIndex: number;
  totalWords: number;
  chunkRanges?: Array<{ chunkIndex: number; startWordIndex: number; endWordIndex: number }>;
  structure?: DocumentStructure | null;
  explicitPageNumber?: number;
}): ResolvedDocumentPosition {
  const { documentId, totalWords, chunkRanges = [], structure, explicitPageNumber } = params;
  const safeTotalWords = Math.max(1, totalWords);
  const clampedWordIndex = Math.max(0, Math.min(params.globalWordIndex, safeTotalWords - 1));

  // Determine chunk index via binary search
  const chunkIndex = findChunkIndexForWord(chunkRanges, clampedWordIndex);
  const activeRange = chunkRanges[chunkIndex];
  const wordIndexInChunk = activeRange
    ? Math.max(0, clampedWordIndex - activeRange.startWordIndex)
    : 0;

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((clampedWordIndex + 1) / safeTotalWords) * 100))
  );

  let pageNumber: number | undefined = explicitPageNumber;
  let chapter: StructuralNode | undefined;
  let section: StructuralNode | undefined;
  let paragraphIndex: number | undefined;

  if (structure) {
    // 1. PDF Page resolution (only if document has pages and pageNumber was not explicitly given)
    if (pageNumber === undefined && structure.pages && structure.pages.length > 0) {
      const pageEntry = findPageForWordIndex(structure.pages, clampedWordIndex);
      if (pageEntry) {
        pageNumber = pageEntry.pageNumber;
      }
    }

    // 2. Chapter / Section resolution
    const structuralNodes = findStructuralNodesForWord(structure, clampedWordIndex);
    chapter = structuralNodes.chapter;
    section = structuralNodes.section;

    // 3. Paragraph resolution
    if (structure.paragraphs) {
      const p = findParagraphForWord(structure.paragraphs, clampedWordIndex);
      if (p) {
        paragraphIndex = p.paragraphIndex;
      }
    }
  }

  return {
    documentId,
    globalWordIndex: clampedWordIndex,
    chunkIndex,
    wordIndexInChunk,
    progressPercent,
    totalWords: safeTotalWords,
    pageNumber,
    chapter,
    section,
    paragraphIndex,
  };
}

/**
 * Resolves a PDF page number into a canonical reading position.
 */
export async function resolvePage(
  documentId: string,
  pageNumber: number,
  wordOffset: number = 0,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, locationIndex] = await Promise.all([
    context?.meta ?? documentStorageService.getMetadata(documentId),
    context?.structure ?? documentStorageService.getStructure(documentId),
    context?.locationIndex ?? documentStorageService.getLocationIndex(documentId),
  ]);

  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!structure?.pages || structure.pages.length === 0) {
    throw new Error(`Document "${documentId}" is not paginated.`);
  }

  const clampedPageNum = Math.max(1, Math.min(pageNumber, structure.pages.length));
  const pageEntry = structure.pages[clampedPageNum - 1];
  if (!pageEntry) {
    throw new Error(`Page ${pageNumber} out of range (1-${structure.pages.length}).`);
  }

  const globalWordIndex = pageEntry.startWordIndex + Math.max(0, wordOffset);

  return buildResolvedPosition({
    documentId,
    globalWordIndex,
    totalWords: meta.totalWords,
    chunkRanges: locationIndex?.chunks || locationIndex?.chunkRanges,
    structure,
    explicitPageNumber: clampedPageNum,
  });
}

/**
 * Resolves a chapter ID into a canonical reading position.
 */
export async function resolveChapter(
  documentId: string,
  chapterId: string,
  wordOffset: number = 0,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, locationIndex] = await Promise.all([
    context?.meta ?? documentStorageService.getMetadata(documentId),
    context?.structure ?? documentStorageService.getStructure(documentId),
    context?.locationIndex ?? documentStorageService.getLocationIndex(documentId),
  ]);

  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!structure) {
    throw new Error(`Document structure not found for: ${documentId}`);
  }

  const targetNode =
    structure.chapters.find((c) => c.id === chapterId) ||
    structure.sections.find((s) => s.id === chapterId);

  if (!targetNode) {
    throw new Error(`Chapter not found with ID: ${chapterId}`);
  }

  const globalWordIndex = targetNode.startWordIndex + Math.max(0, wordOffset);

  return buildResolvedPosition({
    documentId,
    globalWordIndex,
    totalWords: meta.totalWords,
    chunkRanges: locationIndex?.chunks || locationIndex?.chunkRanges,
    structure,
  });
}

/**
 * Resolves a section ID into a canonical reading position.
 */
export async function resolveSection(
  documentId: string,
  sectionId: string,
  wordOffset: number = 0,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, locationIndex] = await Promise.all([
    context?.meta ?? documentStorageService.getMetadata(documentId),
    context?.structure ?? documentStorageService.getStructure(documentId),
    context?.locationIndex ?? documentStorageService.getLocationIndex(documentId),
  ]);

  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!structure) {
    throw new Error(`Document structure not found for: ${documentId}`);
  }

  const targetNode = structure.sections.find((s) => s.id === sectionId);
  if (!targetNode) {
    throw new Error(`Section not found with ID: ${sectionId}`);
  }

  const globalWordIndex = targetNode.startWordIndex + Math.max(0, wordOffset);

  return buildResolvedPosition({
    documentId,
    globalWordIndex,
    totalWords: meta.totalWords,
    chunkRanges: locationIndex?.chunks || locationIndex?.chunkRanges,
    structure,
  });
}

/**
 * Resolves a raw word index into a canonical reading position with full structural context.
 */
export async function resolveWordIndex(
  documentId: string,
  wordIndex: number,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, locationIndex] = await Promise.all([
    context?.meta ?? documentStorageService.getMetadata(documentId),
    context?.structure ?? documentStorageService.getStructure(documentId),
    context?.locationIndex ?? documentStorageService.getLocationIndex(documentId),
  ]);

  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  return buildResolvedPosition({
    documentId,
    globalWordIndex: wordIndex,
    totalWords: meta.totalWords,
    chunkRanges: locationIndex?.chunks || locationIndex?.chunkRanges,
    structure,
  });
}

/**
 * Resolves a paragraph index into a canonical reading position.
 */
export async function resolveParagraph(
  documentId: string,
  paragraphIndex: number,
  wordOffset: number = 0,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, locationIndex] = await Promise.all([
    context?.meta ?? documentStorageService.getMetadata(documentId),
    context?.structure ?? documentStorageService.getStructure(documentId),
    context?.locationIndex ?? documentStorageService.getLocationIndex(documentId),
  ]);

  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!structure?.paragraphs || structure.paragraphs.length === 0) {
    throw new Error(`Paragraph index not available for document: ${documentId}`);
  }

  const clampedPIdx = Math.max(0, Math.min(paragraphIndex, structure.paragraphs.length - 1));
  const pEntry = structure.paragraphs[clampedPIdx];
  const globalWordIndex = pEntry.startWordIndex + Math.max(0, wordOffset);

  return buildResolvedPosition({
    documentId,
    globalWordIndex,
    totalWords: meta.totalWords,
    chunkRanges: locationIndex?.chunks || locationIndex?.chunkRanges,
    structure,
  });
}

/**
 * Resolves reading percentage (0-100%) into a canonical reading position.
 */
export async function resolvePercent(
  documentId: string,
  percent: number,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  const meta = context?.meta ?? (await documentStorageService.getMetadata(documentId));
  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const targetWord = Math.round((clampedPercent / 100) * Math.max(0, meta.totalWords - 1));

  return resolveWordIndex(documentId, targetWord, context);
}

/**
 * Master unified position resolver handling any DocumentPosition kind.
 */
export async function resolvePosition(
  documentId: string,
  position: DocumentPosition,
  context?: ResolverContext
): Promise<ResolvedDocumentPosition> {
  switch (position.kind) {
    case 'word':
      return resolveWordIndex(documentId, position.wordIndex, context);
    case 'pdf-page':
      return resolvePage(documentId, position.pageNumber, position.wordOffset, context);
    case 'chapter':
      return resolveChapter(documentId, position.chapterId, position.wordOffset, context);
    case 'section':
      return resolveSection(documentId, position.sectionId, position.wordOffset, context);
    case 'paragraph':
      return resolveParagraph(documentId, position.paragraphIndex, position.wordOffset, context);
    case 'percent':
      return resolvePercent(documentId, position.percent, context);
    default:
      throw new Error(`Unsupported position kind: ${(position as any)?.kind}`);
  }
}
