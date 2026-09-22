/**
 * Phase 6 Document Map / Minimap (PART E)
 * 
 * Compact visual timeline position map:
 * 0%                                      100%
 * │                                         │
 * ██████████████████████████████████████████
 * │      │        │          │        │      │
 * Ch.1   Ch.4     Ch.7       Ch.12     Ch.18
 *              ▲
 *            You are here
 * 
 * Compact, clickable timeline without 1,000 individual page DOM nodes.
 */

import React, { useRef, useMemo } from 'react';
import { StructuralNode, DocumentStructure } from '../types';

interface DocumentMinimapProps {
  totalWords: number;
  currentWordIndex: number;
  structure?: DocumentStructure | null;
  onSeekWordIndex: (wordIndex: number) => void;
  className?: string;
  isCompact?: boolean;
}

export const DocumentMinimap: React.FC<DocumentMinimapProps> = ({
  totalWords,
  currentWordIndex,
  structure,
  onSeekWordIndex,
  className = '',
  isCompact = false,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const safeTotalWords = Math.max(1, totalWords);
  const currentPercent = Math.min(
    100,
    Math.max(0, (currentWordIndex / safeTotalWords) * 100)
  );

  // Extract landmarks: chapters or significant sections, max ~8-10 visible marks to stay clean
  const landmarks = useMemo(() => {
    const rawNodes = (structure?.chapters && structure.chapters.length > 0)
      ? structure.chapters
      : (structure?.sections || []);

    if (rawNodes.length === 0) {
      return [];
    }

    // If there are many chapters, pick an even sample so labels don't collide
    const maxMarks = 8;
    const step = Math.max(1, Math.ceil(rawNodes.length / maxMarks));
    const sampled: Array<{ node: StructuralNode; percent: number; label: string }> = [];

    for (let i = 0; i < rawNodes.length; i += step) {
      const node = rawNodes[i];
      const p = Math.min(100, Math.max(0, (node.startWordIndex / safeTotalWords) * 100));
      
      // Clean, compact label
      let label = node.title;
      if (label.length > 14) {
        label = label.slice(0, 12) + '…';
      }

      sampled.push({
        node,
        percent: p,
        label,
      });
    }

    return sampled;
  }, [structure, safeTotalWords]);

  // Handle clicking anywhere on the timeline track
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetWord = Math.round(ratio * (safeTotalWords - 1));
    onSeekWordIndex(targetWord);
  };

  return (
    <div className={`w-full flex flex-col select-none ${className}`}>
      {/* 0% and 100% Boundary Labels */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1 px-0.5">
        <span>0%</span>
        <span className="text-[11px] text-slate-400 font-sans font-medium">
          Document Map
        </span>
        <span>100%</span>
      </div>

      {/* Clickable Timeline Bar */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        title="Click anywhere to jump to that reading position"
        className="relative h-4 sm:h-5 bg-slate-900 border border-slate-800 rounded-md cursor-pointer group hover:border-slate-700 transition-colors"
      >
        {/* Progress Fill */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-red-600/30 rounded-l-md transition-all duration-150"
          style={{ width: `${currentPercent}%` }}
        />

        {/* Landmark tick marks along the bar */}
        {landmarks.map((mark, idx) => (
          <div
            key={`mark-${idx}`}
            className="absolute top-0 bottom-0 w-px bg-slate-700 pointer-events-none group-hover:bg-slate-600"
            style={{ left: `${mark.percent}%` }}
          />
        ))}

        {/* Current position playhead marker */}
        <div
          className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-red-500 shadow-md shadow-red-500/50 rounded-sm pointer-events-none"
          style={{ left: `${currentPercent}%` }}
        />
      </div>

      {/* Position Pointer & "You are here" Indicator */}
      <div className="relative h-7 sm:h-8 mt-1 overflow-hidden pointer-events-none">
        {/* Dynamic "You are here" marker */}
        <div
          className="absolute flex flex-col items-center -translate-x-1/2 transition-all duration-150"
          style={{
            left: `${Math.min(92, Math.max(8, currentPercent))}%`,
          }}
        >
          <span className="text-red-500 text-[10px] leading-none">▲</span>
          <span className="text-[10px] font-semibold text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800/60 shadow whitespace-nowrap mt-0.5">
            You are here ({Math.round(currentPercent)}%)
          </span>
        </div>
      </div>

      {/* Chapter Landmarks Row */}
      {!isCompact && landmarks.length > 0 && (
        <div className="relative h-6 mt-1 overflow-hidden border-t border-slate-800/80 pt-1">
          {landmarks.map((mark, idx) => (
            <button
              key={`label-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeekWordIndex(mark.node.startWordIndex);
              }}
              title={`Jump to ${mark.node.title}`}
              className="absolute -translate-x-1/2 text-[10px] font-mono text-slate-400 hover:text-red-400 hover:underline transition-colors truncate max-w-[80px]"
              style={{
                left: `${Math.min(94, Math.max(6, mark.percent))}%`,
              }}
            >
              {mark.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
