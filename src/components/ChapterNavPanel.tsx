/**
 * Phase 6 Chapter Navigation & Table of Contents (PART G)
 * 
 * Collapsible contents panel displaying:
 * - Chapter/Section title
 * - Structural level (indentation H1, H2, H3)
 * - Page number where available (for PDFs)
 * - Current-location indicator ("You are here" / active badge)
 * - Clicking resolves position and jumps immediately
 */

import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  BookOpen, 
  Bookmark, 
  CheckCircle2,
  List
} from 'lucide-react';
import { StructuralNode, DocumentStructure, InputSourceType } from '../types';

interface ChapterNavPanelProps {
  structure?: DocumentStructure | null;
  currentWordIndex: number;
  sourceType?: InputSourceType;
  onSelectNode: (node: StructuralNode) => void;
  className?: string;
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
}

export const ChapterNavPanel: React.FC<ChapterNavPanelProps> = ({
  structure,
  currentWordIndex,
  sourceType,
  onSelectNode,
  className = '',
  isCollapsible = false,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Combine top-level chapters or sections
  const nodes = (structure?.chapters && structure.chapters.length > 0)
    ? structure.chapters
    : (structure?.sections || []);

  if (!structure || nodes.length === 0) {
    return (
      <div className={`p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center ${className}`}>
        <p className="text-xs text-slate-500">No table of contents or chapters detected for this document.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden ${className}`}>
      {/* Panel Header */}
      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/80 transition-colors text-left"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <List className="w-4 h-4 text-red-500" />
            <span>Contents ({nodes.length})</span>
          </div>
          <div className="text-slate-400">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-left">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <List className="w-4 h-4 text-red-500" />
            <span>Contents ({nodes.length})</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {sourceType === 'pdf' ? 'Page-Indexed' : 'Structural'}
          </span>
        </div>
      )}

      {/* List of chapters/sections */}
      {isExpanded && (
        <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto pr-1">
          {nodes.map((node, index) => {
            const isCurrent =
              currentWordIndex >= node.startWordIndex &&
              currentWordIndex <= node.endWordIndex;

            const isPast = currentWordIndex > node.endWordIndex;
            const levelIndent = Math.min(32, Math.max(0, ((node.level || 1) - 1) * 14));

            return (
              <button
                key={node.id || `node-${index}`}
                type="button"
                onClick={() => onSelectNode(node)}
                className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs transition-colors group ${
                  isCurrent
                    ? 'bg-red-950/40 text-red-300 font-semibold border-l-2 border-red-500'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
                style={{ paddingLeft: `${16 + levelIndent}px` }}
              >
                <div className="flex items-center gap-2 min-w-0 pr-3">
                  {/* Sequence number or bullet */}
                  <span className={`text-[10px] font-mono shrink-0 ${isCurrent ? 'text-red-400' : 'text-slate-500'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  {/* Title */}
                  <span className="truncate group-hover:text-red-400 transition-colors">
                    {node.title}
                  </span>

                  {/* Current Active Badge */}
                  {isCurrent && (
                    <span className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-red-600 text-white shadow-sm">
                      Current
                    </span>
                  )}
                </div>

                {/* Page number if available (PDF) */}
                <div className="shrink-0 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                  {node.pageStart !== undefined && (
                    <span>p. {node.pageStart}</span>
                  )}
                  {isPast && !isCurrent && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
