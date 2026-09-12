import React from 'react';
import { X, Command, Keyboard } from 'lucide-react';
import { ReaderSettings } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  if (!isOpen) return null;

  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];

  const shortcuts = [
    { key: 'Space', desc: 'Play / Pause reader' },
    { key: '← Left Arrow', desc: 'Rewind 10 words' },
    { key: '→ Right Arrow', desc: 'Jump forward 10 words' },
    { key: '↑ Up Arrow', desc: 'Increase reading speed (+25 WPM)' },
    { key: '↓ Down Arrow', desc: 'Decrease reading speed (-25 WPM)' },
    { key: 'R', desc: 'Restart reading from the beginning' },
    { key: 'F', desc: 'Toggle Fullscreen distraction-free mode' },
    { key: 'M', desc: 'Switch between RSVP and Full Text Flow mode' },
    { key: 'S', desc: 'Toggle Metronome focus sound' },
    { key: 'V', desc: 'Toggle Voice-Over Narration (Web Speech API)' },
    { key: 'Esc', desc: 'Close modals / Exit Fullscreen' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-lg rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} shadow-2xl overflow-hidden`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme.borderClass}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${theme.textPrimary}`}>
                Keyboard Shortcuts
              </h3>
              <p className={`text-xs ${theme.textMuted}`}>
                Control reading flow without touching your mouse
              </p>
            </div>
          </div>

          <button
            id="close-shortcuts-modal-btn"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-2.5 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((sc, i) => (
            <div 
              key={i}
              className={`flex items-center justify-between p-2.5 rounded-xl border ${theme.borderClass} ${theme.inputBg}`}
            >
              <span className={`text-xs font-medium ${theme.textPrimary}`}>
                {sc.desc}
              </span>
              <kbd 
                className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg border bg-black/30 text-red-400 border-white/10 shadow-xs"
              >
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className={`flex justify-end px-6 py-3 border-t ${theme.borderClass} ${theme.accentSurface}`}>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-white font-semibold text-xs transition-transform active:scale-95 shadow-md"
            style={{ backgroundColor: highlight.hex }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
