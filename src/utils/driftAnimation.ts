import { HighlightedWordParts } from '../types';

export type DriftIntensity = 'subtle' | 'moderate' | 'dynamic';

export interface DriftState {
  offsetPx: number;
  direction: 'left' | 'center' | 'right';
  intensity: DriftIntensity;
  stationIndex: number;
}

export const DRIFT_INTENSITY_CONFIGS: Record<
  DriftIntensity,
  { label: string; maxOffset: string; multiplier: number; description: string }
> = {
  subtle: {
    label: 'Subtle',
    maxOffset: '±12px',
    multiplier: 0.6,
    description: 'Gentle micro-saccades, minimal movement for sensitive eyes',
  },
  moderate: {
    label: 'Moderate',
    maxOffset: '±22px',
    multiplier: 1.0,
    description: 'Optimal balance to break gaze fixation without losing focus',
  },
  dynamic: {
    label: 'Dynamic',
    maxOffset: '±34px',
    multiplier: 1.5,
    description: 'Pronounced saccadic sweeps for long or high-fatigue sessions',
  },
};

// Harmonic sequence of horizontal offsets (in px at moderate intensity 1.0)
// Balanced around 0 (left/right alternating with occasional center returns)
const BASE_DRIFT_OFFSETS = [
  0,    // Center anchor
  18,   // Slight right
  -16,  // Moderate left
  22,   // Right
  -8,   // Slight left
  20,   // Moderate right
  -24,  // Pronounced left
  12,   // Near center right
  -18,  // Moderate left
  26,   // Pronounced right
  -14,  // Moderate left
  0,    // Center rest
  -22,  // Left
  16,   // Moderate right
  -18,  // Moderate left
  24,   // Right
];

/**
 * Pre-computes deterministic drift offsets for all words in the document.
 * Shifts every ~8-12 words or at natural sentence/clause breaks.
 * Enables O(1) instant lookup on every frame during high-speed RSVP playback.
 */
export function precalculateDriftOffsets(
  words: HighlightedWordParts[],
  intensity: DriftIntensity = 'moderate',
  enabled = true
): number[] {
  if (!enabled || !words || words.length === 0) {
    return new Array(words?.length || 0).fill(0);
  }

  const multiplier = DRIFT_INTENSITY_CONFIGS[intensity]?.multiplier ?? 1.0;
  const offsets: number[] = new Array(words.length);

  let stationIndex = 0;
  let wordsAtCurrentStation = 0;

  for (let i = 0; i < words.length; i++) {
    wordsAtCurrentStation++;
    const word = words[i];
    const isNaturalBreak = Boolean(word?.hasSentenceEnd || word?.hasParagraphBreak || word?.hasClausePause);

    // Natural cadence: shift on punctuation after at least 6 words, or unconditionally after 11 words
    if (wordsAtCurrentStation >= 11 || (wordsAtCurrentStation >= 6 && isNaturalBreak)) {
      stationIndex++;
      wordsAtCurrentStation = 0;
    }

    const baseOffset = BASE_DRIFT_OFFSETS[stationIndex % BASE_DRIFT_OFFSETS.length];
    offsets[i] = Math.round(baseOffset * multiplier);
  }

  return offsets;
}

/**
 * Computes deterministic drift offset on-the-fly for a single word in O(1).
 * Eliminates the need to allocate large number arrays for massive documents.
 */
export function getDriftOffsetForWord(
  globalIndex: number,
  intensity: DriftIntensity = 'moderate',
  enabled = true,
  word?: HighlightedWordParts
): number {
  if (!enabled || globalIndex < 0) return 0;
  const multiplier = DRIFT_INTENSITY_CONFIGS[intensity]?.multiplier ?? 1.0;
  // Natural station step: roughly every 10 words
  const stationIndex = Math.floor(globalIndex / 10);
  const baseOffset = BASE_DRIFT_OFFSETS[stationIndex % BASE_DRIFT_OFFSETS.length];
  return Math.round(baseOffset * multiplier);
}

/**
 * Analyzes a specific drift offset value into human-readable direction and metrics.
 */
export function getDriftMetrics(offsetPx: number, intensity: DriftIntensity = 'moderate'): DriftState {
  const direction: 'left' | 'center' | 'right' =
    offsetPx > 3 ? 'right' : offsetPx < -3 ? 'left' : 'center';

  return {
    offsetPx,
    direction,
    intensity,
    stationIndex: 0,
  };
}
