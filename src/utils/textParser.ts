import { HighlightedWordParts, HighlightStyle } from '../types';

/**
 * Checks if a string contains Right-to-Left (Persian/Arabic/Hebrew) characters.
 */
export function isRtlText(text: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Extracts visible letter indices, excluding Zero-Width Non-Joiner (\u200C),
 * Zero-Width Joiner (\u200D), and Unicode diacritics/marks.
 */
function getVisibleLetterIndices(text: string): number[] {
  const visibleIndices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\u200C' && ch !== '\u200D' && !/\p{M}/u.test(ch)) {
      visibleIndices.push(i);
    }
  }
  return visibleIndices;
}

/**
 * Calculates start and end visible character indices for RTL languages (such as Farsi and Arabic).
 * 
 * RTL-Specific Visual Center & ORP Rules:
 * 1. Visual Center & ORP Positioning:
 *    RTL text is read from right to left (index 0 is at the right edge). In RTL reading ergonomics,
 *    the eye's Optimal Recognition Point (ORP) is positioned at ~35-40% from the right edge,
 *    anchoring lexical access faster than the 50% geometric middle of Latin scripts.
 * 2. Two-Character Selection (middle-two):
 *    - 1 letter: The single letter.
 *    - 2 letters: Both letters.
 *    - 3 letters: Root onset / medial focal anchor at indices [0, 2] (initial + medial letters).
 *    - 4 letters: Medial two letters [1, 3] (symmetrical focal core, e.g. ک[تا]ب).
 *    - 5 letters: Medial-right focal pair [1, 3] (matching 35-40% RTL visual center, e.g. ت[مر]کز).
 *    - 6 letters: Exact visual center [2, 4] (e.g. خو[ان]دن).
 *    - 7-8 letters: Optical center [2, 4] (~35% RTL fixation point, e.g. دان[شگ]اه).
 *    - 9-10 letters: Optical center [3, 5].
 *    - 11+ letters: 35% from the right edge.
 * 3. Single-Letter Selection (middle-single):
 *    - Anchors directly on the RTL visual center letter.
 * 4. Bionic Prefix:
 *    - Highlights the initial 40-50% root letters from right to left.
 */
export function calculateRtlHighlightRange(
  visibleLen: number,
  style: HighlightStyle = 'middle-two'
): { startVis: number; endVis: number } {
  if (style === 'middle-two') {
    if (visibleLen <= 1) {
      return { startVis: 0, endVis: 1 };
    }
    if (visibleLen === 2) {
      return { startVis: 0, endVis: 2 };
    }
    if (visibleLen === 3) {
      return { startVis: 0, endVis: 2 };
    }
    if (visibleLen === 4) {
      return { startVis: 1, endVis: 3 };
    }
    if (visibleLen === 5) {
      return { startVis: 1, endVis: 3 };
    }
    if (visibleLen === 6) {
      return { startVis: 2, endVis: 4 };
    }
    if (visibleLen === 7 || visibleLen === 8) {
      return { startVis: 2, endVis: 4 };
    }
    if (visibleLen === 9 || visibleLen === 10) {
      return { startVis: 3, endVis: 5 };
    }
    const startVis = Math.max(1, Math.floor(visibleLen * 0.35));
    return { startVis, endVis: Math.min(visibleLen, startVis + 2) };
  } else if (style === 'middle-single') {
    if (visibleLen <= 2) {
      return { startVis: 0, endVis: 1 };
    }
    if (visibleLen === 3) {
      return { startVis: 1, endVis: 2 };
    }
    if (visibleLen === 4) {
      return { startVis: 1, endVis: 2 };
    }
    if (visibleLen === 5 || visibleLen === 6) {
      return { startVis: 2, endVis: 3 };
    }
    const startVis = Math.floor(visibleLen * 0.38);
    return { startVis, endVis: startVis + 1 };
  } else {
    // bionic-prefix
    let endVis = 1;
    if (visibleLen <= 3) endVis = 1;
    else if (visibleLen <= 5) endVis = 2;
    else if (visibleLen <= 8) endVis = 3;
    else endVis = Math.ceil(visibleLen * 0.45);
    return { startVis: 0, endVis };
  }
}

/**
 * Splits text into paragraphs and words, identifying punctuation and calculating
 * the exact middle letters to highlight for RSVP/Bionic reading.
 */
