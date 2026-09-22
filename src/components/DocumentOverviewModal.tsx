/**
 * Phase 6 Large Document Overview (PART B, C, D, E, F, G, H)
 * 
 * Lightweight navigation screen displayed when opening large documents:
 * 1. Resume (prominent action showing chapter & page)
 * 2. Visual Document Map / Minimap
 * 3. Contents (collapsible chapter list)
 * 4. Jump to page/location
 * 5. Search
 * 6. Start from beginning
 * 
 * Consistent with ADHD Reader dark/red theme, fast & lightweight.
 */

import React, { useEffect, useState } from 'react';
import { 
  Play, 
  RotateCcw, 
  X, 
  BookOpen, 
  Layers, 
  Search, 
  ArrowRight,
  FileText
} from 'lucide-react';
import { 
  ReaderDocumentHandle, 
  DocumentMetadata, 
  DocumentStructure, 
  ResolvedDocumentPosition,
  StructuralNode,
  SearchResult,
  ReaderSettings
} from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';
import { 
  classifyDocumentSize, 
  formatSourceAwareSummary, 
  formatSourceAwarePosition 
} from '../services/structure/documentSizeClassifier';
import { DocumentMinimap } from './DocumentMinimap';
import { PageJumpControl } from './PageJumpControl';
import { ChapterNavPanel } from './ChapterNavPanel';
import { DocumentSearchBox } from './DocumentSearchBox';

interface DocumentOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  handle?: ReaderDocumentHandle | null;
  metadata?: DocumentMetadata | null;
  structure?: DocumentStructure | null;
  currentWordIndex: number;
  onNavigateToPosition: (resolved: ResolvedDocumentPosition | { globalWordIndex: number }) => void;
  onStartFromBeginning: () => void;
  settings: ReaderSettings;
}

export const DocumentOverviewModal: React.FC<DocumentOverviewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  handle,
  metadata,
  structure,
  currentWordIndex,
  onNavigateToPosition,
  onStartFromBeginning,
  settings,
}) => {
  const [resolvedPosition, setResolvedPosition] = useState<ResolvedDocumentPosition | null>(null);

  // Resolve current reading position when modal opens or index changes
  useEffect(() => {
    if (!isOpen || !documentId) return;

    let isMounted = true;
    const targetIdx = Math.max(0, currentWordIndex);

    if (handle && handle.resolveWordIndex) {
      handle.resolveWordIndex(targetIdx).then((res) => {
        if (isMounted) setResolvedPosition(res);
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, documentId, handle, currentWordIndex]);

  if (!isOpen) return null;

  const totalWords = metadata?.totalWords || 0;
  const pageCount = metadata?.pageCount || structure?.pages?.length || 0;
  const sourceType = metadata?.sourceType || 'text';
  const title = metadata?.title || 'Document Overview';
  const chapters = structure?.chapters || [];

  const sizeInfo = classifyDocumentSize({
    totalWords,
    pageCount,
    totalCharacters: metadata?.totalCharacters,
    sourceType,
  });

  const summarySubtitle = formatSourceAwareSummary({
    sourceType,
    wordCount: totalWords,
    pageCount,
    chapterCount: chapters.length,
  });

  const locationSubtitle = formatSourceAwarePosition({
    sourceType,
    resolved: resolvedPosition,
    totalWords,
    pageCount,
    structure,
  });

  // Jump by page (PDF)
  const handleJumpPage = async (pageNum: number) => {
    try {
      if (handle && handle.resolvePage) {
        const resolved = await handle.resolvePage(pageNum);
        onNavigateToPosition(resolved);
        onClose();
      } else if (structure?.pages) {
        const p = structure.pages[pageNum - 1];
        if (p) {
          onNavigateToPosition({ globalWordIndex: p.startWordIndex });
          onClose();
        }
      }
    } catch (err) {
      console.warn('Failed to jump to page:', err);
    }
  };

  // Jump by chapter / structural node
  const handleSelectChapter = async (node: StructuralNode) => {
    try {
      if (handle && handle.resolveChapter) {
        const resolved = await handle.resolveChapter(node.id);
        onNavigateToPosition(resolved);
        onClose();
      } else {
        onNavigateToPosition({ globalWordIndex: node.startWordIndex });
        onClose();
      }
    } catch {
      onNavigateToPosition({ globalWordIndex: node.startWordIndex });
      onClose();
    }
  };

  // Jump from search result
  const handleSelectSearchResult = (result: SearchResult) => {
    onNavigateToPosition({ globalWordIndex: result.globalWordIndex });
    onClose();
  };

  // Jump by percentage
  const handleJumpPercent = (pct: number) => {
    const targetWord = Math.round((pct / 100) * Math.max(0, totalWords - 1));
    onNavigateToPosition({ globalWordIndex: targetWord });
    onClose();
  };

  const hasPreviousProgress = currentWordIndex > 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200"
      >
        {/* Header: Title and Source-aware Stats */}
        <div className="flex items-start justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800/80">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider font-semibold ${sizeInfo.badgeColor}`}>
                {sizeInfo.label}
              </span>
              <span className="text-[10px] font-mono text-slate-500 uppercase">
                {sourceType}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
              {title}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {summarySubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close overview and start reading"
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Overview Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 divide-y divide-slate-800/70">
          {/* 1. Resume (Most Prominent Action) */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full group p-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold transition-all shadow-lg shadow-red-950/50 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-black/20 flex items-center justify-center">
                  <Play className="w-5 h-5 fill-white" />
                </div>
                <div className="text-left">
                  <div className="text-sm sm:text-base font-bold">
                    {hasPreviousProgress ? 'Continue Reading' : 'Start Reading'}
                  </div>
                  <div className="text-xs text-red-100 font-normal font-sans truncate">
                    {locationSubtitle}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform shrink-0" />
            </button>
          </div>

          {/* 2. Visual Document Map / Minimap (PART E) */}
          <div className="pt-4 space-y-2">
            <DocumentMinimap
              totalWords={totalWords}
              currentWordIndex={currentWordIndex}
              structure={structure}
              onSeekWordIndex={(idx) => {
                onNavigateToPosition({ globalWordIndex: idx });
                onClose();
              }}
            />
          </div>

          {/* 3. Jump to Page or Location (PART F & C) */}
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Jump to Location
            </span>
            <PageJumpControl
              sourceType={sourceType}
              currentPage={resolvedPosition?.pageNumber || 1}
              totalPages={pageCount}
              totalSections={chapters.length}
              currentSection={0}
              currentPercent={resolvedPosition?.progressPercent || 0}
              onJumpPage={handleJumpPage}
              onJumpSection={(secIdx) => {
                const node = chapters[secIdx];
                if (node) handleSelectChapter(node);
              }}
              onJumpPercent={handleJumpPercent}
            />
          </div>

          {/* 4. Document-Local Search (PART H) */}
          <div className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                Search Document
              </span>
            </div>
            <DocumentSearchBox
              documentId={documentId}
              handle={handle}
              onSelectResult={handleSelectSearchResult}
              placeholder="Search chapters, keywords, landmarks..."
            />
          </div>

          {/* 5. Contents (Chapter Navigation) (PART G) */}
          {chapters.length > 0 && (
            <div className="pt-4 space-y-2">
              <ChapterNavPanel
                structure={structure}
                currentWordIndex={currentWordIndex}
                sourceType={sourceType}
                onSelectNode={handleSelectChapter}
              />
            </div>
          )}

          {/* 6. Start from beginning button */}
          <div className="pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onStartFromBeginning();
                onClose();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Start from beginning</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              Enter Reader →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
