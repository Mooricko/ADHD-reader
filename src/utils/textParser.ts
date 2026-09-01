import { HighlightedWordParts, HighlightStyle } from '../types';

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
 */
export function splitWordParts(token: string, style: HighlightStyle = 'middle-two', index: number = 0): HighlightedWordParts {
  // Extract leading punctuation (e.g. quotes, brackets, currency symbols)
  const leadingMatch = token.match(/^[^a-zA-Z0-9\u00C0-\u024F]+/);
  const prefixPunct = leadingMatch ? leadingMatch[0] : '';
  const remainingAfterPrefix = token.slice(prefixPunct.length);

  // Extract trailing punctuation (e.g. commas, periods, quotes, brackets)
  const trailingMatch = remainingAfterPrefix.match(/[^a-zA-Z0-9\u00C0-\u024F]+$/);
  const suffixPunct = trailingMatch ? trailingMatch[0] : '';
  const coreWord = remainingAfterPrefix.slice(0, remainingAfterPrefix.length - suffixPunct.length);

  // Check punctuation types for smart pauses
  const hasSentenceEnd = /[.!?…]+/.test(suffixPunct);
  const hasClausePause = /[,;:\-—–]/.test(suffixPunct) || /[,;:\-—–]/.test(token);

  if (!coreWord) {
    return {
      original: token,
      prefixPunct,
      beforeHighlight: '',
      highlightedText: token,
      afterHighlight: '',
      suffixPunct: '',
      hasSentenceEnd,
      hasClausePause,
      hasParagraphBreak: false,
      index,
    };
  }

  const len = coreWord.length;
  let start = 0;
  let end = 0;

  if (style === 'middle-two') {
    // Specifically highlight the two middle letters
    if (len === 1) {
      start = 0;
      end = 1;
    } else if (len === 2) {
      start = 0;
      end = 2;
    } else if (len === 3) {
      start = 1;
      end = 2; // middle 1 letter (e.g. t[h]e)
    } else if (len === 4) {
      start = 1;
      end = 3; // exact middle 2 letters (e.g. r[ea]d, w[or]d, A[DH]D)
    } else {
      // For words length >= 5: middle 2 letters
      start = Math.floor((len - 2) / 2);
      end = start + 2;
    }
  } else if (style === 'middle-single') {
    // Single focal letter at optimal recognition point
    if (len <= 2) {
      start = 0;
      end = 1;
    } else {
      start = Math.floor((len - 1) / 2);
      end = start + 1;
    }
  } else if (style === 'bionic-prefix') {
    // Bionic style: first 40-50% of the word
    start = 0;
    if (len <= 3) end = 1;
    else if (len <= 5) end = 2;
    else if (len <= 8) end = 3;
    else end = Math.ceil(len * 0.45);
  }

  const beforeHighlight = coreWord.slice(0, start);
  const highlightedText = coreWord.slice(start, end);
  const afterHighlight = coreWord.slice(end);

  return {
    original: token,
    prefixPunct,
    beforeHighlight,
    highlightedText,
    afterHighlight,
    suffixPunct,
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
