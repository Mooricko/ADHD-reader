/**
 * Phase 6 Page Jump Control (PART F & C)
 * 
 * Supports:
 * - Page [ 300 ] / 1024 for PDFs
 * - Section [ 4 ] / 12 for Markdown / TXT
 * - Typing number, Enter key, Go button
 * - Previous (<) and Next (>) navigation
 * - Resolves to canonical reading position
 */

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { InputSourceType } from '../types';

interface PageJumpControlProps {
  sourceType?: InputSourceType;
  currentPage?: number;
  totalPages?: number;
  totalSections?: number;
  currentSection?: number;
  currentPercent?: number;
  onJumpPage?: (page: number) => void;
  onJumpSection?: (sectionIdx: number) => void;
  onJumpPercent?: (percent: number) => void;
  className?: string;
}

export const PageJumpControl: React.FC<PageJumpControlProps> = ({
  sourceType,
  currentPage = 1,
  totalPages = 0,
  totalSections = 0,
  currentSection = 0,
  currentPercent = 0,
  onJumpPage,
  onJumpSection,
  onJumpPercent,
  className = '',
}) => {
  const isPdf = sourceType === 'pdf' && totalPages > 0;
  const isSectionBased = (sourceType === 'markdown' || sourceType === 'txt' || sourceType === 'text') && totalSections > 0;

  const [inputVal, setInputVal] = useState<string>(() => {
    if (isPdf) return String(currentPage || 1);
    if (isSectionBased) return String(currentSection + 1);
    return String(Math.round(currentPercent || 0));
  });

  // Keep input synchronized when props change from external playback
  useEffect(() => {
    if (isPdf) {
      setInputVal(String(currentPage || 1));
    } else if (isSectionBased) {
      setInputVal(String((currentSection || 0) + 1));
    } else {
      setInputVal(String(Math.round(currentPercent || 0)));
    }
  }, [isPdf, isSectionBased, currentPage, currentSection, currentPercent]);

  const handleApplyJump = () => {
    const num = parseInt(inputVal, 10);
    if (isNaN(num)) return;

    if (isPdf && onJumpPage) {
      const clampedPage = Math.max(1, Math.min(totalPages, num));
      onJumpPage(clampedPage);
    } else if (isSectionBased && onJumpSection) {
      const clampedSection = Math.max(0, Math.min(totalSections - 1, num - 1));
      onJumpSection(clampedSection);
    } else if (onJumpPercent) {
      const clampedPercent = Math.max(0, Math.min(100, num));
      onJumpPercent(clampedPercent);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyJump();
    }
  };

  const handlePrev = () => {
    if (isPdf && onJumpPage) {
      const prev = Math.max(1, (currentPage || 1) - 1);
      onJumpPage(prev);
    } else if (isSectionBased && onJumpSection) {
      const prev = Math.max(0, (currentSection || 0) - 1);
      onJumpSection(prev);
    } else if (onJumpPercent) {
      const prev = Math.max(0, (currentPercent || 0) - 5);
      onJumpPercent(prev);
    }
  };

  const handleNext = () => {
    if (isPdf && onJumpPage) {
      const next = Math.min(totalPages, (currentPage || 1) + 1);
      onJumpPage(next);
    } else if (isSectionBased && onJumpSection) {
      const next = Math.min(totalSections - 1, (currentSection || 0) + 1);
      onJumpSection(next);
    } else if (onJumpPercent) {
      const next = Math.min(100, (currentPercent || 0) + 5);
      onJumpPercent(next);
    }
  };

  return (
    <div className={`flex items-center gap-2 text-xs font-mono select-none ${className}`}>
      <span className="text-slate-400 font-sans font-medium">
        {isPdf ? 'Page' : isSectionBased ? 'Section' : 'Position'}
      </span>

      <div className="flex items-center border border-slate-700 bg-slate-900/90 rounded-lg p-0.5 shadow-inner">
        {/* Previous Button */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous page or section"
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          disabled={isPdf ? currentPage <= 1 : isSectionBased ? currentSection <= 0 : currentPercent <= 0}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Number Input */}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={handleKeyDown}
          className="w-12 sm:w-14 text-center bg-transparent text-white font-bold text-xs focus:outline-none focus:ring-1 focus:ring-red-500 rounded py-0.5 px-1"
          aria-label="Page or section number"
        />

        {/* Suffix total */}
        <span className="text-slate-500 px-1">
          {isPdf ? `/ ${totalPages}` : isSectionBased ? `/ ${totalSections}` : '%'}
        </span>

        {/* Next Button */}
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next page or section"
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          disabled={isPdf ? currentPage >= totalPages : isSectionBased ? currentSection >= totalSections - 1 : currentPercent >= 100}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Go Button */}
      <button
        type="button"
        onClick={handleApplyJump}
        className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-sans font-semibold text-xs transition-colors flex items-center gap-1 shadow-sm"
      >
        <span>Go</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};
