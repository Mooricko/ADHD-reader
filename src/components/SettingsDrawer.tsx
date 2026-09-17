import React, { useState, useEffect } from 'react';
import { 
  X, 
  Type, 
  Palette, 
  Eye, 
  Sliders, 
  Volume2, 
  VolumeX,
  Crosshair, 
  Check,
  RotateCcw,
  Sparkles,
  Zap,
  Headphones,
  Mic,
  Play,
  PlayCircle,
  Sun,
  Moon,
  Timer,
  BellOff,
  Bell
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
import { speechNarrator, VoiceOption } from '../utils/speechNarration';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: Partial<ReaderSettings>) => void;
  onResetDefaults: () => void;
  onOpenTimerModal?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetDefaults,
  onOpenTimerModal,
}) => {
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const isSpeechSupported = speechNarrator.isSupported();

  useEffect(() => {
    if (!isSpeechSupported) return;
    setAvailableVoices(speechNarrator.getVoices());
    const unsub = speechNarrator.onVoicesChanged(() => {
      setAvailableVoices(speechNarrator.getVoices());
    });
    return unsub;
  }, [isSpeechSupported]);

  const handlePreviewVoice = () => {
    if (!isSpeechSupported) return;
    setIsPreviewPlaying(true);
    speechNarrator.previewVoice(
      settings.speechVoiceURI,
      settings.speechPitch,
      speechNarrator.computeSpeechRate(settings.wpm, settings.speechRateMultiplier),
      settings.speechVolume
    );
    setTimeout(() => {
      setIsPreviewPlaying(false);
    }, 2800);
  };

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

          {/* 3. Theme Selector & Dark/Light Mode */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
                Color Mode & Theme
              </label>
              <span className={`text-[11px] font-mono ${theme.textMuted}`}>
                {settings.theme === 'light' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </div>

            {/* Dark / Light Mode Segmented Toggle */}
            <div className={`grid grid-cols-2 p-1 rounded-xl border ${theme.borderClass} ${theme.accentSurface} gap-1`}>
              <button
                type="button"
                id="settings-dark-mode-btn"
                onClick={() => {
                  if (settings.theme === 'light') {
                    onUpdateSettings({ theme: 'midnight' });
                  }
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  settings.theme !== 'light'
                    ? 'bg-slate-900 text-white shadow-xs border border-white/10'
                    : `${theme.textMuted} hover:${theme.textPrimary}`
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span>Dark Mode</span>
              </button>

              <button
                type="button"
                id="settings-light-mode-btn"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  settings.theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : `${theme.textMuted} hover:${theme.textPrimary}`
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Light Mode</span>
              </button>
            </div>

            {/* Palette Presets */}
            <div className="grid grid-cols-2 gap-2 pt-1">
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

          {/* 5. Font Size Sliders (RSVP and Full Text Flow) */}
          <div className="space-y-4">
            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold uppercase tracking-wider ${theme.textMuted}`}>
                  Full Text Flow Word Size
                </span>
                <span className={`font-mono font-bold ${theme.textPrimary}`}>
                  {settings.flowFontSize || 22}px
                </span>
              </div>
              <input
                id="flow-font-size-slider"
                type="range"
                min="14"
                max="48"
                step="2"
                value={settings.flowFontSize || 22}
                onChange={(e) => onUpdateSettings({ flowFontSize: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-red-500"
              />
            </div>
          </div>

          {/* 6. Focus & Optical Alignment Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-700/30">
            <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
              Focus Guides & RSVP Chunks
            </label>

            {/* Words per Flash (1, 3, or 5 Words) */}
            <div className={`p-3 rounded-xl border ${theme.borderClass} ${theme.accentSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                    RSVP Words Per Flash
                  </div>
                  <div className={`text-[11px] ${theme.textMuted}`}>
                    Choose 1, 3, or 5 words shown at once with smooth transitions
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-red-500">
                  {settings.chunkSize || 1} {settings.chunkSize === 1 ? 'word' : 'words'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                {([1, 3, 5] as const).map((count) => {
                  const isSelected = (settings.chunkSize || 1) === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onUpdateSettings({ chunkSize: count })}
                      className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center ${
                        isSelected
                          ? `${highlight.bgBadge} border shadow-xs`
                          : `${theme.borderClass} bg-black/20 ${theme.textMuted} hover:${theme.textPrimary}`
                      }`}
                      style={isSelected ? { borderColor: highlight.hex, color: highlight.hex } : undefined}
                    >
                      <span className="text-sm">{count}</span>
                      <span className="text-[10px] opacity-75 font-normal">
                        {count === 1 ? 'Single' : count === 3 ? 'Triad' : 'Clause'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paragraph Focus Blur Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div>
                <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Paragraph Focus Blur
                </div>
                <div className={`text-[11px] ${theme.textMuted}`}>
                  Blurs text flow and unblurs only active or hovered paragraph
                </div>
              </div>
              <input
                id="toggle-paragraph-blur-settings"
                type="checkbox"
                checked={settings.focusParagraphBlur}
                onChange={(e) => onUpdateSettings({ focusParagraphBlur: e.target.checked })}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
            </div>

            {/* RSVP Words Shown & Horizontal Reel Mode */}
            <div className="p-3 rounded-xl border border-white/5 bg-black/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                    RSVP Words Shown (Horizontal Swipe Reel)
                  </div>
                  <div className={`text-[11px] ${theme.textMuted}`}>
                    Aligns last, current, and next words horizontally and swipes as voice reads
                  </div>
                </div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                  {settings.chunkSize || 1} {settings.chunkSize === 1 ? 'word' : 'words'}
                </span>
              </div>

              <div className={`grid grid-cols-3 p-1 rounded-xl border ${theme.borderClass} ${theme.accentSurface} gap-1`}>
                {([1, 3, 5] as const).map((count) => {
                  const isSelected = (settings.chunkSize || 1) === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onUpdateSettings({ chunkSize: count })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'text-white shadow-xs'
                          : `${theme.textMuted} hover:${theme.textPrimary}`
                      }`}
                      style={isSelected ? { backgroundColor: highlight.hex } : undefined}
                    >
                      <span className="font-bold">{count} {count === 1 ? 'Word' : 'Words'}</span>
                      <span className="text-[9px] opacity-80 font-normal">
                        {count === 1 ? 'Single' : count === 3 ? 'Last / Now / Next' : '5 Words Reel'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

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

            {/* Liquid Text Morph Transition */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div>
                <div className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Liquid Text Morph Transition
                </div>
                <div className={`text-[11px] ${theme.textMuted}`}>
                  SVG threshold cross-blur animation between RSVP words
                </div>
              </div>
              <input
                id="toggle-morph-transition"
                type="checkbox"
                checked={settings.morphTransition}
                onChange={(e) => onUpdateSettings({ morphTransition: e.target.checked })}
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

          {/* 7. Web Speech API Audio Narration (Voice-Over) */}
          <div className="space-y-3 pt-2 border-t border-slate-700/30">
            <div className="flex items-center justify-between">
              <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
                Audio Narration (Web Speech API)
              </label>
              {isSpeechSupported ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  API Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Not Supported
                </span>
              )}
            </div>

            {/* Primary Voice-Over Toggle */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              settings.speechNarration 
                ? 'border-red-500/40 bg-red-500/5 shadow-xs' 
                : 'border-white/5 bg-black/10'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg ${
                    settings.speechNarration 
                      ? 'bg-red-500 text-white shadow-xs' 
                      : `${theme.accentSurface} ${theme.textMuted}`
                  }`}>
                    <Headphones className="w-4 h-4" />
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${theme.textPrimary}`}>
                      Voice-Over Narration
                    </div>
                    <div className={`text-[11px] ${theme.textMuted}`}>
                      Reads words aloud in sync with visual RSVP playback
                    </div>
                  </div>
                </div>

                <input
                  id="toggle-voice-narration"
                  type="checkbox"
                  disabled={!isSpeechSupported}
                  checked={settings.speechNarration}
                  onChange={(e) => onUpdateSettings({ speechNarration: e.target.checked })}
                  className="w-5 h-5 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0 cursor-pointer disabled:opacity-40"
                />
              </div>

              {settings.speechNarration && (
                <div className="mt-4 pt-3 border-t border-slate-700/30 space-y-4 animate-in fade-in duration-200">
                  {/* Voice Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${theme.textMuted}`}>
                        Selected Voice Provider
                      </span>
                      <button
                        id="test-voice-preview-btn"
                        type="button"
                        onClick={handlePreviewVoice}
                        disabled={isPreviewPlaying}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{isPreviewPlaying ? 'Speaking...' : 'Test Voice (تست صدا)'}</span>
                      </button>
                    </div>

                    {(() => {
                      const farsiVoices = availableVoices.filter(
                        (v) => v.isFarsi || v.lang.startsWith('fa') || v.voiceURI.startsWith('farsi-')
                      );
                      const otherVoices = availableVoices.filter(
                        (v) => !v.isFarsi && !v.lang.startsWith('fa') && !v.voiceURI.startsWith('farsi-')
                      );

                      return (
                        <select
                          id="speech-voice-select"
                          value={settings.speechVoiceURI || ''}
                          onChange={(e) => onUpdateSettings({ speechVoiceURI: e.target.value })}
                          aria-label="Select Voice"
                          className={`w-full p-2.5 rounded-xl border text-xs font-medium ${theme.borderClass} ${theme.inputBg} ${theme.textPrimary} focus:outline-none focus:border-red-500 transition-colors cursor-pointer`}
                        >
                          <option value="">Default System Voice (Auto-detect Language)</option>
                          {farsiVoices.length > 0 && (
                            <optgroup label="🇮🇷 Farsi / Persian Voices (گویندگان فارسی)">
                              {farsiVoices.map((v) => (
                                <option key={v.voiceURI} value={v.voiceURI}>
                                  {v.name} ({v.lang}) — {v.provider}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherVoices.length > 0 && (
                            <optgroup label="🌐 English & System Voices">
                              {otherVoices.map((v) => (
                                <option key={v.voiceURI} value={v.voiceURI}>
                                  {v.name} ({v.lang}) — {v.provider}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      );
                    })()}

                    {/* Farsi Optimal Preset Quick Action */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({
                          fontFamily: 'vazirmatn',
                          speechVoiceURI: 'farsi-webspeech-cloud',
                          speechNarration: true,
                          highlightStyle: 'middle-two',
                        })}
                        className="text-[11px] font-medium text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 underline underline-offset-2"
                      >
                        <span>🇮🇷 بهینه‌سازی سریع برای فارسی (Apply Farsi Font & Voice)</span>
                      </button>
                    </div>
                  </div>

                  {/* Voice Pitch & Volume Sliders */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Pitch */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${theme.textMuted}`}>Pitch</span>
                        <span className={`font-mono font-bold ${theme.textPrimary}`}>
                          {settings.speechPitch.toFixed(1)}x
                        </span>
                      </div>
                      <input
                        id="speech-pitch-slider"
                        type="range"
                        min="0.6"
                        max="1.4"
                        step="0.1"
                        value={settings.speechPitch}
                        onChange={(e) => onUpdateSettings({ speechPitch: parseFloat(e.target.value) })}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-red-500"
                      />
                    </div>

                    {/* Volume */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${theme.textMuted}`}>Volume</span>
                        <span className={`font-mono font-bold ${theme.textPrimary}`}>
                          {Math.round(settings.speechVolume * 100)}%
                        </span>
                      </div>
                      <input
                        id="speech-volume-slider"
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={settings.speechVolume}
                        onChange={(e) => onUpdateSettings({ speechVolume: parseFloat(e.target.value) })}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-red-500"
                      />
                    </div>
                  </div>

                  {/* RSVP Speed Synchronization Info */}
                  <div className="p-2.5 rounded-lg bg-black/25 border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-300">RSVP Synchronization</span>
                      <span className="font-mono font-bold text-red-400">
                        {settings.wpm} WPM ({speechNarrator.computeSpeechRate(settings.wpm, settings.speechRateMultiplier)}x rate)
                      </span>
                    </div>
                    <p className={`text-[10px] ${theme.textMuted} leading-relaxed`}>
                      Speech synthesis speed automatically tracks your RSVP WPM, locking vocal word boundaries to the center visual highlight.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 8. Focus Timer & Do Not Disturb */}
          <div className="space-y-3 pt-2 border-t border-slate-700/30">
            <div className="flex items-center justify-between">
              <label className={`block text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>
                Focus Sessions & Do Not Disturb
              </label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                ADHD Flow
              </span>
            </div>

            {/* Do Not Disturb Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/10">
              <div className="flex items-center gap-2.5 pr-2">
                <div className={`p-2 rounded-lg ${settings.doNotDisturb ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-slate-400'}`}>
                  {settings.doNotDisturb ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </div>
                <div>
                  <div className={`text-xs font-semibold ${theme.textPrimary} flex items-center gap-1.5`}>
                    <span>Do Not Disturb During Timer</span>
                    {settings.doNotDisturb && (
                      <span className="text-[10px] px-1 rounded bg-red-500/20 text-red-400 font-mono font-bold">
                        ON
                      </span>
                    )}
                  </div>
                  <div className={`text-[11px] ${theme.textMuted}`}>
                    Silences all toast popups, alerts, and sound effects while focus timer is running
                  </div>
                </div>
              </div>
              <input
                id="toggle-dnd-settings"
                type="checkbox"
                checked={settings.doNotDisturb}
                onChange={(e) => onUpdateSettings({ doNotDisturb: e.target.checked })}
                className="w-4 h-4 rounded text-red-500 focus:ring-red-500 focus:ring-offset-0 shrink-0"
              />
            </div>

            {/* Open Focus Timer Button */}
            {onOpenTimerModal && (
              <button
                id="drawer-open-timer-btn"
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTimerModal();
                }}
                className={`w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border ${theme.borderClass} ${theme.accentSurface} ${theme.textPrimary} hover:border-red-500/40 text-xs font-semibold transition-all shadow-xs`}
              >
                <Timer className="w-4 h-4 text-red-500" />
                <span>Open Reading Focus Timer & Sessions</span>
              </button>
            )}
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
