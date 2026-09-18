import { ReaderDocument } from '../../types';
import { normalizeText, extractSuggestedTitle, detectTextDirection, countWords } from '../../utils/normalizeText';

/**
 * Reads and normalizes a TXT file or string into a ReaderDocument.
 */
export async function extractTxt(
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
      reader.onerror = () => reject(new Error('Failed to read the text file.'));
      reader.readAsText(input, 'utf-8');
    });
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('The text file is empty.');
  }

  const normalized = normalizeText(rawText);
  if (!normalized) {
    throw new Error('No readable text found in the file.');
  }

  const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, '') : undefined;
  const title = cleanName || extractSuggestedTitle(normalized, 'Text Document');
  const wordCount = countWords(normalized);
  const direction = detectTextDirection(normalized);

  return {
    id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sourceType: 'txt',
    title,
    fileName: fileName || (input instanceof File ? input.name : undefined),
    content: normalized,
    direction,
    metadata: {
      wordCount,
    },
  };
}
