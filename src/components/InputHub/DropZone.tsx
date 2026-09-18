import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { HIGHLIGHT_COLORS } from '../../utils/themeStyles';
import { HighlightColor } from '../../types';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  highlightColor: HighlightColor;
  disabled?: boolean;
}

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf'];

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelect,
  highlightColor,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlight = HIGHLIGHT_COLORS[highlightColor] || HIGHLIGHT_COLORS.red;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragError(null);
  };

  const validateFile = (file: File): boolean => {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const isAccepted = ACCEPTED_EXTENSIONS.includes(ext) || file.type === 'application/pdf' || file.type.startsWith('text/');
    
    if (!isAccepted) {
      setDragError(`Unsupported file "${file.name}". Please drop TXT, Markdown, or PDF files.`);
      return false;
    }
    setDragError(null);
    return true;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // MVP: Single file processing
    const file = files[0];
    if (validateFile(file)) {
      onFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <div
        id="universal-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer text-center ${
          isDragOver
            ? 'scale-[1.01] border-red-500 bg-red-500/10 shadow-lg shadow-red-500/10'
            : 'border-slate-700/70 hover:border-slate-500 bg-slate-800/30 hover:bg-slate-800/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110 ${
            isDragOver ? 'bg-red-500 text-white animate-bounce' : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}
        >
          {isDragOver ? <FileText className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
        </div>

        <h3 className="text-base sm:text-lg font-semibold text-slate-200 mb-1">
          {isDragOver ? 'Release to import' : 'Drop something to read'}
        </h3>

        <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-3">
          Drag & drop files here or{' '}
          <span className={`font-medium underline underline-offset-2 ${highlight.textClass}`}>
            choose from your device
          </span>
        </p>

        <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-slate-400 uppercase bg-slate-900/60 px-3 py-1 rounded-full border border-slate-800">
          <span>TXT</span>
          <span className="text-slate-600">•</span>
          <span>MD</span>
          <span className="text-slate-600">•</span>
          <span>PDF</span>
          <span className="text-slate-600">•</span>
          <span>URL</span>
        </div>
      </div>

      {dragError && (
        <div className="mt-2.5 flex items-center gap-2 p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{dragError}</span>
        </div>
      )}
    </div>
  );
};
