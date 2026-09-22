import React from 'react';
import { 
  BookOpen, 
  Settings, 
  FileText, 
  Maximize2, 
  Minimize2, 
  Sparkles, 
  HelpCircle,
  Eye,
  AlignLeft,
  Puzzle,
  Zap,
  Sun,
  Moon,
  Timer,
  BellOff,
  Activity,
  Layers
} from 'lucide-react';
import { ReaderSettings, ReaderViewMode } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';

interface HeaderProps {
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  viewMode: ReaderViewMode;
  onToggleViewMode: (mode: ReaderViewMode) => void;
  onOpenTextInput: () => void;
  onOpenOverview?: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenExtensionHub: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  currentTitle: string;
  isIdle?: boolean;
  timerFormatted?: string;
  isTimerRunning?: boolean;
  isTimerSet?: boolean;
  onOpenTimerModal?: () => void;
  onOpenStatsModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  viewMode,
  onToggleViewMode,
  onOpenTextInput,
  onOpenOverview,
  onOpenSettings,
  onOpenShortcuts,
  onOpenExtensionHub,
  isFullscreen,
  onToggleFullscreen,
  currentTitle,
  isIdle = false,
  timerFormatted = '00:00',
  isTimerRunning = false,
  isTimerSet = false,
  onOpenTimerModal,
  onOpenStatsModal,
}) => {
  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];

  return (
    <header
      id="app-header"
      className={`w-full border-b ${theme.borderClass} ${theme.cardBgClass} px-4 py-3 sm:px-6 transition-all duration-700 ease-out z-30 shrink-0 ${
        isIdle ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand & Document Name */}
        <div className="flex items-center gap-3 min-w-0">
          <div 
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 shrink-0 font-bold text-base shadow-xs"
            title="ADHD Reader"
          >
            <span>re<span className="text-red-500">ad</span></span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className={`text-base sm:text-lg font-bold tracking-tight ${theme.textPrimary} truncate`}>
                ADHD Reader
              </h1>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                RSVP + Middle Focus
              </span>
            </div>
            <p className={`text-xs ${theme.textMuted} truncate max-w-[200px] sm:max-w-xs md:max-w-md`}>
              {currentTitle}
            </p>
          </div>
        </div>

        {/* Center / Mode Switcher */}
        <div className="hidden sm:flex items-center p-1 rounded-xl bg-black/20 border border-white/5">
          <button
            id="view-mode-rsvp-btn"
            type="button"
            onClick={() => onToggleViewMode('rsvp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'rsvp'
                ? `${highlight.bgBadge} border shadow-xs`
                : `${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Word by Word (RSVP)</span>
          </button>
          <button
            id="view-mode-flow-btn"
            type="button"
            onClick={() => onToggleViewMode('flow')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'flow'
                ? `${highlight.bgBadge} border shadow-xs`
                : `${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>Full Text Flow</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Document Overview, Contents & Map Button */}
          {onOpenOverview && (
            <button
              id="open-document-overview-btn"
              type="button"
              onClick={onOpenOverview}
              title="Document Overview, Map & Contents (O)"
              aria-label="Document Overview & Contents"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-all shadow-xs`}
            >
              <Layers className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden lg:inline">Overview & Contents</span>
              <span className="lg:hidden hidden sm:inline">Overview</span>
            </button>
          )}

          {/* Reading Statistics & Analytics Button */}
          {onOpenStatsModal && (
            <button
              id="open-stats-modal-btn"
              type="button"
              onClick={onOpenStatsModal}
              title="Reading Statistics & Heatmap Analytics (Average WPM, words read, sessions)"
              aria-label="Reading Statistics"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-all shadow-xs`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Stats</span>
            </button>
          )}

          {/* Focus Timer Button */}
          {onOpenTimerModal && (
            <button
              id="open-timer-modal-btn"
              type="button"
              onClick={onOpenTimerModal}
              title={isTimerSet ? `Focus Session: ${timerFormatted} remaining (Click to configure)` : 'Start Focus Timer'}
              aria-label="Focus Timer"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                isTimerSet
                  ? `${highlight.bgBadge} border font-mono shadow-xs`
                  : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface}`
              }`}
            >
              <Timer className={`w-3.5 h-3.5 ${isTimerRunning ? 'animate-pulse text-red-500' : ''}`} />
              <span className={isTimerSet ? 'font-mono' : 'hidden md:inline'}>
                {isTimerSet ? timerFormatted : 'Timer'}
              </span>
              {isTimerSet && settings.doNotDisturb && (
                <span title="Do Not Disturb Active">
                  <BellOff className="w-3 h-3 text-red-400" />
                </span>
              )}
            </button>
          )}

          {/* Dark / Light Mode Toggle Button */}
          <button
            id="toggle-dark-light-theme-btn"
            type="button"
            onClick={() => {
              const nextTheme = settings.theme === 'light' ? 'midnight' : 'light';
              onUpdateSettings({ theme: nextTheme });
            }}
            title={settings.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle Dark/Light Mode"
            className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            {settings.theme === 'light' ? (
              <Moon className="w-4 h-4 text-slate-700" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>

          {/* Chrome Extension & Webpage Capture Hub */}
          <button
            id="open-extension-hub-btn"
            type="button"
            onClick={onOpenExtensionHub}
            title="Chrome Extension & Web Selection Capture (Manifest V3)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors text-xs font-semibold shadow-xs"
          >
            <Puzzle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Web Capture & Extension</span>
            <span className="sm:hidden">Extension</span>
          </button>

          {/* Change Text / Library Button */}
          <button
            id="open-text-input-btn"
            type="button"
            onClick={onOpenTextInput}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} transition-colors text-xs font-medium`}
          >
            <FileText className="w-4 h-4 text-red-500" />
            <span className="hidden xs:inline">Select Text</span>
          </button>

          {/* Settings Drawer Button */}
          <button
            id="open-settings-btn"
            type="button"
            onClick={onOpenSettings}
            title="Reader Customization & Typography"
            aria-label="Open Settings"
            className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Shortcuts Info Button */}
          <button
            id="open-shortcuts-btn"
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts"
            aria-label="Keyboard Shortcuts"
            className={`hidden sm:flex p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Fullscreen Mode Button */}
          <button
            id="toggle-fullscreen-btn"
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Distraction-Free Fullscreen'}
            aria-label="Toggle Fullscreen"
            className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
