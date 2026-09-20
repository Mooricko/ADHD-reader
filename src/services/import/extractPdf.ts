import { ReaderDocument } from '../../types';
import { normalizeText, extractSuggestedTitle, detectTextDirection, countWords } from '../../utils/normalizeText';
import { buildPdfStructure, PdfOutlineItem } from '../structure/structureBuilder';

/**
 * Interface for progress callback during multi-page PDF processing
 */
export type PdfProgressCallback = (progressPercent: number, statusMessage: string) => void;

/**
 * Basic pure-JS fallback for extracting text from raw PDF ArrayBuffer if PDF.js worker is unavailable.
 */
function extractTextFromRawPdfBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  const rawString = textDecoder.decode(bytes);

  const extractedChunks: string[] = [];

  // Look for text blocks enclosed in BT ... ET
  const btEtRegex = /BT[\s\S]*?ET/g;
  let match: RegExpExecArray | null;

  while ((match = btEtRegex.exec(rawString)) !== null) {
    const block = match[0];
    
    // Match literal strings: (string) Tj or [(str1)(str2)] TJ
    const tjRegex = /\((.*?)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      extractedChunks.push(tjMatch[1]);
    }

    const arrayTjRegex = /\[(.*?)\]\s*TJ/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = arrayTjRegex.exec(block)) !== null) {
      const inner = arrayMatch[1];
      const strRegex = /\((.*?)\)/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = strRegex.exec(inner)) !== null) {
        extractedChunks.push(strMatch[1]);
      }
    }
  }

  // Unescape standard PDF octal / backslash escapes
  return extractedChunks
    .map((s) => s.replace(/\\([0-7]{3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8))))
    .map((s) => s.replace(/\\[nrtbf]/g, ' '))
    .map((s) => s.replace(/\\(.)/g, '$1'))
    .join(' ');
}

/**
 * Extracts selectable text from a PDF file using PDF.js with pure-JS fallback.
 */
export async function extractPdf(
  input: File | Blob | ArrayBuffer,
  fileName?: string,
  onProgress?: PdfProgressCallback
): Promise<ReaderDocument> {
  let arrayBuffer: ArrayBuffer;

  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else {
    arrayBuffer = await input.arrayBuffer();
  }

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('The PDF file is empty.');
  }

  // Check magic bytes "%PDF-"
  const headerCheck = new Uint8Array(arrayBuffer.slice(0, 8));
  const headerStr = String.fromCharCode(...headerCheck);
  if (!headerStr.includes('%PDF')) {
    throw new Error('This file does not appear to be a valid PDF document.');
  }

  let fullText = '';
  let pageCount = 0;
  const pageTexts: string[] = [];

  onProgress?.(10, 'Initializing PDF engine...');

  try {
    // Dynamic import to allow graceful fallback
    const pdfjsLib = await import('pdfjs-dist');
    
    // Configure worker source to unpkg or bundled worker
    if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      try {
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }
      } catch {
        // Ignore worker assignment error
      }
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });

    onProgress?.(25, 'Loading PDF pages...');
    const pdfDoc = await loadingTask.promise;
    pageCount = pdfDoc.numPages;

    if (pageCount === 0) {
      throw new Error('This PDF has no pages.');
    }

    for (let i = 1; i <= pageCount; i++) {
      const percent = Math.min(90, Math.round(25 + (i / pageCount) * 65));
      onProgress?.(percent, `Extracting text from page ${i} of ${pageCount}...`);

      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY: number | null = null;
      let pageStr = '';

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          const textItem = item as { str: string; transform?: number[] };
          const currentY = textItem.transform ? textItem.transform[5] : null;

          // Detect new lines based on Y coordinate shift
          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 8) {
            pageStr += '\n' + textItem.str;
          } else {
            pageStr += (pageStr.endsWith(' ') || pageStr.length === 0 ? '' : ' ') + textItem.str;
          }
          lastY = currentY;
        }
      }

      if (pageStr.trim()) {
        pageTexts.push(pageStr.trim());
      }
    }

    // Try extracting bookmarks/outlines
    let outlines: PdfOutlineItem[] = [];
    try {
      const rawOutline = await pdfDoc.getOutline();
      if (rawOutline && Array.isArray(rawOutline)) {
        for (const item of rawOutline) {
          if (item.title && item.dest) {
            let destRef = item.dest;
            if (typeof destRef === 'string') {
              destRef = await pdfDoc.getDestination(destRef);
            }
            if (Array.isArray(destRef) && destRef[0]) {
              const pageIdx = await pdfDoc.getPageIndex(destRef[0]);
              outlines.push({
                title: item.title,
                pageNumber: pageIdx + 1,
                level: 1,
              });
            }
          }
        }
      }
    } catch {
      // Gracefully continue if outline extraction is unavailable
    }

    fullText = pageTexts.join('\n\n');
  } catch (pdfJsErr: any) {
    // Check for password protection
    if (pdfJsErr?.name === 'PasswordException' || String(pdfJsErr).includes('password')) {
      throw new Error('This PDF is password-protected and cannot be read without a password.');
    }

    console.warn('PDF.js text extraction encountered an issue, trying raw fallback...', pdfJsErr);

    // Fallback: try raw stream inspection
    const fallbackText = extractTextFromRawPdfBuffer(arrayBuffer);
    if (fallbackText && fallbackText.trim().length > 20) {
      fullText = fallbackText;
      pageCount = 1;
      pageTexts.push(fallbackText);
    } else {
      if (pdfJsErr?.message && !pdfJsErr.message.includes('worker')) {
        throw new Error(pdfJsErr.message);
      }
      throw new Error("Couldn't extract readable text from this PDF. It may contain scanned images rather than selectable text.");
    }
  }

  // Normalize hyphenated words broken across lines (e.g., "repre-\nsent" -> "represent")
  fullText = fullText.replace(/(\w+)-\n(\w+)/g, '$1$2');

  const normalized = normalizeText(fullText);

  if (!normalized || normalized.length < 5) {
    throw new Error("Couldn't extract readable text from this PDF. It may be an image-only scan or empty.");
  }

  onProgress?.(95, 'Finalizing document structure...');

  const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, '') : undefined;
  const title = cleanName || extractSuggestedTitle(normalized, 'PDF Document');
  const wordCount = countWords(normalized);
  const direction = detectTextDirection(normalized);
  const docId = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Build physical page index and structure
  const { structure, pages } = buildPdfStructure(
    docId,
    pageTexts.length > 0 ? pageTexts : [normalized]
  );

  return {
    id: docId,
    sourceType: 'pdf',
    title,
    fileName: fileName || (input instanceof File ? input.name : undefined),
    content: normalized,
    direction,
    pages,
    structure,
    metadata: {
      pageCount: pages.length || pageCount,
      wordCount,
    },
  };
}
