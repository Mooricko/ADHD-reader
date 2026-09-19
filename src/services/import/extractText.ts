import { ReaderDocument, InputSourceType } from '../../types';
import { detectInputType, isUrlString, isMarkdownString } from './detectInput';
import { extractTxt } from './extractTxt';
import { extractMarkdown } from './extractMarkdown';
import { extractPdf } from './extractPdf';
import { extractUrl } from './extractUrl';
import { normalizeText, extractSuggestedTitle, detectTextDirection, countWords } from '../../utils/normalizeText';
import { measureDevAsyncTiming } from '../../utils/performanceDiagnostics';

export type ProgressCallback = (percent: number, message: string) => void;

/**
 * Cleanly extracts readable text from rich HTML or plain text from clipboard.
 */
export function extractClipboardContent(html?: string, plainText?: string): string {
  if (typeof DOMParser !== 'undefined' && html && html.includes('<') && html.includes('>')) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Remove scripts, styles, etc.
      doc.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove());
      
      // Replace breaks and paragraphs with newlines
      doc.querySelectorAll('br, p, div, h1, h2, h3, h4, h5, h6, li, tr').forEach((el) => {
        el.insertAdjacentText('afterend', '\n');
      });

      const text = doc.body?.textContent || '';
      if (text && text.trim().length > 10) {
        return normalizeText(text);
      }
    } catch {
      // Fall through to plain text
    }
  } else if (html && html.includes('<') && html.includes('>')) {
    // Clean regex strip fallback for Node/non-DOM environments
    let stripped = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    stripped = stripped.replace(/<br\s*\/?>/gi, '\n');
    stripped = stripped.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
    stripped = stripped.replace(/<[^>]+>/g, '');
    return normalizeText(stripped);
  }

  return normalizeText(plainText || '');
}

/**
 * Unified pipeline that converts any user input (File, URL, Markdown, TXT, PDF, or raw text)
 * into a normalized ReaderDocument.
 */
export async function processUniversalInput(
  input: File | Blob | string,
  options?: {
    forcedType?: InputSourceType;
    fileName?: string;
    title?: string;
    onProgress?: ProgressCallback;
  }
): Promise<ReaderDocument> {
  return await measureDevAsyncTiming(
    'import processing',
    async () => {
      const onProgress = options?.onProgress;
      onProgress?.(5, 'Detecting input format...');

      const detectedType = options?.forcedType || detectInputType(input);

      switch (detectedType) {
        case 'pdf': {
          onProgress?.(15, 'Reading PDF file...');
          return await extractPdf(input as File | Blob, options?.fileName, onProgress);
        }

        case 'markdown': {
          onProgress?.(20, 'Parsing Markdown structure...');
          const doc = await extractMarkdown(input, options?.fileName);
          if (options?.title) doc.title = options.title;
          onProgress?.(100, 'Ready');
          return doc;
        }

        case 'txt': {
          onProgress?.(20, 'Reading text document...');
          const doc = await extractTxt(input, options?.fileName);
          if (options?.title) doc.title = options.title;
          onProgress?.(100, 'Ready');
          return doc;
        }

        case 'url': {
          const urlStr = typeof input === 'string' ? input : '';
          if (!urlStr) {
            throw new Error('Invalid URL provided.');
          }
          return await extractUrl(urlStr, onProgress);
        }

        case 'text':
        default: {
          onProgress?.(30, 'Normalizing text...');
          let rawText = '';
          if (typeof input === 'string') {
            rawText = input;
          } else {
            rawText = await (input as Blob).text();
          }

          if (!rawText || !rawText.trim()) {
            throw new Error('Please enter or paste some text to read.');
          }

          // Check if it's a single URL before parsing as markdown
          if (isUrlString(rawText.trim())) {
            return await extractUrl(rawText.trim(), onProgress);
          }

          // Check if it's actually Markdown disguised as plain text
          if (isMarkdownString(rawText)) {
            return await extractMarkdown(rawText, options?.fileName);
          }

          const normalized = normalizeText(rawText);
          const title = options?.title || extractSuggestedTitle(normalized, 'Pasted Reading');
          const wordCount = countWords(normalized);
          const direction = detectTextDirection(normalized);

          onProgress?.(100, 'Ready');

          return {
            id: `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            sourceType: 'text',
            title,
            content: normalized,
            direction,
            metadata: {
              wordCount,
            },
          };
        }
      }
    },
    (doc) => ({
      charCount: doc.content.length,
      wordCount: doc.metadata?.wordCount || countWords(doc.content),
      extra: { sourceType: doc.sourceType, title: doc.title },
    })
  );
}
