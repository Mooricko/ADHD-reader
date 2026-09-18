import React, { useState, useEffect, useRef } from 'react';
import { 
  Globe, 
  ArrowRight, 
  Loader2, 
  X, 
  CheckCircle2, 
  Clock, 
  FileText, 
  AlertCircle, 
  User,
  Sparkles
} from 'lucide-react';
import { isUrlString } from '../../services/import/detectInput';
import { fetchUrlPreview } from '../../services/import/extractUrl';
import { HIGHLIGHT_COLORS } from '../../utils/themeStyles';
import { HighlightColor, ReaderDocument, UrlPreviewData } from '../../types';

interface UrlInputProps {
  onImportUrl: (url: string, preloadedDoc?: ReaderDocument) => void;
  isLoading: boolean;
  highlightColor: HighlightColor;
  disabled?: boolean;
  wpm?: number;
  externalUrl?: string;
  onUrlChange?: (url: string) => void;
}

type PreviewStatus = 'idle' | 'loading' | 'success' | 'error';

export const UrlInput: React.FC<UrlInputProps> = ({
  onImportUrl,
  isLoading,
  highlightColor,
  disabled = false,
  wpm = 300,
  externalUrl,
  onUrlChange,
}) => {
  const [url, setUrl] = useState(externalUrl || '');
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [previewData, setPreviewData] = useState<UrlPreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlight = HIGHLIGHT_COLORS[highlightColor] || HIGHLIGHT_COLORS.red;

  const isDetected = isUrlString(url);

  // Sync externalUrl if provided
  useEffect(() => {
    if (externalUrl !== undefined && externalUrl !== url) {
      setUrl(externalUrl);
    }
  }, [externalUrl]);

  // Trigger quick preview when a valid URL is detected
  useEffect(() => {
    const trimmed = url.trim();

    if (!isUrlString(trimmed)) {
      setPreviewStatus('idle');
      setPreviewData(null);
      setPreviewError(null);
      abortControllerRef.current?.abort();
      return;
    }

    // If preview already loaded for this exact URL, don't re-fetch
    if (previewData && previewData.url.toLowerCase() === trimmed.toLowerCase()) {
      return;
    }

    // Abort previous fetch
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPreviewStatus('loading');
    setPreviewError(null);

    const debounceTimer = setTimeout(async () => {
      try {
        const preview = await fetchUrlPreview(trimmed, wpm, controller.signal);
        if (!controller.signal.aborted) {
          setPreviewData(preview);
          setPreviewStatus('success');
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.warn('URL preview error:', err);
        setPreviewError(err?.message || "Couldn't generate quick preview.");
        setPreviewStatus('error');
      }
    }, 350);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [url, wpm]);

  const handleUrlChange = (newVal: string) => {
    setUrl(newVal);
    onUrlChange?.(newVal);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')?.trim();
    if (pasted && isUrlString(pasted)) {
      handleUrlChange(pasted);
    }
  };

  const handleClear = () => {
    abortControllerRef.current?.abort();
    handleUrlChange('');
    setPreviewStatus('idle');
    setPreviewData(null);
    setPreviewError(null);
    inputRef.current?.focus();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim() || isLoading || disabled) return;

    // If we have a preloaded document from the preview, hand it over directly
    if (previewStatus === 'success' && previewData?.document) {
      onImportUrl(url.trim(), previewData.document);
    } else {
      onImportUrl(url.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Derive domain display
  let domainDisplay = '';
  try {
    domainDisplay = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    domainDisplay = url.replace(/^https?:\/\//, '').split('/')[0];
  }

  return (
    <div className="w-full space-y-2.5">
      {/* Input Form Bar */}
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <Globe className="w-4 h-4" />
        </div>

        <input
          id="url-import-input"
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder="Paste article URL (e.g., https://example.com/article)..."
          className="w-full pl-10 pr-28 py-2.5 bg-slate-900/80 border border-slate-700/80 hover:border-slate-600 focus:border-red-500 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all"
        />

        {url && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-24 p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            title="Clear URL"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          id="url-import-submit-button"
          type="submit"
          disabled={!url.trim() || isLoading || disabled}
          style={{
            backgroundColor: url.trim() && !isLoading ? highlight.hex : undefined,
          }}
          className={`absolute right-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
            url.trim() && !isLoading
              ? 'text-white shadow-sm hover:opacity-90 active:scale-95'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching...</span>
            </>
          ) : (
            <>
              <span>Import</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* QUICK PREVIEW SECTION */}

      {/* 1. Loading State */}
      {isDetected && previewStatus === 'loading' && !isLoading && (
        <div 
          id="url-preview-loading"
          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span className="font-medium">Fetching article preview...</span>
            </div>
            {domainDisplay && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
                {domainDisplay}
              </span>
            )}
          </div>
          
          <div className="space-y-2 mt-2">
            {/* Shimmer placeholders */}
            <div className="h-4 bg-slate-800/80 rounded animate-pulse w-3/4"></div>
            <div className="flex items-center gap-2">
              <div className="h-3 bg-slate-800/60 rounded animate-pulse w-20"></div>
              <div className="h-3 bg-slate-800/60 rounded animate-pulse w-24"></div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Success State: Rich Article Preview */}
      {isDetected && previewStatus === 'success' && previewData && !isLoading && (
        <div 
          id="url-preview-card"
          className="p-3.5 sm:p-4 rounded-xl bg-slate-900/95 border border-slate-700/70 shadow-lg shadow-black/20 animate-in fade-in slide-in-from-top-1 duration-200 space-y-3"
        >
          {/* Header Metadata */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[11px] font-mono">
                <Globe className="w-3 h-3" />
                <span className="truncate max-w-[140px]">{previewData.domain}</span>
              </span>

              {previewData.author && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 text-[11px]">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="truncate max-w-[120px]">{previewData.author}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800 text-xs transition-colors shrink-0"
              title="Clear preview"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Article Title */}
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-slate-100 leading-snug">
              {previewData.title}
            </h4>
            {previewData.excerpt && (
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed italic border-l-2 border-slate-700 pl-2">
                "{previewData.excerpt}"
              </p>
            )}
          </div>

          {/* Key Metrics: Word Count & Estimated Read Time */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2 text-xs">
              <div 
                id="url-preview-word-count"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 font-medium"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>{previewData.wordCount.toLocaleString()} words</span>
              </div>

              <div 
                id="url-preview-read-time"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300"
              >
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>~{previewData.estimatedMinutes} min ({wpm} WPM)</span>
              </div>
            </div>

            {/* Commit Import Button */}
            <button
              id="url-preview-commit-button"
              type="button"
              onClick={() => handleSubmit()}
              style={{ backgroundColor: highlight.hex }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-md hover:opacity-95 active:scale-95 flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Import & Read</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Error Fallback State */}
      {isDetected && previewStatus === 'error' && !isLoading && (
        <div 
          id="url-preview-error"
          className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 animate-in fade-in duration-150 space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-300">Live preview unavailable</p>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                This page may restrict remote previews. You can still attempt direct import or copy & paste text.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              <span>Attempt Full Import</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
