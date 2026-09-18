import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { ReaderSettings, SavedDocument, ReaderDocument } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';
import { InputHub } from './InputHub/InputHub';

interface TextInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentText: string;
  currentTitle: string;
  onApplyText: (text: string, title?: string) => void;
  savedDocuments: SavedDocument[];
  onSaveDocument?: (doc: SavedDocument) => void;
  onDeleteDocument?: (id: string) => void;
  onOpenExtensionHub?: () => void;
  settings: ReaderSettings;
}

export const TextInputModal: React.FC<TextInputModalProps> = ({
  isOpen,
  onClose,
  currentText,
  currentTitle,
  onApplyText,
  savedDocuments,
  onDeleteDocument,
  onOpenExtensionHub,
  settings,
}) => {
  if (!isOpen) return null;

  const theme = THEME_CONFIGS[settings.theme] || THEME_CONFIGS.midnight;
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor] || HIGHLIGHT_COLORS.red;

  const handleImportDocument = (doc: ReaderDocument) => {
    const title = doc.title || doc.fileName || 'Imported Reading';
    onApplyText(doc.content, title);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} shadow-2xl flex flex-col max-h-[92vh] overflow-hidden`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-5 sm:px-6 py-3.5 border-b ${theme.borderClass}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base sm:text-lg font-bold ${theme.textPrimary} flex items-center gap-2`}>
                <span>Universal Text Input Hub</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono hidden sm:inline-block">
                  TXT · MD · PDF · URL
                </span>
              </h3>
              <p className={`text-xs ${theme.textMuted}`}>
                Drop files, paste a URL or article, or select from your library
              </p>
            </div>
          </div>

          <button
            id="close-text-modal-btn"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Universal Input Hub Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          <InputHub
            currentText={currentText}
            currentTitle={currentTitle}
            onImportDocument={handleImportDocument}
            savedDocuments={savedDocuments}
            onDeleteDocument={onDeleteDocument}
            settings={settings}
            onClose={onClose}
            onOpenExtensionHub={onOpenExtensionHub}
          />
        </div>
      </div>
    </div>
  );
};
