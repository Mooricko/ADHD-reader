/**
 * Phase 3 Document Structure & Location Index: Search Index Boundary
 * 
 * Lightweight chunk-based search implementation that operates over persisted chunks,
 * resolving occurrences to exact word indices, chunk indices, pages, and chapter landmarks.
 */

import { SearchResult, SearchOptions, DocumentStructure } from '../../types';
import { documentStorageService } from '../document/documentStorageService';
import { findStructuralNodesForWord, findPageForWordIndex } from './locationResolver';
import { countWordsFast } from '../../utils/textParser';

/**
 * Searches a document for a query string.
 * Scans persisted chunks, computing global word index, chunk index, page number, and snippet.
 */
export async function searchDocument(
  documentId: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const maxResults = options?.maxResults ?? 50;
  const isCaseSensitive = options?.caseSensitive ?? false;

  const [chunks, structure] = await Promise.all([
    options?.startWordIndex !== undefined && options?.endWordIndex !== undefined
      ? documentStorageService.getChunksForWordRange(documentId, options.startWordIndex, options.endWordIndex)
      : documentStorageService.getAllChunks(documentId),
    documentStorageService.getStructure(documentId),
  ]);

  if (!chunks || chunks.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];
  const searchTerm = isCaseSensitive ? trimmed : trimmed.toLowerCase();

  for (const chunk of chunks) {
    if (results.length >= maxResults) break;

    // Word range bounds filter if requested
    if (options?.startWordIndex !== undefined && chunk.endWordIndex < options.startWordIndex) {
      continue;
    }
    if (options?.endWordIndex !== undefined && chunk.startWordIndex > options.endWordIndex) {
      continue;
    }

    const chunkText = chunk.text;
    const textToSearch = isCaseSensitive ? chunkText : chunkText.toLowerCase();

    let searchFromIdx = 0;

    while (searchFromIdx < textToSearch.length && results.length < maxResults) {
      const matchIndex = textToSearch.indexOf(searchTerm, searchFromIdx);
      if (matchIndex === -1) break;

      // Calculate word offset within this chunk up to the match index
      const textBeforeMatch = chunkText.slice(0, matchIndex);
      const wordOffsetInChunk = countWordsFast(textBeforeMatch);
      const globalWordIndex = chunk.startWordIndex + wordOffsetInChunk;

      // Check bounds
      if (options?.startWordIndex !== undefined && globalWordIndex < options.startWordIndex) {
        searchFromIdx = matchIndex + searchTerm.length;
        continue;
      }
      if (options?.endWordIndex !== undefined && globalWordIndex > options.endWordIndex) {
        break;
      }

      // Generate snippet
      const snippetStart = Math.max(0, matchIndex - 40);
      const snippetEnd = Math.min(chunkText.length, matchIndex + searchTerm.length + 40);
      let snippet = chunkText.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim();
      if (snippetStart > 0) snippet = '...' + snippet;
      if (snippetEnd < chunkText.length) snippet = snippet + '...';

      // Structural landmarks
      let pageNumber: number | undefined;
      let chapterTitle: string | undefined;
      let sectionTitle: string | undefined;

      if (structure) {
        if (structure.pages && structure.pages.length > 0) {
          const pageEntry = findPageForWordIndex(structure.pages, globalWordIndex);
          if (pageEntry) pageNumber = pageEntry.pageNumber;
        }

        const nodes = findStructuralNodesForWord(structure, globalWordIndex);
        if (nodes.chapter) chapterTitle = nodes.chapter.title;
        if (nodes.section) sectionTitle = nodes.section.title;
      }

      results.push({
        documentId,
        globalWordIndex,
        chunkIndex: chunk.chunkIndex,
        wordIndexInChunk: wordOffsetInChunk,
        pageNumber,
        chapterTitle,
        sectionTitle,
        snippet,
        matchTerm: chunkText.slice(matchIndex, matchIndex + trimmed.length),
      });

      searchFromIdx = matchIndex + Math.max(1, searchTerm.length);
    }
  }

  return results;
}
