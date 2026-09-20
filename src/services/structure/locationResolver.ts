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
} from '../../types';
import { documentStorageService } from '../document/documentStorageService';
import { findChunkIndexForWord } from '../document/chunking';

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

    if (wordIndex < page.startWordIndex) {
      high = mid - 1;
    } else if (wordIndex > page.endWordIndex) {
      low = mid + 1;
    } else {
      return page;
    }
  }

  // If between or at boundary
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
 * Helper to build the final canonical ResolvedDocumentPosition
 */
function buildResolvedPosition(params: {
  documentId: string;
  globalWordIndex: number;
  totalWords: number;
  chunks: DocumentChunk[];
  structure?: DocumentStructure | null;
}): ResolvedDocumentPosition {
  const { documentId, totalWords, chunks, structure } = params;
  const safeTotalWords = Math.max(1, totalWords);
  const clampedWordIndex = Math.max(0, Math.min(params.globalWordIndex, safeTotalWords - 1));

  // Determine chunk index
  const chunkIndex = findChunkIndexForWord(chunks, clampedWordIndex);
  const activeChunk = chunks[chunkIndex];
  const wordIndexInChunk = activeChunk
    ? Math.max(0, clampedWordIndex - activeChunk.startWordIndex)
    : 0;

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((clampedWordIndex + 1) / safeTotalWords) * 100))
  );

  let pageNumber: number | undefined;
  let chapter: StructuralNode | undefined;
  let section: StructuralNode | undefined;
  let paragraphIndex: number | undefined;

  if (structure) {
    // 1. PDF Page resolution (only if document has pages)
    if (structure.pages && structure.pages.length > 0) {
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
  wordOffset: number = 0
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, chunks] = await Promise.all([
    documentStorageService.getMetadata(documentId),
    documentStorageService.getStructure(documentId),
    documentStorageService.getAllChunks(documentId),
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
    chunks,
    structure,
  });
}

/**
 * Resolves a chapter ID into a canonical reading position.
 */
export async function resolveChapter(
  documentId: string,
  chapterId: string,
  wordOffset: number = 0
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, chunks] = await Promise.all([
    documentStorageService.getMetadata(documentId),
    documentStorageService.getStructure(documentId),
    documentStorageService.getAllChunks(documentId),
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
    chunks,
    structure,
  });
}

/**
 * Resolves a section ID into a canonical reading position.
 */
export async function resolveSection(
  documentId: string,
  sectionId: string,
  wordOffset: number = 0
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, chunks] = await Promise.all([
    documentStorageService.getMetadata(documentId),
    documentStorageService.getStructure(documentId),
    documentStorageService.getAllChunks(documentId),
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
    chunks,
    structure,
  });
}

/**
 * Resolves a raw word index into a canonical reading position with full structural context.
 */
export async function resolveWordIndex(
  documentId: string,
  wordIndex: number
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, chunks] = await Promise.all([
    documentStorageService.getMetadata(documentId),
    documentStorageService.getStructure(documentId),
    documentStorageService.getAllChunks(documentId),
  ]);

  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  return buildResolvedPosition({
    documentId,
    globalWordIndex: wordIndex,
    totalWords: meta.totalWords,
    chunks,
    structure,
  });
}

/**
 * Resolves a paragraph index into a canonical reading position.
 */
export async function resolveParagraph(
  documentId: string,
  paragraphIndex: number,
  wordOffset: number = 0
): Promise<ResolvedDocumentPosition> {
  const [meta, structure, chunks] = await Promise.all([
    documentStorageService.getMetadata(documentId),
    documentStorageService.getStructure(documentId),
    documentStorageService.getAllChunks(documentId),
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
    chunks,
    structure,
  });
}

/**
 * Resolves reading percentage (0-100%) into a canonical reading position.
 */
export async function resolvePercent(
  documentId: string,
  percent: number
): Promise<ResolvedDocumentPosition> {
  const meta = await documentStorageService.getMetadata(documentId);
  if (!meta) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const targetWord = Math.round((clampedPercent / 100) * Math.max(0, meta.totalWords - 1));

  return resolveWordIndex(documentId, targetWord);
}

/**
 * Master unified position resolver handling any DocumentPosition kind.
 */
export async function resolvePosition(
  documentId: string,
  position: DocumentPosition
): Promise<ResolvedDocumentPosition> {
  switch (position.kind) {
    case 'word':
      return resolveWordIndex(documentId, position.wordIndex);
    case 'pdf-page':
      return resolvePage(documentId, position.pageNumber, position.wordOffset);
    case 'chapter':
      return resolveChapter(documentId, position.chapterId, position.wordOffset);
    case 'section':
      return resolveSection(documentId, position.sectionId, position.wordOffset);
    case 'paragraph':
      return resolveParagraph(documentId, position.paragraphIndex, position.wordOffset);
    case 'percent':
      return resolvePercent(documentId, position.percent);
    default:
      throw new Error(`Unsupported position kind: ${(position as any)?.kind}`);
  }
}
