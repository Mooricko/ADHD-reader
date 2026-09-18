import React, { useState, useRef, useCallback, useMemo } from 'react';
import { HighlightedWordParts, ReadingHeatmapData, HeatmapBucket } from '../types';
import { ThemeConfig } from '../utils/themeStyles';
import { Flame, Clock, Info, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';

export interface ReadingHeatmapProgressProps {
  words: HighlightedWordParts[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  heatmapData: ReadingHeatmapData;
  theme: ThemeConfig;
  highlightHex?: string;
  variant?: 'inline' | 'docked';
  className?: string;
  onResetHeatmap?: () => void;
}

export const ReadingHeatmapProgress: React.FC<ReadingHeatmapProgressProps> = ({
  words,
  currentIndex,
  onIndexChange,
  heatmapData,
  theme,
  highlightHex = '#ef4444',
  variant = 'inline',
  className = '',
  onResetHeatmap,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredBucket, setHoveredBucket] = useState<HeatmapBucket | null>(null);
  const [hoverPositionPct, setHoverPositionPct] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showComplexDrawer, setShowComplexDrawer] = useState(false);

  const totalWords = words.length;
  const progressPercent = totalWords > 0 ? Math.round(((currentIndex + 1) / totalWords) * 100) : 0;
  const currentPositionPct = totalWords > 0 ? (currentIndex / Math.max(1, totalWords - 1)) * 100 : 0;

  // Filter buckets that qualify as complex (high or peak dwell)
  const complexBuckets = useMemo(() => {
    return heatmapData.buckets.filter((b) => b.complexityLevel === 'high' || b.complexityLevel === 'peak');
  }, [heatmapData.buckets]);

  // Calculate target word index from pointer position
  const getIndexFromPointer = useCallback(
    (clientX: number): number => {
      if (!containerRef.current || totalWords === 0) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const percentage = relativeX / rect.width;
      return Math.min(totalWords - 1, Math.max(0, Math.floor(percentage * totalWords)));
    },
    [totalWords]
  );

  // Pointer move handler for hover tooltip and dragging
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current || totalWords === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const percentage = (relativeX / rect.width) * 100;
      setHoverPositionPct(percentage);

      // Find matching bucket
      const bucketIdx = Math.min(
        heatmapData.buckets.length - 1,
        Math.max(0, Math.floor((percentage / 100) * heatmapData.buckets.length))
      );
      setHoveredBucket(heatmapData.buckets[bucketIdx] || null);

      if (isDragging) {
        const targetWord = getIndexFromPointer(e.clientX);
        onIndexChange(targetWord);
      }
    },
    [totalWords, heatmapData.buckets, isDragging, getIndexFromPointer, onIndexChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const targetWord = getIndexFromPointer(e.clientX);
      onIndexChange(targetWord);
    },
    [getIndexFromPointer, onIndexChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // Ignore
      }
    },
    []
  );

  const handlePointerLeave = useCallback(() => {
    if (!isDragging) {
      setHoveredBucket(null);
      setHoverPositionPct(null);
    }
  }, [isDragging]);

  // Format total dwell time
  const formattedTotalDwell = useMemo(() => {
    const totalSecs = Math.round(heatmapData.totalDwellMs / 1000);
    if (totalSecs < 60) return `${totalSecs}s`;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  }, [heatmapData.totalDwellMs]);

  const isDocked = variant === 'docked';

  return (
    <div
      id="reading-progress-heatmap-container"
      className={`relative select-none ${isDocked ? 'w-full px-3 py-1.5 backdrop-blur-md' : 'w-full'} ${className}`}
    >
      {/* Top Header Row for Scrubber Info */}
      <div className="flex items-center justify-between text-xs font-mono font-medium mb-1.5 px-0.5">
        <div className="flex items-center gap-2">
          <span className={theme.textMuted}>
            Word <strong className={theme.textPrimary}>{currentIndex + 1}</strong> of {totalWords}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-slate-300">
            {formattedTotalDwell} read
          </span>
          {complexBuckets.length > 0 && (
            <button
              type="button"
              onClick={() => setShowComplexDrawer((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
              title="Click to view identified complex sections"
            >
              <Flame className="w-3 h-3 text-red-400 fill-red-400/50" />
              <span>{complexBuckets.length} complex {complexBuckets.length === 1 ? 'part' : 'parts'}</span>
              {showComplexDrawer ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Subtle Heatmap Scale Legend */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-400 font-sans" title="Heatmap Color Scale: Green (Fast/Skimmed) to Red (High Dwell / Complex)">
            <span className="text-emerald-400">Fast</span>
            <div className="w-12 h-1.5 rounded-full bg-gradient-to-r from-[#10b981] via-[#f59e0b] to-[#ef4444]" />
            <span className="text-red-400">Complex</span>
          </div>

          <span className={`font-bold ${theme.textPrimary}`}>
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Heatmap Progress Track Container */}
      <div
        ref={containerRef}
        id="reading-heatmap-progress-bar"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        role="slider"
        aria-label="Reading progress and complexity heatmap"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, totalWords - 1)}
        aria-valuenow={currentIndex}
        aria-valuetext={`Word ${currentIndex + 1} of ${totalWords}, ${progressPercent}% completed`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onIndexChange(Math.min(totalWords - 1, currentIndex + (e.shiftKey ? 20 : 5)));
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onIndexChange(Math.max(0, currentIndex - (e.shiftKey ? 20 : 5)));
          }
        }}
        className="relative w-full h-4 sm:h-5 rounded-lg cursor-pointer touch-none group flex items-center focus:outline-none focus:ring-2 focus:ring-red-500/50"
      >
        {/* Base Background Track */}
        <div className="absolute inset-x-0 h-2 sm:h-2.5 rounded-full bg-slate-800/80 border border-slate-700/50 overflow-hidden shadow-inner" />

        {/* Heatmap Gradient Track */}
        <div
          className="absolute inset-x-0 h-2 sm:h-2.5 rounded-full overflow-hidden transition-all duration-300"
          style={{
            background: heatmapData.gradientCss,
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Subtle unread veil for the portion of text not yet reached */}
          <div
            className="absolute top-0 bottom-0 right-0 bg-slate-900/60 backdrop-blur-[1px] transition-all duration-150 pointer-events-none"
            style={{
              left: `${Math.min(100, Math.max(0, currentPositionPct))}%`,
            }}
          />
        </div>

        {/* Individual Bucket Tick Marks (Hover guides & subtle dividers) */}
        <div className="absolute inset-x-0 h-2 sm:h-2.5 rounded-full pointer-events-none flex opacity-30">
          {heatmapData.buckets.map((b) => (
            <div
              key={`tick-${b.index}`}
              className="flex-1 border-r border-black/25 last:border-r-0"
            />
          ))}
        </div>

        {/* Current Reading Playhead Pin */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-100 pointer-events-none z-20 flex flex-col items-center"
          style={{ left: `${currentPositionPct}%` }}
        >
          <div
            className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-white shadow-md transition-transform transform group-hover:scale-110 flex items-center justify-center"
            style={{
              backgroundColor: highlightHex,
              boxShadow: `0 0 12px ${highlightHex}, 0 2px 4px rgba(0,0,0,0.4)`,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        </div>

        {/* Interactive Hover Needle & Guideline */}
        {hoverPositionPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-white/90 shadow-sm pointer-events-none z-10 transition-opacity"
            style={{ left: `${hoverPositionPct}%` }}
          />
        )}
      </div>

      {/* Floating Interactive Tooltip Preview */}
      {hoveredBucket && hoverPositionPct !== null && (
        <div
          className="absolute z-50 pointer-events-none transition-all duration-75"
          style={{
            left: `${Math.min(84, Math.max(16, hoverPositionPct))}%`,
            bottom: '100%',
            marginBottom: '10px',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="w-64 sm:w-72 p-3 rounded-xl bg-slate-900/95 border border-slate-700/80 text-white shadow-2xl backdrop-blur-md text-xs font-sans space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
            {/* Complexity Status Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: hoveredBucket.color }}
                />
                <span className="font-semibold text-slate-200 truncate">
                  {hoveredBucket.complexityLevel === 'peak' && '🔥 High Dwell (Complex)'}
                  {hoveredBucket.complexityLevel === 'high' && '⚡ Dense / Deep Focus'}
                  {hoveredBucket.complexityLevel === 'moderate' && '✓ Standard Pace'}
                  {hoveredBucket.complexityLevel === 'low' && '🟢 Fast / Skimmed'}
                  {hoveredBucket.complexityLevel === 'unread' && '⚪ Unread Section'}
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {hoveredBucket.progressPercent}%
              </span>
            </div>

            {/* Dwell Metrics & Words */}
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span className="flex items-center gap-1 font-mono text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                {Math.round(hoveredBucket.dwellTimeMs / 100) / 10}s dwell time
              </span>
              <span className="font-mono text-slate-400">
                Words {hoveredBucket.startWord + 1}–{hoveredBucket.endWord + 1}
              </span>
            </div>

            {/* Snippet Preview */}
            <div className="text-[11px] text-slate-300/90 italic bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/40 line-clamp-2 leading-tight">
              &ldquo;{hoveredBucket.sampleSnippet}&rdquo;
            </div>

            {/* Click to jump prompt */}
            <div className="text-[10px] text-center text-slate-400 font-medium pt-0.5">
              Click anywhere on heatmap to jump here
            </div>
          </div>
        </div>
      )}

      {/* Expandable Identified Complex Sections Drawer */}
      {showComplexDrawer && complexBuckets.length > 0 && (
        <div className="mt-2.5 p-3 rounded-xl bg-slate-900/95 border border-red-500/30 text-white shadow-xl backdrop-blur-md text-xs font-sans animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-red-400">
              <Flame className="w-4 h-4 fill-red-400" />
              <span>Identified Complex Sections ({complexBuckets.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowComplexDrawer(false)}
              className="text-slate-400 hover:text-white text-[11px] px-2 py-0.5 rounded bg-slate-800"
            >
              Close
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-1 mb-2">
            These sections recorded the highest cognitive dwell time or multiple re-reads. Click any section to jump directly to it:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
            {complexBuckets.map((bucket, idx) => (
              <button
                key={`complex-item-${bucket.index}`}
                type="button"
                onClick={() => {
                  onIndexChange(bucket.startWord);
                  setShowComplexDrawer(false);
                }}
                className="text-left p-2 rounded-lg bg-slate-800/80 hover:bg-red-950/40 border border-slate-700/60 hover:border-red-500/40 transition-all flex flex-col gap-1 group"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-semibold text-slate-200 group-hover:text-red-300">
                    Section #{idx + 1} (Word {bucket.startWord + 1})
                  </span>
                  <span className="text-[10px] text-red-400 font-bold">
                    {Math.round(bucket.dwellTimeMs / 100) / 10}s dwell
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 group-hover:text-slate-200 italic line-clamp-1">
                  &ldquo;{bucket.sampleSnippet}&rdquo;
                </div>
              </button>
            ))}
          </div>

          {onResetHeatmap && (
            <div className="flex justify-end pt-2 border-t border-slate-800/80 mt-2">
              <button
                type="button"
                onClick={() => {
                  onResetHeatmap();
                  setShowComplexDrawer(false);
                }}
                className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                Reset reading heatmap data
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
