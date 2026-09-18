import { ReaderDocument } from '../../types';
import { normalizeText, extractSuggestedTitle, detectTextDirection, countWords } from '../../utils/normalizeText';

/**
 * Converts raw Markdown content into clean, distraction-free readable prose.
 * Strips formatting symbols (#, **, `, [text](url), etc.) while preserving
 * semantic headings, paragraphs, lists, quotes, and structure.
 */
export function markdownToReadableText(markdown: string): string {
  if (!markdown) return '';

  let text = markdown;

  // 1. Normalize line endings first
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Handle fenced code blocks: preserve inner code, remove fence syntax
  text = text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_match, code) => {
    return '\n' + code.trim() + '\n';
  });
  text = text.replace(/```[\s\S]*?```/g, ''); // Unclosed or empty codeblocks

  // 3. Strip HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 4. Convert structural HTML tags to newlines before stripping tags
  text = text.replace(/<(br|p|div|h[1-6]|li|blockquote|tr)[^>]*>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 5. Images: ![alt](url) -> keep alt if present, remove image syntax
  text = text.replace(/!\[(.*?)\]\(.*?\)/g, (_match, alt) => {
    return alt ? `[Image: ${alt}]` : '';
  });

  // 6. Links: [text](url) -> text
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
  // Reference links: [text][ref] -> text
  text = text.replace(/\[(.*?)\]\[.*?\]/g, '$1');
  // Autolinks: <http://...> -> http://...
  text = text.replace(/<(https?:\/\/[^\s>]+)>/g, '$1');

  // 7. Headings: `# Heading` -> `Heading`
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_match, title) => {
    return `\n${title.trim()}\n`;
  });

  // 8. Blockquotes: `> quote` -> `quote`
  text = text.replace(/^\s*>\s*(.+)$/gm, '$1');

  // 9. Unordered Lists: `- item` or `* item` -> `• item`
  text = text.replace(/^\s*[-*+]\s+(.+)$/gm, '• $1');

  // 10. Horizontal Rules: `---`, `***`, `___` -> newline
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '\n');

  // 11. Tables: Remove separator lines |---|---| and format rows
  text = text.replace(/^\s*\|?\s*[-:]+[-| :]*\|?\s*$/gm, '');
  text = text.replace(/^\s*\|\s*(.*?)\s*\|\s*$/gm, (_match, row) => {
    return row.split('|').map((col: string) => col.trim()).filter(Boolean).join(' • ');
  });

  // 12. Inline code: `code` -> code
  text = text.replace(/`([^`\n]+)`/g, '$1');

  // 13. Bold / Italic / Strikethrough
  // ***bold italic*** or ___bold italic___
  text = text.replace(/(\*{3}|_{3})(.*?)\1/g, '$2');
  // **bold** or __bold__
  text = text.replace(/(\*{2}|_{2})(.*?)\1/g, '$2');
  // *italic* or _italic_ (ensuring not in the middle of words like snake_case)
  text = text.replace(/(^|\s)\*([^*\n]+)\*(\s|$)/g, '$1$2$3');
  text = text.replace(/(^|\s)_([^_\n]+)_(\s|$)/g, '$1$2$3');
  // ~~strikethrough~~
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 14. Run through general text normalizer
  return normalizeText(text);
}

/**
 * Reads and converts a Markdown file or raw markdown string into a ReaderDocument.
 */
export async function extractMarkdown(
  input: File | Blob | string,
  fileName?: string
): Promise<ReaderDocument> {
  let rawText = '';

  if (typeof input === 'string') {
    rawText = input;
  } else {
    rawText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = () => reject(new Error('Failed to read Markdown file.'));
      reader.readAsText(input, 'utf-8');
    });
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('The Markdown file is empty.');
  }

  // Check if there is an explicit top H1 heading before stripping
  const h1Match = rawText.match(/^#\s+([^\n]+)/m);
  const explicitTitle = h1Match ? h1Match[1].trim() : undefined;

  const prose = markdownToReadableText(rawText);
  if (!prose) {
    throw new Error('No readable text found in the Markdown document.');
  }

  const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, '') : undefined;
  const title = explicitTitle || cleanName || extractSuggestedTitle(prose, 'Markdown Document');
  const wordCount = countWords(prose);
  const direction = detectTextDirection(prose);

  return {
    id: `md_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sourceType: 'markdown',
    title,
    fileName: fileName || (input instanceof File ? input.name : undefined),
    content: prose,
    direction,
    metadata: {
      wordCount,
    },
  };
}
