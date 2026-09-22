import { HighlightedWordParts, HeatmapBucket, ReadingHeatmapData, ComplexityLevel } from '../types';

/**
 * Color stops for the reading complexity heatmap (cool to hot).
 * Low Dwell (Fast/Skimmed) -> Moderate Dwell -> High Dwell (Complex/Re-read)
 */
interface ColorStop {
  position: number;
  r: number;
  g: number;
  b: number;
}

const HEATMAP_STOPS: ColorStop[] = [
  { position: 0.0, r: 16, g: 185, b: 129 },   // #10b981 - Emerald Green (smooth/fast)
  { position: 0.22, r: 6, g: 182, b: 212 },   // #06b6d4 - Cyan / Teal (comfortable pace)
  { position: 0.45, r: 59, g: 130, b: 246 },  // #3b82f6 - Azure Blue (steady pace)
  { position: 0.65, r: 245, g: 158, b: 11 },  // #f59e0b - Amber Gold (moderate focus)
  { position: 0.82, r: 249, g: 115, b: 22 },  // #f97316 - Warm Orange (increased dwell)
  { position: 1.0, r: 239, g: 68, b: 68 },    // #ef4444 - Crimson Red (peak complexity / re-read)
];

/**
 * Interpolates between color stops to return an RGB hex code for an intensity between 0 and 1.
 */
