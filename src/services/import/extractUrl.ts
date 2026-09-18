import { ReaderDocument } from '../../types';
import { normalizeText, detectTextDirection, countWords } from '../../utils/normalizeText';

export type UrlProgressCallback = (progressPercent: number, statusMessage: string) => void;

/**
 * Normalizes input string into a standard valid URL with protocol.
 */
export function formatValidUrl(input: string): string {
  let url = input.trim();
  if (url.startsWith('www.')) {
    url = `https://${url}`;
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Extracts clean readable prose, title, and metadata from HTML markup.
 */
export function parseHtmlArticle(html: string, originalUrl?: string): { title: string; content: string; author?: string } {
  if (typeof DOMParser === 'undefined') {
    // Node.js test environment fallback
    const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i);
    const titleMatch = ogMatch || html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const authorMatch = html.match(/name="author"\s+content="([^"]+)"/i);
    let clean = html.replace(/<(script|style|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, '');
    clean = clean.replace(/<[^>]+>/g, ' ');
    return {
      title: titleMatch ? titleMatch[1].replace(/\s+[-|–—]\s+[^-|–—]+$/, '').trim() : (originalUrl || 'Imported Article'),
      content: normalizeText(clean),
      author: authorMatch ? authorMatch[1] : undefined,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. Extract Title
  let title = '';
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
  const docTitle = doc.title;
  const h1 = doc.querySelector('h1')?.textContent?.trim();

  title = ogTitle || twitterTitle || h1 || docTitle || 'Imported Article';
  // Clean trailing website branding like " - The New York Times" or " | Medium"
  title = title.replace(/\s+[-|–—]\s+[^-|–—]+$/, '').trim();

  // 2. Extract Author
  const author = doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
    doc.querySelector('[rel="author"]')?.textContent?.trim() ||
    undefined;

  // 3. Remove unwanted clutter
  const selectorsToRemove = [
    'script', 'style', 'noscript', 'svg', 'iframe', 'canvas',
    'nav', 'footer', 'header', 'aside', 'form', 'button', 'input',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.ad', '.ads', '.advertisement', '.social-share', '.share-buttons',
    '.cookie-banner', '#cookie-banner', '.newsletter-signup',
    '#comments', '.comments', '.sidebar', '.disclaimer', '.cookie-consent'
  ];

  selectorsToRemove.forEach((sel) => {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // 4. Find the best content container
  let articleEl: Element | null = null;

  // Prioritize semantic tags
  const candidates = [
    'article',
    '[itemprop="articleBody"]',
    'main',
    '[role="main"]',
    '.article-body',
    '.post-content',
    '.entry-content',
    '.story-content',
    '.content-article',
    '#article-body',
    '#main-content',
  ];

  for (const cand of candidates) {
    const el = doc.querySelector(cand);
    if (el && (el.textContent || '').trim().length > 150) {
      articleEl = el;
      break;
    }
  }

  // Fallback: search for container with most paragraph text
  if (!articleEl) {
    let bestScore = 0;
    const bodyElements = doc.body ? Array.from(doc.body.querySelectorAll('div, section')) : [];
    for (const el of bodyElements) {
      const paragraphs = el.querySelectorAll('p');
      const textLen = Array.from(paragraphs).reduce((acc, p) => acc + (p.textContent?.length || 0), 0);
      if (textLen > bestScore) {
        bestScore = textLen;
        articleEl = el;
      }
    }
  }

  const rootElement = articleEl || doc.body;
  if (!rootElement) {
    throw new Error('Unable to parse the content of this webpage.');
  }

  // 5. Extract readable elements in order
  const elements = rootElement.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, li');
  const textBlocks: string[] = [];

  elements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const text = el.textContent?.trim();
    if (!text || text.length < 2) return;

    if (tagName.startsWith('h')) {
      textBlocks.push(`\n${text}\n`);
    } else if (tagName === 'blockquote') {
      textBlocks.push(`"${text}"`);
    } else if (tagName === 'li') {
      textBlocks.push(`• ${text}`);
    } else if (tagName === 'p') {
      textBlocks.push(text);
    }
  });

  let extractedText = textBlocks.join('\n\n');

  // If structured extraction was too sparse, fallback to clean root textContent
  if (extractedText.trim().length < 50) {
    extractedText = rootElement.textContent || '';
  }

  const normalized = normalizeText(extractedText);

  if (!normalized || normalized.length < 30) {
    throw new Error("Couldn't extract readable article text from this page.");
  }

  return {
    title: title || originalUrl || 'Web Article',
    content: normalized,
    author,
  };
}

/**
 * Fetches and extracts readable text from a URL.
 */
export async function extractUrl(
  urlInput: string,
  onProgress?: UrlProgressCallback
): Promise<ReaderDocument> {
  const url = formatValidUrl(urlInput);

  onProgress?.(15, 'Connecting to website...');

  let html = '';
  let fetchSuccessful = false;

  // Attempt 1: Direct fetch with 8s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      html = await res.text();
      fetchSuccessful = true;
    }
  } catch {
    // Direct fetch failed (likely CORS in browser preview), proceed to proxy
  }

  // Attempt 2: CORS Proxy 1 (AllOrigins)
  if (!fetchSuccessful) {
    try {
      onProgress?.(40, 'Extracting via web reader proxy...');
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        html = await res.text();
        fetchSuccessful = true;
      }
    } catch {
      // Proxy 1 failed
    }
  }

  // Attempt 3: CORS Proxy 2 (corsproxy.io)
  if (!fetchSuccessful) {
    try {
      onProgress?.(60, 'Trying alternate connection...');
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        html = await res.text();
        fetchSuccessful = true;
      }
    } catch {
      // Proxy 2 failed
    }
  }

  if (!fetchSuccessful || !html) {
    throw new Error("Couldn't extract this page. The website may block remote access or require login.");
  }

  onProgress?.(80, 'Cleaning article text...');
  const { title, content, author } = parseHtmlArticle(html, url);

  onProgress?.(95, 'Preparing reader document...');
  const wordCount = countWords(content);
  const direction = detectTextDirection(content);

  return {
    id: `url_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sourceType: 'url',
    title,
    sourceUrl: url,
    content,
    direction,
    metadata: {
      author,
      wordCount,
    },
  };
}
