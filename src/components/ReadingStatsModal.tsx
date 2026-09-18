import React, { useState, useEffect } from 'react';
import { 
  X, 
  TrendingUp, 
  BookOpen, 
  Clock, 
  Flame, 
  RotateCcw, 
  Calendar,
  Zap,
  Activity,
  Award,
  ChevronRight,
  Layers,
  Sparkles
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';
import { ReaderSettings, ReadingStatsSummary, WpmHistoryPoint } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';

interface ReadingStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  statsSummary: ReadingStatsSummary;
  settings: ReaderSettings;
  currentDocumentTitle: string;
  onClearStats: () => void;
}

export const ReadingStatsModal: React.FC<ReadingStatsModalProps> = ({
  isOpen,
  onClose,
  statsSummary,
  settings,
  currentDocumentTitle,
  onClearStats,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'recent' | 'current'>('all');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format milliseconds into human readable mm:ss or hh:mm
  const formatTime = (ms: number): string => {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hours = Math.floor(mins / 60);

    if (hours > 0) {
      const remMins = mins % 60;
      return `${hours}h ${remMins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Filter WPM history based on selected mode
  let chartData: WpmHistoryPoint[] = statsSummary.wpmHistory;
  if (filterMode === 'recent') {
    chartData = statsSummary.wpmHistory.slice(-10);
  } else if (filterMode === 'current') {
    chartData = statsSummary.wpmHistory.filter(
      (p) => !p.documentTitle || p.documentTitle.toLowerCase() === (currentDocumentTitle || '').toLowerCase()
    );
    if (chartData.length === 0 && statsSummary.currentDocWordsRead > 0) {
      chartData = [{
        id: 'curr_doc_live',
        timestamp: Date.now(),
        dateLabel: 'Current',
        timeLabel: 'Active',
        sessionNumber: 1,
        avgWpm: statsSummary.currentDocAvgWpm,
        targetWpm: settings.wpm,
        wordsRead: statsSummary.currentDocWordsRead,
        dwellSeconds: Math.round(statsSummary.currentDocDwellMs / 1000),
        documentTitle: currentDocumentTitle,
      }];
    }
  }

  // Calculate speed rating badge
  const getSpeedLabel = (wpm: number) => {
    if (wpm >= 600) return { text: '⚡ Hyper Focus', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
    if (wpm >= 450) return { text: '🚀 Sprint Pace', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    if (wpm >= 320) return { text: '✨ Accelerated Flow', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    if (wpm >= 220) return { text: '📖 Steady Flow', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
    return { text: '🔍 Deep Analytical', color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' };
  };

  const speedBadge = getSpeedLabel(statsSummary.overallAverageWpm);

  // Complexity breakdown calculations
  const totalComplexityWords = 
    statsSummary.complexityBreakdown.fastWords +
    statsSummary.complexityBreakdown.steadyWords +
    statsSummary.complexityBreakdown.complexWords;

  const fastPct = totalComplexityWords > 0 
    ? Math.round((statsSummary.complexityBreakdown.fastWords / totalComplexityWords) * 100) 
    : 0;
  const steadyPct = totalComplexityWords > 0 
    ? Math.round((statsSummary.complexityBreakdown.steadyWords / totalComplexityWords) * 100) 
    : 0;
  const complexPct = totalComplexityWords > 0 
    ? Math.max(0, 100 - fastPct - steadyPct) 
    : 0;

  return (
    <div 
      id="reading-stats-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="reading-stats-modal"
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme.borderClass} shrink-0`}>
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-xl border flex items-center justify-center shadow-xs"
              style={{ 
                backgroundColor: `${highlight.hex}15`, 
                borderColor: `${highlight.hex}30`,
                color: highlight.hex 
              }}
            >
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base sm:text-lg font-bold tracking-tight ${theme.textPrimary}`}>
                  Reading Statistics & Analytics
                </h2>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${speedBadge.color}`}>
                  {speedBadge.text}
                </span>
              </div>
              <p className={`text-xs ${theme.textMuted}`}>
                Computed from real-time dwell tracking and session history
              </p>
            </div>
          </div>

          <button
            id="close-reading-stats-btn"
            type="button"
            onClick={onClose}
            aria-label="Close reading statistics modal"
            className={`p-2 rounded-xl border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Top Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Average WPM Over Time */}
            <div 
              id="stat-card-avg-wpm"
              className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} relative overflow-hidden flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                  Average WPM
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${theme.textPrimary}`}>
                    {statsSummary.overallAverageWpm || settings.wpm}
                  </span>
                  <span className="text-xs font-mono font-medium text-emerald-400">
                    WPM
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textMuted} mt-1 truncate`}>
                  Target configured: {settings.wpm} WPM
                </p>
              </div>
            </div>

            {/* 2. Total Words Read */}
            <div 
              id="stat-card-total-words"
              className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} relative overflow-hidden flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                  Total Words Read
                </span>
                <BookOpen className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${theme.textPrimary}`}>
                    {statsSummary.totalWordsRead.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono font-medium text-blue-400">
                    words
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textMuted} mt-1 truncate`}>
                  In doc: {statsSummary.currentDocWordsRead.toLocaleString()} words
                </p>
              </div>
            </div>

            {/* 3. Number of Reading Sessions */}
            <div 
              id="stat-card-sessions-count"
              className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} relative overflow-hidden flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                  Reading Sessions
                </span>
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${theme.textPrimary}`}>
                    {statsSummary.totalSessionsCount}
                  </span>
                  <span className="text-xs font-mono font-medium text-amber-400">
                    {statsSummary.totalSessionsCount === 1 ? 'session' : 'sessions'}
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textMuted} mt-1 truncate`}>
                  {statsSummary.recentSessions.length} logged in history
                </p>
              </div>
            </div>

            {/* 4. Total Cognitive Reading Time */}
            <div 
              id="stat-card-total-dwell"
              className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} relative overflow-hidden flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                  Total Dwell Time
                </span>
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${theme.textPrimary}`}>
                    {formatTime(statsSummary.totalReadingTimeMs)}
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textMuted} mt-1 truncate`}>
                  Active cognitive reading
                </p>
              </div>
            </div>
          </div>

          {/* Average WPM Over Time Chart Section */}
          <div className={`p-4 sm:p-5 rounded-2xl border ${theme.borderClass} ${theme.inputBg} space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm sm:text-base font-bold ${theme.textPrimary}`}>
                    Average WPM Over Time
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Measured Speed Trend
                  </span>
                </div>
                <p className={`text-xs ${theme.textMuted}`}>
                  Tracking speed evolution across consecutive reading sessions
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-black/20 border border-white/5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'all'
                      ? `${highlight.bgBadge} border shadow-xs`
                      : `${theme.textMuted} hover:${theme.textPrimary}`
                  }`}
                >
                  All Sessions ({statsSummary.wpmHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('recent')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'recent'
                      ? `${highlight.bgBadge} border shadow-xs`
                      : `${theme.textMuted} hover:${theme.textPrimary}`
                  }`}
                >
                  Recent 10
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('current')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'current'
                      ? `${highlight.bgBadge} border shadow-xs`
                      : `${theme.textMuted} hover:${theme.textPrimary}`
                  }`}
                >
                  This Document
                </button>
              </div>
            </div>

            {/* Recharts Area Chart Container */}
            <div className="w-full h-64 sm:h-72 pt-2">
              {chartData && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="wpmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={highlight.hex} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={highlight.hex} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="targetGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" vertical={false} />

                    <XAxis 
                      dataKey="dateLabel" 
                      stroke="rgba(148, 163, 184, 0.5)" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                      tickFormatter={(val, i) => {
                        const pt = chartData[i];
                        return pt ? `${val} #${pt.sessionNumber}` : val;
                      }}
                    />

                    <YAxis 
                      stroke="rgba(148, 163, 184, 0.5)" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                      unit=" WPM"
                      domain={['dataMin - 40', 'dataMax + 40']}
                    />

                    <Tooltip 
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload as WpmHistoryPoint;
                        return (
                          <div className={`p-3 rounded-xl border ${theme.borderClass} ${theme.cardBgClass} shadow-xl text-xs space-y-1.5`}>
                            <div className="flex items-center justify-between gap-4 border-b pb-1.5 border-white/10">
                              <span className="font-bold text-white">
                                Session #{data.sessionNumber}
                              </span>
                              <span className="text-slate-400 font-mono">
                                {data.dateLabel} {data.timeLabel}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-400">Measured Speed:</span>
                              <span className="font-mono font-bold text-emerald-400">
                                {data.avgWpm} WPM
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-400">Configured Target:</span>
                              <span className="font-mono font-medium text-blue-400">
                                {data.targetWpm} WPM
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-400">Words Read:</span>
                              <span className="font-mono text-white">
                                {data.wordsRead} words
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-400">Reading Duration:</span>
                              <span className="font-mono text-white">
                                {data.dwellSeconds}s
                              </span>
                            </div>
                            <div className="pt-1 text-[10px] text-slate-400 truncate max-w-[200px]">
                              Doc: {data.documentTitle}
                            </div>
                          </div>
                        );
                      }}
                    />

                    {/* Reference Line for Target WPM */}
                    <ReferenceLine 
                      y={settings.wpm} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4" 
                      strokeOpacity={0.6}
                      label={{ 
                        value: `Target (${settings.wpm})`, 
                        fill: '#ef4444', 
                        fontSize: 10,
                        position: 'insideTopRight'
                      }} 
                    />

                    <Area
                      type="monotone"
                      dataKey="avgWpm"
                      name="Average WPM"
                      stroke={highlight.hex}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#wpmGradient)"
                      activeDot={{ r: 5, fill: highlight.hex, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-xl">
                  <Activity className="w-8 h-8 text-slate-500 mb-2 animate-pulse" />
                  <p className={`text-sm font-semibold ${theme.textPrimary}`}>
                    No reading sessions recorded yet
                  </p>
                  <p className={`text-xs ${theme.textMuted} mt-1 max-w-sm`}>
                    Press Play on any text to start reading. The heatmap hook will record dwell time and chart your average WPM over time!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Dwell Complexity Breakdown (from Heatmap Buckets) */}
          <div className={`p-4 sm:p-5 rounded-2xl border ${theme.borderClass} ${theme.inputBg} space-y-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h3 className={`text-sm sm:text-base font-bold ${theme.textPrimary}`}>
                  Cognitive Dwell & Complexity Profile
                </h3>
              </div>
              <span className={`text-xs ${theme.textMuted}`}>
                Based on word dwell times & cognitive load
              </span>
            </div>

            {/* Segmented Distribution Bar */}
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-black/40 border border-white/5">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500" 
                style={{ width: `${fastPct}%` }}
                title={`Smooth / Fast: ${fastPct}%`}
              />
              <div 
                className="h-full bg-amber-500 transition-all duration-500" 
                style={{ width: `${steadyPct}%` }}
                title={`Steady Flow: ${steadyPct}%`}
              />
              <div 
                className="h-full bg-rose-500 transition-all duration-500" 
                style={{ width: `${complexPct}%` }}
                title={`Deep Focus / Complex: ${complexPct}%`}
              />
            </div>

            {/* Legend Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-emerald-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-emerald-400 block truncate">
                    Smooth Flow ({fastPct}%)
                  </span>
                  <span className={`text-[11px] ${theme.textMuted}`}>
                    {statsSummary.complexityBreakdown.fastWords} words read swiftly
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-amber-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-amber-400 block truncate">
                    Steady Pace ({steadyPct}%)
                  </span>
                  <span className={`text-[11px] ${theme.textMuted}`}>
                    {statsSummary.complexityBreakdown.steadyWords} words at normal tempo
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-rose-500/20">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-rose-400 block truncate">
                    Deep Focus ({complexPct}%)
                  </span>
                  <span className={`text-[11px] ${theme.textMuted}`}>
                    {statsSummary.complexityBreakdown.complexWords} words re-read or paused
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Reading Sessions History List */}
          <div className={`p-4 sm:p-5 rounded-2xl border ${theme.borderClass} ${theme.inputBg} space-y-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <h3 className={`text-sm sm:text-base font-bold ${theme.textPrimary}`}>
                  Reading Sessions History
                </h3>
              </div>
              <span className={`text-xs ${theme.textMuted}`}>
                {statsSummary.recentSessions.length} total recorded
              </span>
            </div>

            {statsSummary.recentSessions.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {statsSummary.recentSessions.map((session, index) => (
                  <div
                    key={session.id || `session-${index}`}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border ${theme.borderClass} bg-black/20 hover:bg-black/30 transition-colors gap-2`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10 font-mono font-bold text-xs text-white shrink-0">
                        <span>#{statsSummary.recentSessions.length - index}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className={`text-xs font-semibold ${theme.textPrimary} truncate`}>
                          {session.documentTitle || 'Untitled Reading'}
                        </h4>
                        <p className={`text-[11px] ${theme.textMuted}`}>
                          {session.dateLabel} • {formatTime(session.dwellMs)} duration
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <span className={`text-xs font-mono font-bold ${theme.textPrimary} block`}>
                          {session.wordsRead} words
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Target: {session.targetWpm} WPM
                        </span>
                      </div>
                      <span 
                        className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold border shadow-xs"
                        style={{
                          backgroundColor: `${highlight.hex}15`,
                          borderColor: `${highlight.hex}30`,
                          color: highlight.hex,
                        }}
                      >
                        {session.averageWpm} WPM
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-xs ${theme.textMuted} italic py-2`}>
                No completed reading sessions yet. Sessions are recorded automatically when you read and pause.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`flex items-center justify-between px-6 py-3 border-t ${theme.borderClass} ${theme.accentSurface} shrink-0`}>
          <div>
            {showConfirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-medium">
                  Clear all recorded reading stats?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClearStats();
                    setShowConfirmReset(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                >
                  Yes, Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(false)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium ${theme.textMuted} hover:${theme.textPrimary}`}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmReset(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Statistics</span>
              </button>
            )}
          </div>

          <button
            id="done-reading-stats-btn"
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-white font-semibold text-xs transition-transform active:scale-95 shadow-md"
            style={{ backgroundColor: highlight.hex }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
