/**
 * Phase 6 Document Local Search (PART H)
 * 
 * Supports:
 * - Search this document...
 * - Instant chunk-based scanning
 * - Results show: matching snippet, chapter/section, and page number
 * - Clicking result jumps directly to that reading position
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, FileText, ArrowRight, X } from 'lucide-react';
import { SearchResult, ReaderDocumentHandle } from '../types';
import { searchDocument } from '../services/structure/searchIndex';

interface DocumentSearchBoxProps {
  documentId: string;
  handle?: ReaderDocumentHandle | null;
  onSelectResult: (result: SearchResult) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export const DocumentSearchBox: React.FC<DocumentSearchBoxProps> = ({
  documentId,
  handle,
  onSelectResult,
  className = '',
  placeholder = 'Search this document...',
  autoFocus = false,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        let searchRes: SearchResult[] = [];
        if (handle && handle.search) {
          searchRes = await handle.search(trimmed, { maxResults: 30 });
        } else if (documentId) {
          searchRes = await searchDocument(documentId, trimmed, { maxResults: 30 });
        }
        setResults(searchRes);
        setHasSearched(true);
      } catch (err) {
        console.warn('Document search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, documentId, handle]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-red-500 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
        />
        {isSearching ? (
          <Loader2 className="absolute right-3 w-4 h-4 text-red-400 animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Results Dropdown or List */}
      {hasSearched && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/90 divide-y divide-slate-800/80 shadow-xl">
          {results.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-500">
              No occurrences found for "{query}"
            </div>
          ) : (
            results.map((res, idx) => (
              <button
                key={`search-res-${idx}`}
                type="button"
                onClick={() => onSelectResult(res)}
                className="w-full p-2.5 text-left hover:bg-slate-800/70 transition-colors group flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  {/* Snippet text */}
                  <p className="text-xs text-slate-300 group-hover:text-white leading-relaxed line-clamp-2">
                    {res.snippet}
                  </p>

                  {/* Landmarks: Chapter and Section */}
                  {(res.chapterTitle || res.sectionTitle) && (
                    <p className="text-[10px] text-slate-500 mt-1 truncate">
                      {res.chapterTitle || res.sectionTitle}
                    </p>
                  )}
                </div>

                {/* Page number or position badge */}
                <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-red-400 font-medium">
                  {res.pageNumber !== undefined && (
                    <span>p. {res.pageNumber}</span>
                  )}
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
