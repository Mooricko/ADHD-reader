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

export interface SavedDocument {
  id: string;
  title: string;
  text: string;
  wordCount: number;
  lastReadIndex: number;
  lastReadDate: string;
  category?: string;
}
