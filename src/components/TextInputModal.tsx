import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  Sparkles, 
  FileText, 
  Clock, 
  Check, 
  Trash2, 
  BookOpen, 
  Clipboard,
  History,
  Layers,
  Puzzle,
  Zap
} from 'lucide-react';
import { ReaderSettings, SavedDocument } from '../types';
import { SAMPLE_TEXTS } from '../data/sampleTexts';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';
import { calculateTextStats, isRtlText } from '../utils/textParser';
import { captureActiveTabText, isChromeExtensionEnvironment } from '../utils/extensionBridge';

interface TextInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentText: string;
  currentTitle: string;
  onApplyText: (text: string, title?: string) => void;
  savedDocuments: SavedDocument[];
  onSaveDocument: (doc: SavedDocument) => void;
  onDeleteDocument: (id: string) => void;
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
  const [activeTab, setActiveTab] = useState<'custom' | 'samples' | 'history'>('custom');
  const [inputText, setInputText] = useState(currentText);
  const [inputTitle, setInputTitle] = useState(currentTitle);
  const [copySuccess, setCopySuccess] = useState(false);

  if (!isOpen) return null;

  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];
  const stats = calculateTextStats(inputText, settings.wpm);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        if (!inputTitle || inputTitle === 'Quick Paste') {
          const firstLine = text.trim().split('\n')[0].slice(0, 40);
          setInputTitle(firstLine || 'Pasted Document');
        }
      }
    } catch {
      // Clipboard permissions denied
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText(content);
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setInputTitle(fileNameWithoutExt);
      }
    };
    reader.readAsText(file);
  };

  const handleSelectSample = (sample: SavedDocument) => {
    setInputText(sample.text);
    setInputTitle(sample.title);
    onApplyText(sample.text, sample.title);
    onClose();
  };

  const handleSelectHistory = (doc: SavedDocument) => {
    setInputText(doc.text);
    setInputTitle(doc.title);
    onApplyText(doc.text, doc.title);
    onClose();
  };

  const handleApply = () => {
    if (!inputText.trim()) return;
    const finalTitle = inputTitle.trim() || 'Custom Reading';
    onApplyText(inputText.trim(), finalTitle);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} shadow-2xl flex flex-col max-h-[90vh] overflow-hidden`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme.borderClass}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base sm:text-lg font-bold ${theme.textPrimary}`}>
                Select or Paste Text
              </h3>
              <p className={`text-xs ${theme.textMuted}`}>
                Choose a curated article, upload a file, or paste your own content
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

        {/* Tab Navigation */}
        <div className={`flex items-center px-6 pt-3 border-b ${theme.borderClass} gap-4`}>
          <button
            id="tab-custom-text-btn"
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'custom'
                ? 'border-red-500 text-red-500'
                : `border-transparent ${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Custom Text</span>
          </button>

          <button
            id="tab-samples-btn"
            type="button"
            onClick={() => setActiveTab('samples')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'samples'
                ? 'border-red-500 text-red-500'
                : `border-transparent ${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ADHD Curated Texts</span>
          </button>

          {savedDocuments.length > 0 && (
            <button
              id="tab-history-btn"
              type="button"
              onClick={() => setActiveTab('history')}
              className={`pb-3 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-red-500 text-red-500'
                  : `border-transparent ${theme.textMuted} hover:${theme.textPrimary}`
              }`}
            >
              <History className="w-4 h-4" />
              <span>Saved History ({savedDocuments.length})</span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'custom' && (
            <div className="space-y-4">
              {/* Document Title Input */}
              <div>
                <label className={`block text-xs font-semibold ${theme.textMuted} mb-1`}>
                  Document Title (Optional)
                </label>
                <input
                  id="document-title-input"
                  type="text"
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  placeholder="e.g. My Article / Chapter 1"
                  className={`w-full px-3 py-2 rounded-xl border ${theme.borderClass} ${theme.inputBg} ${theme.textPrimary} text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50`}
                />
              </div>

              {/* Main Text Area */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-xs font-semibold ${theme.textMuted}`}>
                    Paste Content
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    {onOpenExtensionHub && (
                      <button
                        id="webpage-capture-modal-btn"
                        type="button"
                        onClick={onOpenExtensionHub}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 font-semibold hover:bg-red-500/20 transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Capture from Webpage</span>
                      </button>
                    )}

                    <button
                      id="paste-clipboard-btn"
                      type="button"
                      onClick={handlePasteClipboard}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
                    >
                      <Clipboard className="w-3.5 h-3.5 text-red-500" />
                      <span>Paste from Clipboard</span>
                    </button>

                    <label 
                      htmlFor="text-file-upload" 
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface} transition-colors cursor-pointer`}
                    >
                      <Upload className="w-3.5 h-3.5 text-red-500" />
                      <span>Upload File (.txt, .md)</span>
                    </label>
                    <input
                      id="text-file-upload"
                      type="file"
                      accept=".txt,.md,.text"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {(() => {
                  const isRtl = isRtlText(inputText);
                  return (
                    <>
                      <textarea
                        id="custom-text-textarea"
                        rows={8}
                        dir={isRtl ? 'rtl' : 'ltr'}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="متن دلخواه یا انگلیسی خود را اینجا قرار دهید / Paste any article or notes here..."
                        className={`w-full p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} ${theme.textPrimary} text-sm ${
                          isRtl ? 'font-vazirmatn text-right leading-loose' : 'font-mono leading-relaxed'
                        } focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-y`}
                      />
                      {isRtl && (
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-amber-400">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>متن فارسی شناسایی شد • حالت راست‌به‌چپ (RTL) و برجسته‌سازی دوحرفی فعال است</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Live Text Analytics Strip */}
              <div className={`flex flex-wrap items-center justify-between p-3 rounded-xl border ${theme.borderClass} ${theme.accentSurface} text-xs`}>
                <div className="flex items-center gap-4">
                  <span className={theme.textMuted}>
                    <strong className={theme.textPrimary}>{stats.wordCount}</strong> words
                  </span>
                  <span className={theme.textMuted}>
                    <strong className={theme.textPrimary}>{stats.charCount}</strong> characters
                  </span>
                </div>
                <div className="flex items-center gap-1 text-red-500 font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Est. {stats.timeFormatted} at {settings.wpm} WPM</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'samples' && (
            <div className="grid grid-cols-1 gap-3">
              {SAMPLE_TEXTS.map((sample) => (
                <div
                  key={sample.id}
                  onClick={() => handleSelectSample(sample)}
                  className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} hover:border-red-500/50 hover:${theme.accentSurface} cursor-pointer transition-all flex flex-col justify-between gap-2 group`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 mb-1">
                        {sample.category}
                      </span>
                      <h4 className={`text-sm font-bold ${theme.textPrimary} group-hover:text-red-500 transition-colors`}>
                        {sample.title}
                      </h4>
                    </div>
                    <span className={`text-xs font-mono shrink-0 ${theme.textMuted}`}>
                      {sample.wordCount} words
                    </span>
                  </div>
                  <p className={`text-xs ${theme.textMuted} line-clamp-2 leading-relaxed`}>
                    {sample.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {savedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`p-3.5 rounded-xl border ${theme.borderClass} ${theme.inputBg} flex items-center justify-between gap-3 group`}
                >
                  <div 
                    onClick={() => handleSelectHistory(doc)}
                    className="flex-1 cursor-pointer min-w-0"
                  >
                    <h4 className={`text-sm font-semibold ${theme.textPrimary} truncate group-hover:text-red-500`}>
                      {doc.title}
                    </h4>
                    <p className={`text-xs ${theme.textMuted}`}>
                      {doc.wordCount} words • Last read: {new Date(doc.lastReadDate).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocument(doc.id);
                    }}
                    title="Delete saved document"
                    aria-label="Delete document"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${theme.borderClass} ${theme.accentSurface}`}>
          <button
            type="button"
            onClick={() => setInputText('')}
            className={`text-xs font-medium ${theme.textMuted} hover:text-red-400 transition-colors`}
          >
            Clear Text
          </button>

          <div className="flex items-center gap-2">
            <button
              id="cancel-text-btn"
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border ${theme.borderClass} ${theme.textPrimary} hover:${theme.cardBgClass} text-xs font-semibold transition-colors`}
            >
              Cancel
            </button>
            <button
              id="apply-text-btn"
              type="button"
              onClick={handleApply}
              disabled={!inputText.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-white font-semibold text-xs transition-transform active:scale-95 shadow-md disabled:opacity-50"
              style={{ backgroundColor: highlight.hex }}
            >
              <BookOpen className="w-4 h-4" />
              <span>Start Reading</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
