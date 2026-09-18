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
  text: string;
  wordCount: number;
  lastReadIndex: number;
  lastReadDate: string;
  category?: string;
}

export type InputSourceType = 'text' | 'url' | 'txt' | 'markdown' | 'pdf';

export interface ReaderDocument {
  id: string;
  sourceType: InputSourceType;
  title?: string;
  sourceUrl?: string;
  fileName?: string;
  content: string;
  language?: string;
  direction?: 'ltr' | 'rtl';
  metadata?: {
    author?: string;
    pageCount?: number;
    wordCount?: number;
  };
}

export type ImportStage = 'idle' | 'detecting' | 'reading' | 'extracting' | 'preparing' | 'ready' | 'error';

export interface ImportState {
  stage: ImportStage;
  message?: string;
  progress?: number; // 0 to 100
  error?: string;
  errorAction?: 'retry' | 'paste' | 'another_file';
  detectedType?: InputSourceType;
  document?: ReaderDocument;
}
