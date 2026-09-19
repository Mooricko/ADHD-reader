/**
 * Large Document Thresholds & Performance Diagnostics
 * 
 * Phase 1: Stability, Diagnostics & Low-Risk Optimizations
 * 
 * Rationale for thresholds:
 * 
 * 1. LARGE_DOCUMENT_CHARACTER_THRESHOLD (100,000 chars / ~15,000-20,000 words):
 *    - Typical length of a long academic paper, technical report, or novella.
 *    - In V8, single-string manipulations and frequent array splits at this size
 *      begin producing noticeable Minor GC pressure during interactive 60fps renders.
 *    - In browser LocalStorage (typically capped at 5MB across all origins and keys),
 *      a 100KB string uses 2-5% of the entire domain storage capacity.
 * 
 * 2. LARGE_DOCUMENT_WORD_THRESHOLD (20,000 words):
 *    - Corresponds to ~100-150KB of prose.
 *    - At this count, token arrays with metadata objects (HighlightedWordParts[])
 *      contain 20,000+ objects. Eager re-tokenization or un-memoized loops
 *      introduce measurable UI main-thread pauses (>50ms).
 * 
 * 3. VERY_LARGE_DOCUMENT_CHARACTER_THRESHOLD (500,000 chars / ~100,000 words):
 *    - Full-length book/novel scale (e.g. The Great Gatsby is ~250k chars, Moby Dick ~1.2M chars).
 *    - Writing payloads of this size to synchronous localStorage risks hitting
 *      QuotaExceededError immediately or freezing the UI thread for 100-300ms.
 * 
 * 4. EXTREME_DOCUMENT_CHARACTER_THRESHOLD (1,000,000 chars / ~200,000 words):
 *    - Multiple books, encyclopedic volumes, or massive logs.
 *    - Requires guarded in-memory handling and strict avoidance of intermediate array cloning.
 */

export const LARGE_DOCUMENT_CHARACTER_THRESHOLD = 100_000;
export const LARGE_DOCUMENT_WORD_THRESHOLD = 20_000;
export const VERY_LARGE_DOCUMENT_CHARACTER_THRESHOLD = 500_000;
export const EXTREME_DOCUMENT_CHARACTER_THRESHOLD = 1_000_000;

export type DocumentScale = 'normal' | 'large' | 'very-large' | 'extreme';

export interface DiagnosticTimingRecord {
  label: string;
  durationMs: number;
  charCount?: number;
  wordCount?: number;
  paragraphCount?: number;
  timestamp: number;
  scale?: DocumentScale;
  extra?: Record<string, any>;
}

const isDev = Boolean(
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production')
);

// In-memory ring buffer of recent diagnostics (kept light, max 50 entries)
const diagnosticsLog: DiagnosticTimingRecord[] = [];
const MAX_LOG_ENTRIES = 50;

/**
 * Classifies document scale based on character count or word count.
 */
export function classifyDocumentScale(charCount: number, wordCount?: number): DocumentScale {
  const chars = charCount || (wordCount ? wordCount * 6 : 0);
  if (chars >= EXTREME_DOCUMENT_CHARACTER_THRESHOLD) return 'extreme';
  if (chars >= VERY_LARGE_DOCUMENT_CHARACTER_THRESHOLD) return 'very-large';
  if (chars >= LARGE_DOCUMENT_CHARACTER_THRESHOLD || (wordCount && wordCount >= LARGE_DOCUMENT_WORD_THRESHOLD)) {
    return 'large';
  }
  return 'normal';
}

/**
 * Checks if document exceeds large document threshold.
 */
export function isLargeDocument(charCountOrText: number | string, wordCount?: number): boolean {
  const chars = typeof charCountOrText === 'string' ? charCountOrText.length : charCountOrText;
  return (
    chars >= LARGE_DOCUMENT_CHARACTER_THRESHOLD ||
    (wordCount !== undefined && wordCount >= LARGE_DOCUMENT_WORD_THRESHOLD)
  );
}

/**
 * Synchronous performance measurement wrapper (Dev-only logging).
 * Zero overhead in production.
 */
export function measureDevTiming<T>(
  label: string,
  fn: () => T,
  getStats?: (result: T) => { charCount?: number; wordCount?: number; paragraphCount?: number; extra?: Record<string, any> }
): T {
  if (!isDev) {
    return fn();
  }

  const start = performance.now();
  let result: T;
  try {
    result = fn();
  } catch (error) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    console.error(`[Perf: ${label} FAILED] ${durationMs}ms:`, error);
    throw error;
  }

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const stats = getStats ? getStats(result) : undefined;
  const charCount = stats?.charCount;
  const wordCount = stats?.wordCount;
  const paragraphCount = stats?.paragraphCount;
  const scale = charCount !== undefined ? classifyDocumentScale(charCount, wordCount) : undefined;

  recordDiagnostic({
    label,
    durationMs,
    charCount,
    wordCount,
    paragraphCount,
    scale,
    timestamp: Date.now(),
    extra: stats?.extra,
  });

  return result;
}

/**
 * Asynchronous performance measurement wrapper (Dev-only logging).
 * Zero overhead in production.
 */
export async function measureDevAsyncTiming<T>(
  label: string,
  fn: () => Promise<T>,
  getStats?: (result: T) => { charCount?: number; wordCount?: number; paragraphCount?: number; extra?: Record<string, any> }
): Promise<T> {
  if (!isDev) {
    return await fn();
  }

  const start = performance.now();
  let result: T;
  try {
    result = await fn();
  } catch (error) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    console.error(`[Perf: ${label} FAILED] ${durationMs}ms:`, error);
    throw error;
  }

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const stats = getStats ? getStats(result) : undefined;
  const charCount = stats?.charCount;
  const wordCount = stats?.wordCount;
  const paragraphCount = stats?.paragraphCount;
  const scale = charCount !== undefined ? classifyDocumentScale(charCount, wordCount) : undefined;

  recordDiagnostic({
    label,
    durationMs,
    charCount,
    wordCount,
    paragraphCount,
    scale,
    timestamp: Date.now(),
    extra: stats?.extra,
  });

  return result;
}

/**
 * Log a structured dev diagnostic.
 */
export function logDevDiagnostic(label: string, details: Record<string, any>): void {
  if (!isDev) return;
  console.info(`[Diagnostic: ${label}]`, details);
}

function recordDiagnostic(record: DiagnosticTimingRecord): void {
  if (diagnosticsLog.length >= MAX_LOG_ENTRIES) {
    diagnosticsLog.shift();
  }
  diagnosticsLog.push(record);

  if (isDev) {
    const parts = [`[Perf: ${record.label}] ${record.durationMs}ms`];
    if (record.charCount !== undefined) parts.push(`${record.charCount.toLocaleString()} chars`);
    if (record.wordCount !== undefined) parts.push(`${record.wordCount.toLocaleString()} words`);
    if (record.paragraphCount !== undefined) parts.push(`${record.paragraphCount.toLocaleString()} paragraphs`);
    if (record.scale && record.scale !== 'normal') parts.push(`[scale: ${record.scale}]`);
    console.debug(parts.join(' | '));
  }
}

/**
 * Returns recent diagnostics for in-app inspection or test suites.
 */
export function getRecentDiagnostics(): readonly DiagnosticTimingRecord[] {
  return diagnosticsLog;
}

/**
 * Clears diagnostics history.
 */
export function clearDiagnostics(): void {
  diagnosticsLog.length = 0;
}
