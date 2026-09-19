import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { 
  Clipboard, 
  Sparkles, 
  Clock, 
  FileText, 
  ArrowRight, 
  BookOpen, 
  History, 
  Layers, 
  Trash2, 
  Check, 
  AlertCircle,
  Zap
} from 'lucide-react';
import { ReaderSettings, ReaderDocument, SavedDocument, ImportState } from '../../types';
import { DropZone } from './DropZone';
import { UrlInput } from './UrlInput';
import { ImportStatus } from './ImportStatus';
import { processUniversalInput } from '../../services/import/extractText';
import { isUrlString, isMarkdownString } from '../../services/import/detectInput';
import { calculateTextStats, isRtlText } from '../../utils/textParser';
import { classifyDocumentScale } from '../../utils/performanceDiagnostics';
import { HIGHLIGHT_COLORS, THEME_CONFIGS } from '../../utils/themeStyles';
import { SAMPLE_TEXTS } from '../../data/sampleTexts';

interface InputHubProps {
  currentText: string;
  currentTitle: string;
  onImportDocument: (doc: ReaderDocument) => void;
  savedDocuments: SavedDocument[];
  onDeleteDocument?: (id: string) => void;
  settings: ReaderSettings;
  onClose?: () => void;
  onOpenExtensionHub?: () => void;
}

