import { HighlightedWordParts, SmartPaceAnalysis, WarmupStatus } from '../types';

/**
 * Total words over which Warm-up Mode ramps the speed from startWpm to targetWpm.
 */
export const WARMUP_TOTAL_WORDS = 300;

/**
 * Default starting WPM for Warm-up Mode.
 */
export const DEFAULT_WARMUP_START_WPM = 180;

/**
 * High-frequency English short function words that are recognized virtually instantaneously.
 */
const ULTRA_SHORT_COMMON_WORDS = new Set([
  'a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 
  'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we'
]);

const THREE_LETTER_COMMON_WORDS = new Set([
  'all', 'and', 'any', 'are', 'bad', 'big', 'boy', 'but', 'can', 'car', 'cat', 'day',
  'did', 'dog', 'ear', 'eat', 'eye', 'far', 'few', 'fit', 'for', 'get', 'got', 'had',
  'has', 'her', 'him', 'his', 'hot', 'how', 'its', 'let', 'lot', 'low', 'man', 'may',
  'new', 'not', 'now', 'off', 'old', 'one', 'our', 'out', 'per', 'put', 'ran', 'red',
  'run', 'saw', 'say', 'see', 'set', 'she', 'sit', 'six', 'son', 'sun', 'ten', 'the',
  'too', 'top', 'two', 'use', 'war', 'was', 'way', 'who', 'why', 'win', 'yes', 'yet', 'you'
]);

/**
 * Estimates syllables for English/Latin words using vowel cluster heuristics.
 */
export function estimateSyllables(word: string): number {
  if (!word) return 0;
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;

  // Count vowel groups
  const vowelMatches = clean.match(/[aeiouy]{1,2}/g);
  let count = vowelMatches ? vowelMatches.length : 1;

  // Subtract silent 'e' at end unless preceded by 'l' (e.g. table, apple)
  if (clean.endsWith('e') && !clean.endsWith('le') && !clean.endsWith('ee') && count > 1) {
    count -= 1;
  }

  // Adjust for suffixes like -ed (walked = 1 syllable, but wanted = 2 syllables)
  if (clean.endsWith('ed') && !clean.endsWith('ted') && !clean.endsWith('ded') && count > 1) {
    count -= 1;
  }

  return Math.max(1, count);
}

/**
 * Analyzes word length, phonetic complexity, typography, and script structure
 * to compute a dynamic Smart Pace display duration multiplier.
 *
 * Short/simple words receive a multiplier < 1.0 (speed up by up to 28%),
 * while long/complex words receive a multiplier > 1.0 (slow down by up to 60%).
 */
