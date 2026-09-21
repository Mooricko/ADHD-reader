export type HighlightColor = 'red' | 'amber' | 'emerald' | 'blue' | 'purple' | 'cyan';

export type HighlightStyle = 'middle-two' | 'middle-single' | 'bionic-prefix';

export type ThemeId = 'midnight' | 'oled' | 'sepia' | 'nordic' | 'light';

export type FontFamily = 'lexend' | 'atkinson' | 'jetbrains' | 'newsreader' | 'jakarta' | 'vazirmatn';

export type ReaderViewMode = 'rsvp' | 'flow';

export interface HighlightedWordParts {
  original: string;
  prefixPunct: string;
  beforeHighlight: string;
  highlightedText: string;
  afterHighlight: string;
  suffixPunct: string;
  isRtl?: boolean;
  hasSentenceEnd: boolean;
  hasClausePause: boolean;
  hasParagraphBreak: boolean;
  paragraphIndex?: number;
  index: number;
}

export interface ReaderSettings {
  wpm: number;
  chunkSize: 1 | 3 | 5; // 1, 3, or 5 words shown in RSVP mode
  highlightColor: HighlightColor;
  highlightStyle: HighlightStyle;
  theme: ThemeId;
  fontFamily: FontFamily;
  fontSize: number; // in pixels or relative scale (e.g. 56)
  flowFontSize: number;
  lineHeight: number;
  letterSpacing: number;
  focusParagraphBlur: boolean; // Optional feature that blurs text and unblurs active/hovered paragraph
  smartPunctuationPause: boolean;
  metronomeSound: boolean;
  metronomeVolume: number;
  showReticleGuides: boolean;
  showContextWords: boolean; // faint preview of previous and next word
  opticalCenterLock: boolean; // lock middle letters to exact center anchor
  morphTransition: boolean; // SVG threshold text morph transition between RSVP words
  speechNarration: boolean; // Web Speech API voice-over narration toggle
  speechVoiceURI: string; // Voice URI or empty string for default
  speechPitch: number; // 0.5 to 1.5 (default 1.0)
  speechVolume: number; // 0 to 1 (default 1.0)
  speechRateMultiplier: number; // Fine-tuning rate multiplier (0.7 to 1.3, default 1.0)
  doNotDisturb: boolean; // Turns off all notifications when timer is set
  showHeatmapProgress: boolean; // Visual reading progress indicator with color gradient heatmap for complex sections
  smartAutoPause: boolean; // Auto-pauses RSVP reader when mouse leaves window or window loses focus
  smartPace: boolean; // Automatically slows down for longer/difficult words and speeds up for short/simple ones
  warmupMode: boolean; // Gradually increases WPM from starting speed to target WPM over first 300 words
  warmupStartWpm: number; // User-defined starting speed for Warm-up Mode (e.g. 180 WPM)
  driftAnimation: boolean; // Subtle horizontal drift of active word to prevent fixed-point staring visual fatigue
  driftIntensity: 'subtle' | 'moderate' | 'dynamic'; // Intensity amplitude of horizontal drift
}

export interface SmartPaceAnalysis {
  multiplier: number; // e.g. 0.75x to 1.65x
  length: number;
  syllables: number;
  complexityCategory: 'simple' | 'standard' | 'moderate' | 'difficult';
  speedCategory: 'fast' | 'normal' | 'slower' | 'slowest';
  reasons: string[];
}

export interface WarmupStatus {
  isActive: boolean;
  isWarmingUp: boolean;
  targetWpm: number;
  startWpm: number;
  currentWpm: number;
  sessionWordsRead: number;
  totalWarmupWords: number;
  progressPercent: number;
}

export type ComplexityLevel = 'unread' | 'low' | 'moderate' | 'high' | 'peak';

export interface HeatmapBucket {
  index: number;
  startWord: number;
  endWord: number;
  progressPercent: number; // 0 to 100
  dwellTimeMs: number;
  visitCount: number;
  relativeIntensity: number; // 0.0 to 1.0
  color: string; // CSS color code
  isCurrent: boolean;
  isRead: boolean;
  sampleSnippet: string;
  complexityLevel: ComplexityLevel;
  complexityLabel: string;
}

export interface ReadingHeatmapData {
  buckets: HeatmapBucket[];
  totalDwellMs: number;
  avgBucketDwellMs: number;
  maxBucketDwellMs: number;
  complexSectionsCount: number;
  mostComplexBucket: HeatmapBucket | null;
  gradientCss: string;
}

export interface ReadingSessionRecord {
  id: string;
  timestamp: number;
  dateLabel: string;
  documentTitle: string;
  wordsRead: number;
  dwellMs: number;
  averageWpm: number;
  targetWpm: number;
}

