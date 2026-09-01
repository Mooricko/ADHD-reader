import React from 'react';
import { 
  X, 
  Type, 
  Palette, 
  Eye, 
  Sliders, 
  Volume2, 
  Crosshair, 
  Check,
  RotateCcw,
  Sparkles,
  Zap
} from 'lucide-react';
import { 
  ReaderSettings, 
  HighlightColor, 
  HighlightStyle, 
  ThemeId, 
  FontFamily 
} from '../types';
import { 
  THEME_CONFIGS, 
  HIGHLIGHT_COLORS, 
  FONT_CONFIGS 
} from '../utils/themeStyles';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  onResetDefaults: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetDefaults,
}) => {
  if (!isOpen) return null;

  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-md h-full ${theme.cardBgClass} border-l ${theme.borderClass} shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme.borderClass}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${theme.textPrimary}`}>
                Reading Settings
              </h3>
              <p className={`text-xs ${theme.textMuted}`}>
                Tune highlights, fonts, and pacing for maximum focus
              </p>
            </div>
          </div>

          <button
            id="close-settings-drawer-btn"
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* 1. Highlight Color Selector */}
          <div className="space-y-2.5">
            <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              Highlight Color
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((colKey) => {
                const col = HIGHLIGHT_COLORS[colKey];
                const isSelected = settings.highlightColor === colKey;
                return (
                  <button
                    key={colKey}
                    type="button"
                    onClick={() => onUpdateSettings({ highlightColor: colKey })}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold transition-all ${
                      isSelected
                        ? `${col.bgBadge} border font-bold shadow-xs`
                        : `${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface}`
                    }`}
                  >
                    <div 
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: col.hex }}
                    />
                    <span className="truncate">{col.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Highlight Mode / Algorithm */}
          <div className="space-y-2.5">
            <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              Highlight Pattern
            </label>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  id: 'middle-two' as HighlightStyle,
                  label: 'Two Middle Letters (Requested)',
                  example: 're[ad]er',
                  desc: 'Locks vision onto the center 2 characters of each word',
                },
                {
                  id: 'middle-single' as HighlightStyle,
                  label: 'Single Middle Letter',
                  example: 'fo[c]us',
                  desc: 'Pinpoint focus at the exact mathematical center',
                },
                {
                  id: 'bionic-prefix' as HighlightStyle,
                  label: 'Bionic Prefix Guide',
                  example: '[rea]der',
                  desc: 'Highlights the first 40% to initiate rapid word recognition',
                },
              ].map((styleOpt) => {
                const isSelected = settings.highlightStyle === styleOpt.id;
                return (
                  <button
                    key={styleOpt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ highlightStyle: styleOpt.id })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? `${highlight.bgBadge} border shadow-xs`
                        : `${theme.borderClass} ${theme.accentSurface} hover:border-slate-500/40`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${isSelected ? highlight.textClass : theme.textPrimary}`}>
                        {styleOpt.label}
                      </span>
                      <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-black/20 text-red-400">
                        {styleOpt.example}
                      </span>
                    </div>
                    <p className={`text-[11px] ${theme.textMuted}`}>
                      {styleOpt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Theme Selector */}
          <div className="space-y-2.5">
            <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              Color Theme & Contrast
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(THEME_CONFIGS) as ThemeId[]).map((themeKey) => {
                const thm = THEME_CONFIGS[themeKey];
                const isSelected = settings.theme === themeKey;
                return (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: themeKey })}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      isSelected
                        ? `border-red-500 ring-2 ring-red-500/30 ${thm.cardBgClass}`
                        : `${theme.borderClass} ${theme.accentSurface} ${theme.textMuted} hover:${theme.textPrimary}`
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: thm.hexBg }}
                      />
                      <span className={theme.textPrimary}>{thm.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-red-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Font Family Selector */}
          <div className="space-y-2.5">
            <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              ADHD & Dyslexia Friendly Fonts
            </label>
            <div className="space-y-1.5">
              {(Object.keys(FONT_CONFIGS) as FontFamily[]).map((fontKey) => {
                const f = FONT_CONFIGS[fontKey];
                const isSelected = settings.fontFamily === fontKey;
                return (
                  <button
                    key={fontKey}
                    type="button"
                    onClick={() => onUpdateSettings({ fontFamily: fontKey })}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? `${highlight.bgBadge} border font-bold shadow-xs`
                        : `${theme.borderClass} ${theme.accentSurface} hover:border-slate-500/40`
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-semibold ${f.className} ${theme.textPrimary}`}>
                        {f.name}
                      </div>
                      <div className={`text-[11px] ${theme.textMuted}`}>
                        {f.description}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-red-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Font Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-bold uppercase tracking-wider ${theme.textMuted}`}>
                RSVP Word Size
              </span>
              <span className={`font-mono font-bold ${theme.textPrimary}`}>
                {settings.fontSize}px
              </span>
            </div>
            <input
              id="rsvp-font-size-slider"
              type="range"
              min="32"
              max="96"
              step="2"
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ fontSize: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-red-500"
            />
          </div>

          {/* 6. Focus & Optical Alignment Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-700/30">
            <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              Focus Guides & Anchors
            </label>

            {/* Optical Center Lock */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div>
                <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Optical Center Lock (ORP)
                </div>
                <div className={`text-[11px] ${theme.textMuted}`}>
                  Locks highlighted letters to exact fixed horizontal center
                </div>
              </div>
              <input
                id="toggle-optical-center"
                type="checkbox"
                checked={settings.opticalCenterLock}
                onChange={(e) => onUpdateSettings({ opticalCenterLock: e.target.checked })}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
            </div>

            {/* Reticle Guides */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div>
                <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Center Focus Reticles
                </div>
                <div className={`text-[11px] ${theme.textMuted}`}>
                  Top & bottom guide ticks pointing to highlight
                </div>
              </div>
              <input
                id="toggle-reticle-guides"
                type="checkbox"
                checked={settings.showReticleGuides}
                onChange={(e) => onUpdateSettings({ showReticleGuides: e.target.checked })}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
            </div>

            {/* Smart Punctuation Pauses */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div>
                <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Natural Punctuation Pauses
                </div>
                <div className={`text-[11px] ${theme.textMuted}`}>
                  Briefly pauses at periods, commas, and paragraphs
                </div>
              </div>
              <input
                id="toggle-smart-pauses"
                type="checkbox"
                checked={settings.smartPunctuationPause}
                onChange={(e) => onUpdateSettings({ smartPunctuationPause: e.target.checked })}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
            </div>

            {/* Metronome Sound Tick */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div>
                <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Rhythmic Focus Metronome
                </div>
                <div className={`text-[11px] ${theme.textMuted}`}>
                  Subtle wooden tick to anchor ADHD rhythm
                </div>
              </div>
              <input
                id="toggle-metronome-sound"
                type="checkbox"
                checked={settings.metronomeSound}
                onChange={(e) => onUpdateSettings({ metronomeSound: e.target.checked })}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
            </div>
          </div>
        </div>

        {/* Footer with Reset Defaults */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${theme.borderClass} ${theme.accentSurface}`}>
          <button
            id="reset-settings-defaults-btn"
            type="button"
            onClick={onResetDefaults}
            className={`flex items-center gap-1.5 text-xs font-medium ${theme.textMuted} hover:${theme.textPrimary} transition-colors`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
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