export function parseTextIntoWords(rawText: string, highlightStyle: HighlightStyle = 'middle-two'): HighlightedWordParts[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // Normalize line endings and whitespace
  const paragraphs = rawText.split(/\r?\n+/);
  const result: HighlightedWordParts[] = [];
  let globalWordIndex = 0;

  paragraphs.forEach((paragraph, pIndex) => {
    const rawTokens = paragraph.trim().split(/\s+/).filter(Boolean);
    const isLastParagraph = pIndex === paragraphs.length - 1;

    rawTokens.forEach((token, wIndex) => {
      const isLastInParagraph = wIndex === rawTokens.length - 1;
      const parsedWord = splitWordParts(token, highlightStyle, globalWordIndex);
      
      if (isLastInParagraph && !isLastParagraph) {
        parsedWord.hasParagraphBreak = true;
      }

      result.push(parsedWord);
      globalWordIndex++;
    });
  });

  return result;
}

/**
 * Breaks an individual token into leading punctuation, word before highlight,
 * highlighted middle letters, word after highlight, and trailing punctuation.
 * Fully supports Unicode, Persian/Arabic (RTL), ZWNJ, and Latin alphabets.
 */
export function splitWordParts(token: string, style: HighlightStyle = 'middle-two', index: number = 0): HighlightedWordParts {
  // Extract leading non-letter/non-digit punctuation across all alphabets
  const leadingMatch = token.match(/^[^\p{L}\p{N}]+/u);
  const prefixPunct = leadingMatch ? leadingMatch[0] : '';
  const remainingAfterPrefix = token.slice(prefixPunct.length);

  // Extract trailing non-letter/non-digit punctuation (including Persian commas '،', semicolons '؛', question marks '؟')
  const trailingMatch = remainingAfterPrefix.match(/[^\p{L}\p{N}]+$/u);
  const suffixPunct = trailingMatch ? trailingMatch[0] : '';
  const coreWord = remainingAfterPrefix.slice(0, remainingAfterPrefix.length - suffixPunct.length);

  const isRtl = isRtlText(token);

  // Check punctuation types for smart pauses (including Persian punctuation: '۔', '؟', '،', '؛')
  const hasSentenceEnd = /[.!?…۔؟]+/.test(suffixPunct);
  const hasClausePause = /[,;:\-—–،؛]/.test(suffixPunct) || /[,;:\-—–،؛]/.test(token);

  if (!coreWord) {
    return {
      original: token,
      prefixPunct: token,
      beforeHighlight: '',
      highlightedText: '',
      afterHighlight: '',
      suffixPunct: '',
      isRtl,
      hasSentenceEnd,
      hasClausePause,
      hasParagraphBreak: false,
      index,
    };
  }

  let beforeHighlight = '';
  let highlightedText = '';
  let afterHighlight = '';

  if (isRtl) {
    // RTL Highlighting Logic (Farsi, Arabic, Hebrew)
    // Preserves ZWNJ (\u200C) morpheme boundaries and calculates visual center based on RTL ORP
    if (coreWord.includes('\u200C')) {
      const parts = coreWord.split('\u200C');
      const commonPrefixes = ['می', 'نمی', 'بی', 'به', 'هم', 'نا', 'پیش', 'باز', 'فرا', 'پی'];
      const commonSuffixes = [
        'ها', 'های', 'تر', 'ترین', 'مان', 'تان', 'شان', 'اند', 'است', 'ایم', 'اید',
        'ام', 'ات', 'اش', 'مند', 'شناس', 'شناسی', 'آمیز', 'طلب'
      ];

      let chosenIndex = 0;
      if (commonPrefixes.includes(parts[0]) && parts.length > 1) {
        chosenIndex = 1;
      } else if (commonSuffixes.includes(parts[parts.length - 1]) && parts.length > 1) {
        chosenIndex = 0;
      } else {
        // Pick longest part to anchor visual center on the primary semantic root
        let maxLen = -1;
        parts.forEach((p, idx) => {
          if (p.length > maxLen) {
            maxLen = p.length;
            chosenIndex = idx;
          }
        });
      }

      let partOffset = 0;
      for (let p = 0; p < chosenIndex; p++) {
        partOffset += parts[p].length + 1; // +1 for the \u200C character
      }

      const chosenPart = parts[chosenIndex];
      const partVis = getVisibleLetterIndices(chosenPart);

      if (partVis.length === 0) {
        beforeHighlight = coreWord;
        highlightedText = '';
        afterHighlight = '';
      } else {
        const { startVis, endVis } = calculateRtlHighlightRange(partVis.length, style);
        const rawStart = partOffset + partVis[startVis];
        const rawEnd = partOffset + partVis[endVis - 1] + 1;

        beforeHighlight = coreWord.slice(0, rawStart);
        highlightedText = coreWord.slice(rawStart, rawEnd);
        afterHighlight = coreWord.slice(rawEnd);
      }
    } else {
      // Single RTL word (no ZWNJ)
      const visibleIndices = getVisibleLetterIndices(coreWord);
      const visibleLen = visibleIndices.length;

      if (visibleLen === 0) {
        beforeHighlight = coreWord;
        highlightedText = '';
        afterHighlight = '';
      } else {
        const { startVis, endVis } = calculateRtlHighlightRange(visibleLen, style);
        const rawStart = visibleIndices[startVis] ?? 0;
        const rawEnd = (visibleIndices[endVis - 1] ?? rawStart) + 1;

        beforeHighlight = coreWord.slice(0, rawStart);
        highlightedText = coreWord.slice(rawStart, rawEnd);
        afterHighlight = coreWord.slice(rawEnd);
      }
    }
  } else {
    // English / LTR Highlighting Logic
    const visibleIndices = getVisibleLetterIndices(coreWord);
    const visibleLen = visibleIndices.length;
    let startVis = 0;
    let endVis = 0;

    if (style === 'middle-two') {
      if (visibleLen <= 1) {
        startVis = 0;
        endVis = 1;
      } else if (visibleLen === 2) {
        startVis = 0;
        endVis = 2;
      } else if (visibleLen === 3) {
        startVis = 0;
        endVis = 2;
      } else if (visibleLen === 4) {
        startVis = 1;
        endVis = 3;
      } else {
        startVis = Math.floor((visibleLen - 2) / 2);
        endVis = startVis + 2;
      }
    } else if (style === 'middle-single') {
      if (visibleLen <= 2) {
        startVis = 0;
        endVis = 1;
      } else {
        startVis = Math.floor((visibleLen - 1) / 2);
        endVis = startVis + 1;
      }
    } else if (style === 'bionic-prefix') {
      startVis = 0;
      if (visibleLen <= 3) endVis = 1;
      else if (visibleLen <= 5) endVis = 2;
      else if (visibleLen <= 8) endVis = 3;
      else endVis = Math.ceil(visibleLen * 0.45);
    }

    const rawStartIndex = visibleIndices[startVis] ?? 0;
    const rawEndIndex = (visibleIndices[endVis - 1] ?? (coreWord.length - 1)) + 1;

    beforeHighlight = coreWord.slice(0, rawStartIndex);
    highlightedText = coreWord.slice(rawStartIndex, rawEndIndex);
    afterHighlight = coreWord.slice(rawEndIndex);
  }

  return {
    original: token,
    prefixPunct,
    beforeHighlight,
    highlightedText,
    afterHighlight,
    suffixPunct,
    isRtl,
    hasSentenceEnd,
    hasClausePause,
    hasParagraphBreak: false,
    index,
  };
}