export interface WpmHistoryPoint {
  id: string;
  timestamp: number;
  dateLabel: string;
  timeLabel: string;
  sessionNumber: number;
  avgWpm: number;
  targetWpm: number;
  wordsRead: number;
  dwellSeconds: number;
  documentTitle: string;
}

export interface ReadingStatsSummary {
  totalWordsRead: number;
  totalReadingTimeMs: number;
  totalSessionsCount: number;
  overallAverageWpm: number;
  currentDocWordsRead: number;
  currentDocDwellMs: number;
  currentDocAvgWpm: number;
  wpmHistory: WpmHistoryPoint[];
  recentSessions: ReadingSessionRecord[];
  complexityBreakdown: {
    fastWords: number;
    steadyWords: number;
    complexWords: number;
    unreadWords: number;
  };
}

export interface SavedDocument {
  id: string;
  title: string;
  text?: string; // Optional in Phase 2 so large documents don't require full text in memory / localStorage
  wordCount: number;
  lastReadIndex: number;
  lastReadDate: string;
  category?: string;
  sourceType?: InputSourceType;
  sourceUrl?: string;
  fileName?: string;
  direction?: 'ltr' | 'rtl';
  totalCharacters?: number;
  pageCount?: number;
  hasStructure?: boolean;
}

export type InputSourceType = 'text' | 'url' | 'txt' | 'markdown' | 'pdf';

/**
 * Phase 2 Scalable Document Model:
 * DocumentMetadata represents the lightweight catalog record stored in IndexedDB.
 */
export interface DocumentMetadata {
  id: string;
  title: string;
  sourceType: InputSourceType;
  sourceUrl?: string;
  fileName?: string;
  direction?: 'ltr' | 'rtl';
  totalCharacters: number;
  totalWords: number;
  createdAt: number;
  updatedAt: number;
  lastReadWordIndex: number;
  category?: string;
  totalChunks?: number;
  chunkCount?: number;
  pageCount?: number;
  hasStructure?: boolean;
}

/**
 * Phase 2 Scalable Document Model:
 * DocumentChunk represents a discrete, indexable slice of text stored in IndexedDB.
 */
export interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  text: string;
  wordCount: number;
  startCharIndex?: number;
  endCharIndex?: number;
}

export interface LocationChunkRange {
  chunkIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  wordCount: number;
}

/**
 * Phase 2 Scalable Document Model:
 * DocumentLocationIndex maps word indices to chunks for fast O(1) or O(log N) lookup.
 */
export interface DocumentLocationIndex {
  documentId: string;
  totalChunks: number;
  totalWords: number;
  totalCharacters: number;
  chunkRanges: LocationChunkRange[];
  chunks?: LocationChunkRange[];
}

/**
 * Phase 2 ReaderDocumentHandle:
 * Clean application-level interface allowing readers to request content
 * without knowing how the document is physically stored.
 */