export const InputHub: React.FC<InputHubProps> = ({
  currentText,
  currentTitle,
  onImportDocument,
  savedDocuments,
  onDeleteDocument,
  settings,
  onClose,
  onOpenExtensionHub,
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'samples' | 'history'>('hub');
  const [pastedText, setPastedText] = useState(currentText);
  const [docTitle, setDocTitle] = useState(currentTitle);
  const [importState, setImportState] = useState<ImportState>({ stage: 'idle' });
  const [lastAttemptedFile, setLastAttemptedFile] = useState<File | null>(null);
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState<string | null>(null);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor] || HIGHLIGHT_COLORS.red;
  const theme = THEME_CONFIGS[settings.theme] || THEME_CONFIGS.midnight;

  // React 18 useDeferredValue ensures typing inside the textarea remains 60fps responsive
  // even for 100,000+ character documents, avoiding synchronous blocking stats calculations.
  const deferredPastedText = useDeferredValue(pastedText);

  const { isDetectedUrl, isDetectedMarkdown, stats, isRtl, docScale } = useMemo(() => {
    if (!deferredPastedText) {
      return {
        isDetectedUrl: false,
        isDetectedMarkdown: false,
        stats: calculateTextStats('', settings.wpm),
        isRtl: false,
        docScale: 'normal' as const,
      };
    }

    const isUrl = isUrlString(deferredPastedText);
    const isMd = !isUrl && isMarkdownString(deferredPastedText);
    const textStats = calculateTextStats(deferredPastedText, settings.wpm);
    const rtl = isRtlText(deferredPastedText);
    const scale = classifyDocumentScale(textStats.charCount, textStats.wordCount);

    return {
      isDetectedUrl: isUrl,
      isDetectedMarkdown: isMd,
      stats: textStats,
      isRtl: rtl,
      docScale: scale,
    };
  }, [deferredPastedText, settings.wpm]);

  // Keyboard shortcuts handler for Input Hub
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter -> Start reading
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleStartReading();
      }
      // Ctrl/Cmd + O -> Trigger file picker
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        const dropzone = document.getElementById('universal-dropzone');
        dropzone?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pastedText, docTitle, isDetectedUrl]);

  // Unified import processor
  const handleProcessInput = async (
    input: File | Blob | string,
    forcedType?: any,
    fileName?: string
  ) => {
    setImportState({ stage: 'detecting', message: 'Analyzing reading material...' });

    try {
      const doc = await processUniversalInput(input, {
        forcedType,
        fileName,
        title: docTitle || undefined,
        onProgress: (percent, message) => {
          setImportState({
            stage: percent >= 95 ? 'preparing' : 'extracting',
            progress: percent,
            message,
          });
        },
      });

      setImportState({
        stage: 'ready',
        message: `Ready — ${doc.metadata?.wordCount || 'Multiple'} words`,
        document: doc,
      });

      // Brief delay so user sees the success state, then activate reader
      setTimeout(() => {
        onImportDocument(doc);
        onClose?.();
      }, 400);
    } catch (err: any) {
      console.error('Import failure:', err);
      const errMsg = err?.message || "Couldn't extract readable text.";
      const isUrl = typeof input === 'string' && isUrlString(input);
      setImportState({
        stage: 'error',
        error: errMsg,
        detectedType: typeof input === 'string' ? (isUrl ? 'url' : 'text') : (input as File).name?.endsWith('.pdf') ? 'pdf' : 'text',
        sourceUrl: isUrl ? (input as string) : undefined,
      });
    }
  };

  // DropZone file dropped/selected
  const handleFileSelect = (file: File) => {
    setLastAttemptedFile(file);
    setLastAttemptedUrl(null);
    handleProcessInput(file, undefined, file.name);
  };

  // URL submitted from URL input or detected
  const handleImportUrl = (url: string, preloadedDoc?: ReaderDocument) => {
    setLastAttemptedUrl(url);
    setLastAttemptedFile(null);

    // If already preloaded from quick preview, import instantly without re-fetching
    if (preloadedDoc) {
      setImportState({
        stage: 'ready',
        message: `Ready — ${preloadedDoc.metadata?.wordCount || 'Multiple'} words`,
        document: preloadedDoc,
      });

      setTimeout(() => {
        onImportDocument(preloadedDoc);
        onClose?.();
      }, 300);
      return;
    }

    handleProcessInput(url, 'url');
  };

  // Direct paste button from system clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const trimmed = text.trim();
        if (isUrlString(trimmed)) {
          setUrlInputValue(trimmed);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        } else {
          setPastedText(trimmed);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }
      }
    } catch {
      // Clipboard permission denied: focus the textarea
      textareaRef.current?.focus();
    }
  };

  // Submit plain text / markdown currently in textarea
  const handleStartReading = () => {
    if (!pastedText.trim()) return;

    if (isDetectedUrl) {
      handleImportUrl(pastedText.trim());
      return;
    }

    handleProcessInput(pastedText, isDetectedMarkdown ? 'markdown' : 'text');
  };

  // Samples selection
  const handleSelectSample = (sample: SavedDocument) => {
    const doc: ReaderDocument = {
      id: sample.id,
      sourceType: 'text',
      title: sample.title,
      content: sample.text,
      direction: isRtlText(sample.text) ? 'rtl' : 'ltr',
      metadata: {
        wordCount: sample.wordCount,
      },
    };
    onImportDocument(doc);
    onClose?.();
  };

  // History selection
  const handleSelectHistory = (historyItem: SavedDocument) => {
    const doc: ReaderDocument = {
      id: historyItem.id,
      sourceType: 'text',
      title: historyItem.title,
      content: historyItem.text,
      direction: isRtlText(historyItem.text) ? 'rtl' : 'ltr',
      metadata: {
        wordCount: historyItem.wordCount,
      },
    };
    onImportDocument(doc);
    onClose?.();
  };

  const isProcessing = ['detecting', 'reading', 'extracting', 'preparing'].includes(importState.stage);

  return (
    <div id="universal-text-input-hub" className="flex flex-col h-full max-h-[85vh] text-slate-200">
      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('hub')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'hub'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-red-400" />
            <span>Universal Input Hub</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('samples')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'samples'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>Sample Library</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
              activeTab === 'history'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span>History</span>
            {savedDocuments.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-slate-700 text-[10px] flex items-center justify-center text-slate-300 font-mono">
                {savedDocuments.length}
              </span>
            )}
          </button>
        </div>

        {onOpenExtensionHub && (
          <button
            type="button"
            onClick={onOpenExtensionHub}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-800/60 text-red-300 text-xs font-medium transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-red-400 fill-red-400" />
            <span>Web Capture Extension</span>
          </button>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {activeTab === 'hub' && (
          <div className="space-y-4">
            {/* Status / Error Banner */}
            <ImportStatus
              state={importState}
              onRetry={() => {
                if (lastAttemptedFile) handleFileSelect(lastAttemptedFile);
                else if (lastAttemptedUrl) handleImportUrl(lastAttemptedUrl);
                else handleStartReading();
              }}
              onPasteFallback={() => {
                setImportState({ stage: 'idle' });
                if (lastAttemptedUrl && !docTitle) {
                  try {
                    const parsed = new URL(lastAttemptedUrl.startsWith('http') ? lastAttemptedUrl : `https://${lastAttemptedUrl}`);
                    setDocTitle(parsed.hostname.replace(/^www\./, ''));
                  } catch {
                    setDocTitle(lastAttemptedUrl);
                  }
                }
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              onChooseAnotherFile={() => {
                setImportState({ stage: 'idle' });
                document.getElementById('universal-dropzone')?.click();
              }}
              onDismiss={() => setImportState({ stage: 'idle' })}
            />

            {/* Drop Zone Area */}
            <DropZone
              onFileSelect={handleFileSelect}
              highlightColor={settings.highlightColor}
              disabled={isProcessing}
            />

            {/* Divider */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Or paste text or web URL
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* URL Dedicated Bar */}
            <UrlInput
              onImportUrl={handleImportUrl}
              isLoading={isProcessing}
              highlightColor={settings.highlightColor}
              disabled={isProcessing}
              wpm={settings.wpm}
              externalUrl={urlInputValue}
              onUrlChange={setUrlInputValue}
            />

            {/* Rich Text & Markdown Input Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Document Title (Optional)"
                  className="bg-transparent border-b border-slate-800 hover:border-slate-700 focus:border-red-500 text-xs font-medium text-slate-300 placeholder-slate-600 px-1 py-1 focus:outline-none transition-colors w-1/2"
                />

                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
                >
                  {copySuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Pasted!</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>Paste Clipboard</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <textarea
                  id="universal-text-input"
                  ref={textareaRef}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  dir={isRtl ? 'rtl' : 'ltr'}
                  rows={6}
                  disabled={isProcessing}
                  placeholder="Paste anything here: articles, essays, books, Markdown, or raw notes..."
                  className={`w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 hover:border-slate-600 focus:border-red-500 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 resize-y transition-all ${
                    isRtl ? 'font-vazirmatn text-right leading-relaxed' : 'font-sans'
                  }`}
                />

                {/* Real-time Detections & Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {isDetectedUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          setUrlInputValue(pastedText.trim());
                          setPastedText('');
                        }}
                        className="px-2 py-0.5 rounded-full bg-blue-950/60 border border-blue-800/60 text-blue-400 hover:text-blue-300 hover:bg-blue-900/60 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Transfer to URL Preview"
                      >
                        <span>🌐 Web Article URL</span>
                        <span className="underline ml-1">Show Preview ↑</span>
                      </button>
                    ) : isDetectedMarkdown ? (
                      <span className="px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/60 text-purple-400 text-[11px] font-medium flex items-center gap-1">
                        📝 Markdown prose formatting
                      </span>
                    ) : isRtl ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-400 text-[11px] font-medium flex items-center gap-1 font-vazirmatn">
                        🇮🇷 راست‌چین (RTL / فارسی)
                      </span>
                    ) : null}

                    {docScale !== 'normal' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                        {docScale === 'extreme' ? '⚡ Extreme Document' : docScale === 'very-large' ? '📚 Book-Length' : '📘 Large Document'}
                      </span>
                    )}

                    {pastedText.trim() && !isDetectedUrl && (
                      <span>
                        {stats.wordCount.toLocaleString()} words • ~{stats.estimatedMinutes}m read at {settings.wpm} WPM
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-500 hidden sm:inline-block">
                    Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">⌘+Enter</kbd> to read
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Samples Library Tab */}
        {activeTab === 'samples' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Curated readings designed to benchmark your RSVP speed and focus stamina:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SAMPLE_TEXTS.map((sample) => (
                <div
                  key={sample.id}
                  onClick={() => handleSelectSample(sample)}
                  className="group p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 group-hover:text-red-400 transition-colors">
                        {sample.title}
                      </span>
                      {sample.category && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">
                          {sample.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {sample.text}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500">
                    <span>{sample.wordCount} words</span>
                    <span className="text-red-400 font-medium group-hover:underline">
                      Load & Read →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {savedDocuments.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800">
                <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-400">No reading history yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Documents you import and read will be automatically saved here for easy resumption.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {savedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex items-center justify-between group transition-all"
                  >
                    <div
                      onClick={() => handleSelectHistory(doc)}
                      className="flex-1 min-w-0 cursor-pointer pr-4"
                    >
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-red-400 transition-colors truncate">
                        {doc.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{doc.wordCount} words</span>
                        <span>•</span>
                        <span>{doc.lastReadDate}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSelectHistory(doc)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                      >
                        Read
                      </button>
                      {onDeleteDocument && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteDocument(doc.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Remove from history"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      {activeTab === 'hub' && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-3">
            <span>Supports: TXT, MD, PDF, URL, Paste</span>
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
            )}

            <button
              id="start-reading-button"
              type="button"
              onClick={handleStartReading}
              disabled={!pastedText.trim() || isProcessing}
              style={{
                backgroundColor: pastedText.trim() && !isProcessing ? highlight.hex : undefined,
              }}
              className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                pastedText.trim() && !isProcessing
                  ? 'text-white shadow-lg shadow-red-500/20 hover:opacity-95 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>{isDetectedUrl ? 'Import Article & Read' : 'Start Reading'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
