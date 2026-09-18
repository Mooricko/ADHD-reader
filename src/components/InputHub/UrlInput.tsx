import React, { useState } from 'react';
import { Globe, ArrowRight, Loader2, X, CheckCircle2 } from 'lucide-react';
import { isUrlString } from '../../services/import/detectInput';
import { HIGHLIGHT_COLORS } from '../../utils/themeStyles';
import { HighlightColor } from '../../types';

interface UrlInputProps {
  onImportUrl: (url: string) => void;
  isLoading: boolean;
  highlightColor: HighlightColor;
  disabled?: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({
  onImportUrl,
  isLoading,
  highlightColor,
  disabled = false,
}) => {
  const [url, setUrl] = useState('');
  const isDetected = isUrlString(url);
  const highlight = HIGHLIGHT_COLORS[highlightColor] || HIGHLIGHT_COLORS.red;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim() || isLoading || disabled) return;
    onImportUrl(url.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <Globe className="w-4 h-4" />
        </div>

        <input
          id="url-import-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder="Paste article URL (e.g., https://example.com/article)..."
          className="w-full pl-10 pr-28 py-2.5 bg-slate-900/80 border border-slate-700/80 hover:border-slate-600 focus:border-red-500 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all"
        />

        {url && !isLoading && (
          <button
            type="button"
            onClick={() => setUrl('')}
            className="absolute right-24 p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
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

      {isDetected && !isLoading && (
        <div className="mt-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Web article detected</span>
          </div>
          <button
            type="button"
            onClick={() => handleSubmit()}
            className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
          >
            Import article now →
          </button>
        </div>
      )}
    </div>
  );
};