export interface ReaderDocumentHandle {
  readonly id: string;
  getMetadata(): Promise<DocumentMetadata>;
  getChunk(chunkIndex: number): Promise<DocumentChunk | null>;
  getProcessedWordsForChunk(
    chunkIndex: number,
    highlightStyle?: HighlightStyle
  ): Promise<HighlightedWordParts[]>;
  getAdjacentChunks(currentChunkIndex: number, radius?: number): Promise<DocumentChunk[]>;
  getWordsSlice(
    startIndex: number,
    count: number,
    highlightStyle?: HighlightStyle
  ): Promise<HighlightedWordParts[]>;
  getWordsInRange(startWordIndex: number, endWordIndex: number): Promise<string[]>;
  getParagraphs(): Promise<string[]>;
  getCachedChunkCount?(): number;
  getCachedWordsChunkCount?(): number;
  getMaxCachedChunks?(): number;
  getLocationInfo(wordIndex: number): Promise<{
    chunkIndex: number;
    wordIndexInChunk: number;
    progressPercent: number;
    totalWords: number;
  }>;
  getFullText(): Promise<string>;
  updateProgress(wordIndex: number): Promise<void>;
  // Phase 3 extensions
  getStructure(): Promise<DocumentStructure | null>;
  getPages(): Promise<PageIndexEntry[] | null>;
  resolvePosition(position: DocumentPosition): Promise<ResolvedDocumentPosition>;
  resolvePage(pageNumber: number): Promise<ResolvedDocumentPosition>;
  resolveChapter(chapterId: string): Promise<ResolvedDocumentPosition>;
  resolveSection(sectionId: string): Promise<ResolvedDocumentPosition>;
  resolveWordIndex(wordIndex: number): Promise<ResolvedDocumentPosition>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Phase 3 Source-Aware Document Position
 * Supports resolving chapters, sections, PDF pages, paragraphs, percentages,
 * or raw word indices into one canonical reading position.
 */
export type DocumentPosition =
  | {
      kind: 'word';
      wordIndex: number;
    }
  | {
      kind: 'pdf-page';
      pageNumber: number; // 1-based page number
      wordOffset?: number; // Word offset from start of page (default 0)
    }
  | {
      kind: 'chapter';
      chapterId: string;
      wordOffset?: number; // Word offset from start of chapter (default 0)
    }
  | {
      kind: 'section';
      sectionId: string;
      wordOffset?: number; // Word offset from start of section (default 0)
    }
  | {
      kind: 'paragraph';
      paragraphIndex: number; // 0-based paragraph index
      wordOffset?: number; // Word offset from start of paragraph (default 0)
    }
  | {
      kind: 'percent';
      percent: number; // 0 to 100
    };

/**
 * Phase 3 Resolved Canonical Reading Position
 * Contains the definitive word index and chunk position for the RSVP engine,
 * along with structural context (chapter, section, page).
 */
export interface ResolvedDocumentPosition {
  documentId: string;
  globalWordIndex: number;
  chunkIndex: number;
  wordIndexInChunk: number;
  progressPercent: number;
  totalWords: number;
  pageNumber?: number; // 1-based PDF page if paginated
  chapter?: StructuralNode;
  section?: StructuralNode;
  paragraphIndex?: number;
}

/**
 * Phase 3 Structural Node
 * Represents a chapter, section, or subsection in a document.
 */
export interface StructuralNode {
  id: string;
  title: string;
  level: number; // 1 for H1 / Chapter, 2 for H2 / Section, 3 for H3 / Subsection
  startWordIndex: number;
  endWordIndex: number;
  pageStart?: number; // 1-based PDF page if document is paginated
  pageEnd?: number;
  startCharIndex?: number;
  endCharIndex?: number;
  parentId?: string;
  children?: StructuralNode[];
}

/**
 * Phase 3 PDF Page Index Entry
 * Exact word and character boundaries for each physical page in a PDF document.
 * (Never created for non-paginated sources like plain TXT or Markdown).
 */
export interface PageIndexEntry {
  pageNumber: number; // 1-based page number
  startWordIndex: number;
  endWordIndex: number;
  wordCount: number;
  hasText?: boolean;
  startCharIndex?: number;
  endCharIndex?: number;
  textPreview?: string;
}

/**
 * Phase 3 Paragraph Index Entry
 */
export interface ParagraphIndexEntry {
  paragraphIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  wordCount: number;
  preview?: string;
}

/**
 * Phase 3 Complete Document Structure & Navigation Index
 */
export interface DocumentStructure {
  documentId: string;
  chapters: StructuralNode[]; // Level 1 chapters / top-level structural units
  sections: StructuralNode[]; // Flattened array of all chapters and sections for O(1) id lookup
  pages?: PageIndexEntry[]; // Present ONLY for paginated sources (PDF), NEVER for plain text
  paragraphs?: ParagraphIndexEntry[];
  createdAt: number;
}

/**
 * Phase 3 Search-Ready API Types
 */
export interface SearchResult {
  documentId: string;
  globalWordIndex: number;
  chunkIndex: number;
  wordIndexInChunk: number;
  pageNumber?: number;
  chapterTitle?: string;
  sectionTitle?: string;
  snippet: string;
  matchTerm: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  maxResults?: number;
  startWordIndex?: number;
  endWordIndex?: number;
}

export interface UrlPreviewData {
  url: string;
  title: string;
  wordCount: number;
  estimatedMinutes: number;
  domain: string;
  author?: string;
  excerpt?: string;
  document: ReaderDocument;
}

export interface ReaderDocument {
  id: string;
  sourceType: InputSourceType;
  title?: string;
  sourceUrl?: string;
  fileName?: string;
  content: string;
  language?: string;
  direction?: 'ltr' | 'rtl';
  pages?: PageIndexEntry[]; // Present for PDFs
  structure?: DocumentStructure;
  metadata?: {
    author?: string;
    pageCount?: number;
    wordCount?: number;
  };
}

export type ImportStage =
  | 'idle'
  | 'detecting'
  | 'reading'
  | 'extracting'
  | 'indexing'
  | 'processing'
  | 'preparing'
  | 'ready'
  | 'error';

export interface ImportState {
  stage: ImportStage;
  message?: string;
  progress?: number; // 0 to 100
  error?: string;
  errorAction?: 'retry' | 'paste' | 'another_file';
  detectedType?: InputSourceType;
  sourceUrl?: string;
  document?: ReaderDocument;
}
