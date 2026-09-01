export type HighlightColor = 'red' | 'amber' | 'emerald' | 'blue' | 'purple' | 'cyan';

export type HighlightStyle = 'middle-two' | 'middle-single' | 'bionic-prefix';

export type ThemeId = 'midnight' | 'oled' | 'sepia' | 'nordic' | 'light';

export type FontFamily = 'lexend' | 'atkinson' | 'jetbrains' | 'newsreader' | 'jakarta';

export type ReaderViewMode = 'rsvp' | 'flow';

export interface HighlightedWordParts {
  original: string;
  prefixPunct: string;
  beforeHighlight: string;
  highlightedText: string;
  afterHighlight: string;
  suffixPunct: string;
  hasSentenceEnd: boolean;
  hasClausePause: boolean;
  hasParagraphBreak: boolean;
  index: number;
}

export interface ReaderSettings {
  wpm: number;
  chunkSize: 1 | 2 | 3;
  highlightColor: HighlightColor;
  highlightStyle: HighlightStyle;
  theme: ThemeId;
  fontFamily: FontFamily;
  fontSize: number; // in pixels or relative scale (e.g. 56)
  flowFontSize: number;
  lineHeight: number;
  letterSpacing: number;
  smartPunctuationPause: boolean;
  metronomeSound: boolean;
  metronomeVolume: number;
  showReticleGuides: boolean;
  showContextWords: boolean; // faint preview of previous and next word
  opticalCenterLock: boolean; // lock middle letters to exact center anchor
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