/**
 * Calculates the display duration in ms for a given word token based on base WPM,
 * punctuation pauses, and word complexity.
 */
export function calculateWordDelayMs(
  word: HighlightedWordParts,
  wpm: number,
  smartPause: boolean = true
): number {
  const baseMs = (60 / Math.max(50, wpm)) * 1000;
  
  if (!smartPause) {
    return baseMs;
  }

  let multiplier = 1.0;

  if (word.hasParagraphBreak) {
    multiplier = 2.4;
  } else if (word.hasSentenceEnd) {
    multiplier = 2.1;
  } else if (word.hasClausePause) {
    multiplier = 1.45;
  } else if (word.original.length > 9) {
    multiplier = 1.2;
  }

  return Math.round(baseMs * multiplier);
}

/**
 * Calculate reading statistics for a text
 */
export function calculateTextStats(text: string, wpm: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = text.length;
  const estimatedMinutes = wordCount / Math.max(1, wpm);
  const estimatedSecondsTotal = Math.round(estimatedMinutes * 60);

  const mins = Math.floor(estimatedSecondsTotal / 60);
  const secs = estimatedSecondsTotal % 60;
  const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return {
    wordCount,
    charCount,
    estimatedMinutes,
    timeFormatted,
    estimatedSecondsTotal,
  };
}
