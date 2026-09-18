import { isRtlText } from './textParser';

/**
 * Normalizes input text into clean, readable prose:
 * - Standardizes line breaks (\r\n -> \n)
 * - Performs Unicode NFC normalization
 * - Collapses excessive horizontal whitespace and tabs
 * - Limits consecutive line breaks to max 2 (\n\n for paragraph separation)
 * - Removes non-printable control characters while preserving ZWNJ (\u200C) and ZWJ (\u200D)
 * - Preserves Persian/Arabic/Hebrew RTL and Unicode scripts faithfully
 */
export function normalizeText(rawText: string): string {
  if (!rawText) return '';

  // 1. Unicode NFC normalization
  let text = rawText.normalize('NFC');

  // 2. Normalize Windows and old Mac line breaks to standard Unix \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Replace non-breaking spaces and zero-width spaces that aren't ZWNJ/ZWJ
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/[\u200B\uFEFF]/g, ''); // Remove zero-width spaces and BOM, keeping \u200C (ZWNJ) and \u200D (ZWJ)

  // 4. Strip dangerous non-printable ASCII control characters (keeping \t and \n)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 5. Clean up trailing horizontal spaces on each line
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');

  // 6. Collapse excessive blank lines (cap at 2 newlines = 1 blank line between paragraphs)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Derives a clean, readable title from text content if none was supplied.
 */
export function extractSuggestedTitle(content: string, fallback = 'Imported Reading'): string {
  if (!content || !content.trim()) return fallback;

  // Look for the first non-empty line
  const lines = content.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim().replace(/^#+\s*/, '').replace(/^[*\-•\d.]+\s*/, '').trim();
    if (trimmed.length > 2) {
      if (trimmed.length <= 65) {
        return trimmed;
      }
      return trimmed.slice(0, 62).trim() + '...';
    }
  }

  return fallback;
}

/**
 * Detects text language direction ('rtl' or 'ltr').
 */
export function detectTextDirection(text: string): 'rtl' | 'ltr' {
  return isRtlText(text) ? 'rtl' : 'ltr';
}

/**
 * Counts words accurately across Latin and non-Latin/RTL scripts.
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