export function interpolateHeatmapColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));

  // Find surrounding stops
  let lower = HEATMAP_STOPS[0];
  let upper = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];

  for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
    if (clamped >= HEATMAP_STOPS[i].position && clamped <= HEATMAP_STOPS[i + 1].position) {
      lower = HEATMAP_STOPS[i];
      upper = HEATMAP_STOPS[i + 1];
      break;
    }
  }

  const range = upper.position - lower.position;
  const factor = range === 0 ? 0 : (clamped - lower.position) / range;

  const r = Math.round(lower.r + factor * (upper.r - lower.r));
  const g = Math.round(lower.g + factor * (upper.g - lower.g));
  const b = Math.round(lower.b + factor * (upper.b - lower.b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Calculates intrinsic lexical complexity for a single word based on character length,
 * syllable proxies, and punctuation pauses.
 */
export function calculateLexicalComplexity(word?: HighlightedWordParts | null): number {
  if (!word || !word.original) return 0;
  const clean = word.original.replace(/[^\w]/g, '');
  const len = clean.length;
  
  let score = 0;
  if (len >= 8) score += 0.25;
  if (len >= 11) score += 0.35;
  if (len >= 14) score += 0.45;

  // Syllable estimate proxy (vowel diphthongs / clusters)
  const vowelMatches = clean.match(/[aeiouy]{1,2}/gi);
  const syllableEstimate = vowelMatches ? vowelMatches.length : 1;
  if (syllableEstimate >= 4) score += 0.3;

  if (word.hasSentenceEnd) score += 0.15;
  if (word.hasClausePause) score += 0.1;

  return Math.min(1.2, score);
}

/**
 * Generates segmented bucket data for the reading progress heatmap.
 */
export function generateReadingHeatmap(
  words: HighlightedWordParts[],
  dwellTimes: number[],
  currentIndex: number,
  wpm: number,
  customTotalWords?: number
): ReadingHeatmapData {
  const totalWords = customTotalWords !== undefined ? customTotalWords : (words ? words.length : 0);
  if (totalWords === 0) {
    return {
      buckets: [],
      totalDwellMs: 0,
      avgBucketDwellMs: 0,
      maxBucketDwellMs: 0,
      complexSectionsCount: 0,
      mostComplexBucket: null,
      gradientCss: 'rgba(148, 163, 184, 0.2)',
    };
  }

  // Build index lookup map for windowed chunks
  const wordMap = new Map<number, HighlightedWordParts>();
  let hasExplicitIndices = false;
  if (words && words.length > 0) {
    if (typeof words[0].index === 'number') {
      hasExplicitIndices = true;
      for (const w of words) {
        if (typeof w.index === 'number') {
          wordMap.set(w.index, w);
        }
      }
    }
  }

  const getWordAtIndex = (idx: number): HighlightedWordParts | undefined => {
    if (hasExplicitIndices) {
      return wordMap.get(idx);
    }
    return words[idx];
  };

  // Dynamic bucket count based on document size (between 30 and 75 buckets)
  const bucketCount = Math.min(75, Math.max(25, Math.floor(totalWords / 6)));
  const wordsPerBucket = totalWords / bucketCount;

  const baselineWordMs = (60 / Math.max(60, wpm)) * 1000;
  const rawBucketDwells: number[] = new Array(bucketCount).fill(0);
  const bucketWordCounts: number[] = new Array(bucketCount).fill(0);
  let totalDwellMs = 0;

  // Aggregate dwell times & baseline weights
  for (let i = 0; i < totalWords; i++) {
    const bIndex = Math.min(bucketCount - 1, Math.floor(i / wordsPerBucket));
    const recordedDwell = (dwellTimes && dwellTimes[i]) || 0;
    const wordObj = getWordAtIndex(i);
    const lexicalBonus = wordObj ? calculateLexicalComplexity(wordObj) * baselineWordMs * 0.4 : 0;
    
    // Total effective dwell incorporates actual reader time plus baseline structure
    const effectiveDwell = recordedDwell > 0 ? recordedDwell + lexicalBonus * 0.2 : lexicalBonus * 0.5;
    
    rawBucketDwells[bIndex] += effectiveDwell;
    bucketWordCounts[bIndex] += 1;
    totalDwellMs += recordedDwell;
  }

  // Calculate average dwell per word in each bucket
  const avgDwellPerWord: number[] = rawBucketDwells.map((total, idx) => {
    const count = bucketWordCounts[idx] || 1;
    return total / count;
  });

  // Determine minimum and maximum values for normalization
  const validDwells = avgDwellPerWord.filter((v) => v > 0);
  const minDwell = validDwells.length > 0 ? Math.min(...validDwells) : baselineWordMs * 0.5;
  const maxDwell = validDwells.length > 0 ? Math.max(...validDwells) : baselineWordMs * 2;
  const dwellSpread = Math.max(baselineWordMs * 0.5, maxDwell - minDwell);

  const buckets: HeatmapBucket[] = [];
  let complexCount = 0;
  let mostComplex: HeatmapBucket | null = null;
  let highestIntensity = -1;

  for (let b = 0; b < bucketCount; b++) {
    const startWord = Math.floor(b * wordsPerBucket);
    const endWord = Math.min(totalWords - 1, Math.floor((b + 1) * wordsPerBucket) - 1);
    const progressPercent = Math.round(((b + 1) / bucketCount) * 100);
    const isCurrent = currentIndex >= startWord && currentIndex <= endWord;
    const isRead = currentIndex >= startWord || (rawBucketDwells[b] > baselineWordMs * 0.3);

    // Calculate relative intensity (0.0 to 1.0)
    const currentAvgDwell = avgDwellPerWord[b];
    let intensity = (currentAvgDwell - minDwell) / dwellSpread;
    intensity = Math.max(0, Math.min(1, intensity));

    // Determine complexity level
    let complexityLevel: ComplexityLevel = 'unread';
    let complexityLabel = 'Not yet read';

    if (isRead) {
      if (intensity >= 0.75) {
        complexityLevel = 'peak';
        complexityLabel = 'High Dwell / Complex Section (Frequent pauses or re-read)';
        complexCount++;
      } else if (intensity >= 0.55) {
        complexityLevel = 'high';
        complexityLabel = 'Moderate-High Focus (Dense vocabulary/sentence)';
        complexCount++;
      } else if (intensity >= 0.28) {
        complexityLevel = 'moderate';
        complexityLabel = 'Standard Reading Pace';
      } else {
        complexityLevel = 'low';
        complexityLabel = 'Fast / Skimmed (Light cognitive load)';
      }
    }

    const color = isRead ? interpolateHeatmapColor(intensity) : 'rgba(148, 163, 184, 0.22)';

    // Extract sample snippet
    const snippetTokens: string[] = [];
    for (let si = startWord; si <= Math.min(endWord, startWord + 5); si++) {
      const w = getWordAtIndex(si);
      if (w && w.original) snippetTokens.push(w.original);
    }
    const sampleSnippet = snippetTokens.length > 0
      ? snippetTokens.join(' ') + (endWord - startWord >= 6 ? '...' : '')
      : `Words ${startWord + 1}–${endWord + 1}`;

    const bucketItem: HeatmapBucket = {
      index: b,
      startWord,
      endWord,
      progressPercent,
      dwellTimeMs: Math.round(rawBucketDwells[b]),
      visitCount: Math.round(rawBucketDwells[b] / Math.max(100, baselineWordMs)),
      relativeIntensity: intensity,
      color,
      isCurrent,
      isRead,
      sampleSnippet,
      complexityLevel,
      complexityLabel,
    };

    buckets.push(bucketItem);

    if (isRead && intensity > highestIntensity) {
      highestIntensity = intensity;
      mostComplex = bucketItem;
    }
  }

  // Construct continuous CSS linear gradient
  const gradientStops: string[] = [];
  const pctStep = 100 / bucketCount;

  buckets.forEach((bucket, i) => {
    const startPct = (i * pctStep).toFixed(1);
    const endPct = ((i + 1) * pctStep).toFixed(1);
    gradientStops.push(`${bucket.color} ${startPct}% ${endPct}%`);
  });

  const gradientCss = `linear-gradient(to right, ${gradientStops.join(', ')})`;

  return {
    buckets,
    totalDwellMs,
    avgBucketDwellMs: Math.round(totalDwellMs / bucketCount),
    maxBucketDwellMs: Math.round(maxDwell),
    complexSectionsCount: complexCount,
    mostComplexBucket: mostComplex,
    gradientCss,
  };
}
