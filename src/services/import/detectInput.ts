import { InputSourceType } from '../../types';

const URL_REGEX = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i;
const LOOSE_URL_REGEX = /^https?:\/\/[^\s]+$/i;

/**
 * Checks if a string is a valid web URL.
 */
export function isUrlString(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  if (trimmed.includes('\n') || trimmed.includes('\r')) return false;
  
  if (LOOSE_URL_REGEX.test(trimmed)) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  if (URL_REGEX.test(trimmed)) {
    try {
      const withProtocol = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
      new URL(withProtocol);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Checks if a string contains prominent Markdown syntax patterns.
 */
export function isMarkdownString(input: string): boolean {
  if (!input) return false;

  const patterns = [
    /^#{1,6}\s+[^\n]+/m, // # Heading
    /\[.+?\]\(https?:\/\/[^\s)]+\)/, // [link](url)
    /```[\s\S]*?```/, // Code block
    /`[^`\n]+`/, // Inline code
    /^\s*[-*+]\s+[^\n]+/m, // Unordered list
    /^\s*\d+\.\s+[^\n]+/m, // Ordered list
    /^\s*>\s+[^\n]+/m, // Blockquote
    /\*\*[^*\n]+\*\*/, // **bold**
    /__[^_\n]+__/, // __bold__
    /\|[^\n]+\|[^\n]+\|/, // Table
  ];

  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(input)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  // Single strong signal like heading or codeblock
  if (/^#{1,6}\s+[^\n]+/m.test(input) || /```[\s\S]*?```/.test(input)) {
    return true;
  }

  return false;
}

/**
 * Extracts file extension from a filename.
 */
export function getFileExtension(filename: string): string {
  if (!filename) return '';
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Detects the input source type automatically from a File, Blob, or raw string.
 */
export function detectInputType(input: File | Blob | string): InputSourceType {
  if (typeof input === 'string') {
    if (isUrlString(input)) {
      return 'url';
    }
    if (isMarkdownString(input)) {
      return 'markdown';
    }
    return 'text';
  }

  // Handle File or Blob with name or type
  const file = input as File;
  const fileName = file.name || '';
  const mimeType = file.type || '';
  const ext = getFileExtension(fileName);

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (ext === 'md' || ext === 'markdown' || mimeType === 'text/markdown') {
    return 'markdown';
  }

  if (ext === 'txt' || mimeType === 'text/plain') {
    return 'txt';
  }

  // Default fallback based on mime
  if (mimeType.includes('text/')) {
    return 'txt';
  }

  return 'text';
}