export function analyzeWordSmartPace(wordInput: HighlightedWordParts | string): SmartPaceAnalysis {
  const rawOriginal = typeof wordInput === 'string' ? wordInput : wordInput.original || '';
  const isRtl = typeof wordInput === 'object' && Boolean(wordInput.isRtl);

  const trimmed = rawOriginal.trim();
  // Strip leading and trailing punctuation
  const clean = trimmed.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const length = clean.length;
  const reasons: string[] = [];

  if (length === 0) {
    return {
      multiplier: 1.0,
      length: 0,
      syllables: 0,
      complexityCategory: 'standard',
      speedCategory: 'normal',
      reasons: ['empty token'],
    };
  }

  let multiplier = 1.0;
  const lower = clean.toLowerCase();

  // 1. Numerals and Quantitative Data (require mental numeric parsing)
  const hasDigits = /\d/.test(clean);
  if (hasDigits) {
    multiplier += 0.30;
    reasons.push('numeric content (+30% pause)');
  }

  // 2. Acronyms & All-Caps (e.g. ADHD, NASA, UNESCO, RSVP)
  const isAllCaps = length >= 2 && clean === clean.toUpperCase() && !hasDigits && !isRtl;
  if (isAllCaps) {
    multiplier += 0.20;
    reasons.push('acronym/all-caps (+20% pause)');
  }

  // 3. Compounds and Hyphenated Terms
  const isHyphenated = clean.includes('-') || clean.includes('—') || clean.includes('_');
  const isPersianCompound = isRtl && (clean.includes('\u200c') || clean.length > 9);
  if (isHyphenated) {
    multiplier += 0.18;
    reasons.push('compound term (+18% pause)');
  } else if (isPersianCompound) {
    multiplier += 0.15;
    reasons.push('Persian compound morpheme (+15% pause)');
  }

  // 4. Special technical or mathematical symbols (%, $, €, @, /, +, =)
  if (/[%$€£@/\\+=&]/.test(rawOriginal)) {
    multiplier += 0.15;
    reasons.push('special symbol (+15% pause)');
  }

  // 5. Length & Syllable Factor
  let syllables = 1;
  if (!isRtl) {
    syllables = estimateSyllables(clean);
  }

  if (length <= 2) {
    // Ultra-short: "a", "in", "to", "of", "on", "at", "is", "it"
    const isUltraCommon = ULTRA_SHORT_COMMON_WORDS.has(lower);
    const speedUp = isUltraCommon ? -0.28 : -0.22;
    multiplier += speedUp;
    reasons.push(`ultra-short word (${Math.round(speedUp * 100)}% faster)`);
  } else if (length === 3) {
    // 3 letters: "the", "and", "for", "are", "but", "you"
    const isCommon = THREE_LETTER_COMMON_WORDS.has(lower);
    const speedUp = isCommon ? -0.18 : -0.12;
    multiplier += speedUp;
    reasons.push(`short 3-letter word (${Math.round(speedUp * 100)}% faster)`);
  } else if (length === 4) {
    // 4 letters: "that", "with", "have", "this"
    multiplier -= 0.08;
    reasons.push('4-letter word (-8% faster)');
  } else if (length >= 5 && length <= 7) {
    // Standard baseline
    if (syllables >= 3) {
      multiplier += 0.10;
      reasons.push('3+ syllables (+10% pause)');
    }
  } else if (length >= 8 && length <= 10) {
    // Moderate length: "increase", "attention", "movement"
    const addition = syllables >= 4 ? 0.25 : 0.18;
    multiplier += addition;
    reasons.push(`long word (${length} chars, +${Math.round(addition * 100)}% pause)`);
  } else if (length >= 11 && length <= 13) {
    // Substantial length: "understanding", "neurodiversity"
    const addition = syllables >= 5 ? 0.40 : 0.32;
    multiplier += addition;
    reasons.push(`polysyllabic term (${length} chars, +${Math.round(addition * 100)}% pause)`);
  } else if (length >= 14) {
    // Extreme length: "neurodevelopmental", "conceptualization"
    multiplier += 0.50;
    reasons.push(`extreme length (${length} chars, +50% pause)`);
  }

  // 6. Clamp multiplier to a sensible, human-friendly range [0.72x, 1.65x]
  // 0.72x prevents words from flashing invisibly; 1.65x prevents awkward reading stalls.
  const clamped = Math.min(1.65, Math.max(0.72, Math.round(multiplier * 100) / 100));

  // Determine categories for UI / Diagnostics
  let complexityCategory: SmartPaceAnalysis['complexityCategory'] = 'standard';
  let speedCategory: SmartPaceAnalysis['speedCategory'] = 'normal';

  if (clamped <= 0.88) {
    complexityCategory = 'simple';
    speedCategory = 'fast';
  } else if (clamped <= 1.08) {
    complexityCategory = 'standard';
    speedCategory = 'normal';
  } else if (clamped <= 1.28) {
    complexityCategory = 'moderate';
    speedCategory = 'slower';
  } else {
    complexityCategory = 'difficult';
    speedCategory = 'slowest';
  }

  return {
    multiplier: clamped,
    length,
    syllables,
    complexityCategory,
    speedCategory,
    reasons,
  };
}

/**
 * Fast-path helper returning just the numeric Smart Pace multiplier.
 */
export function getSmartPaceMultiplier(word: HighlightedWordParts | string): number {
  return analyzeWordSmartPace(word).multiplier;
}

/**
 * Computes effective reading speed (WPM) accounting for Warm-up Mode.
 *
 * Warm-up Mode gradually increases reading speed from a user-defined starting WPM
 * to their target WPM over the first 300 words of a session.
 */
export function calculateWarmupStatus(
  targetWpm: number,
  warmupMode: boolean,
  warmupStartWpm: number = DEFAULT_WARMUP_START_WPM,
  sessionWordsRead: number = 0,
  totalWarmupWords: number = WARMUP_TOTAL_WORDS
): WarmupStatus {
  const safeTargetWpm = Math.max(50, Math.round(targetWpm));
  const safeStartWpm = Math.max(50, Math.min(safeTargetWpm, Math.round(warmupStartWpm || DEFAULT_WARMUP_START_WPM)));

  if (!warmupMode || safeStartWpm >= safeTargetWpm) {
    return {
      isActive: false,
      isWarmingUp: false,
      targetWpm: safeTargetWpm,
      startWpm: safeStartWpm,
      currentWpm: safeTargetWpm,
      sessionWordsRead,
      totalWarmupWords,
      progressPercent: 100,
    };
  }

  const clampedWords = Math.max(0, Math.min(totalWarmupWords, sessionWordsRead));
  const isWarmingUp = clampedWords < totalWarmupWords;
  const progressRatio = totalWarmupWords > 0 ? clampedWords / totalWarmupWords : 1.0;
  const progressPercent = Math.round(progressRatio * 100);

  // Linear progression from startWpm to targetWpm over totalWarmupWords
  const currentWpm = Math.round(safeStartWpm + (safeTargetWpm - safeStartWpm) * progressRatio);

  return {
    isActive: true,
    isWarmingUp,
    targetWpm: safeTargetWpm,
    startWpm: safeStartWpm,
    currentWpm,
    sessionWordsRead: clampedWords,
    totalWarmupWords,
    progressPercent,
  };
}
