import { ReaderDocument, UrlPreviewData } from '../../types';
import { normalizeText, detectTextDirection, countWords, extractSuggestedTitle } from '../../utils/normalizeText';
import { markdownToReadableText } from './extractMarkdown';

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
 * Checks if a URL points to a Wikipedia article and parses language & title.
 */
export function isWikipediaUrl(url: string): { lang: string; title: string } | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    const match = host.match(/^([a-z0-9_-]+)\.wikipedia\.org$/);
    if (match) {
      const pathParts = parsed.pathname.split('/');
      const wikiIdx = pathParts.indexOf('wiki');
      if (wikiIdx !== -1 && pathParts[wikiIdx + 1]) {
        return {
          lang: match[1],
          title: decodeURIComponent(pathParts[wikiIdx + 1]),
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Fetches and extracts readable text from a URL.
 */
export async function extractUrl(
  urlInput: string,
  onProgress?: UrlProgressCallback,
  signal?: AbortSignal
): Promise<ReaderDocument> {
  const url = formatValidUrl(urlInput);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onProgress?.(15, 'Connecting to website...');

  let html = '';
  let markdownText = '';
  let fetchSuccessful = false;

  // Helper to fetch with timeout and external signal propagation
  const fetchWithTimeout = async (targetUrl: string, timeoutMs: number, headers?: Record<string, string>) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      throw err;
    }
  };

  // Step 1: Special optimization for Wikipedia (native CORS, ad-free clean HTML)
  const wikiInfo = isWikipediaUrl(url);
  if (wikiInfo) {
    try {
      onProgress?.(30, 'Extracting Wikipedia article...');
      const wikiApiUrl = `https://${wikiInfo.lang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(wikiInfo.title)}`;
      const res = await fetchWithTimeout(wikiApiUrl, 7000, {
        'Api-User-Agent': 'ADHDReader/1.0',
      });
      if (res.ok) {
        html = await res.text();
        fetchSuccessful = true;
      }
    } catch {
      // Fall through to standard extraction
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Step 2: Internal server extraction endpoint (bypasses browser CORS completely)
  if (!fetchSuccessful) {
    try {
      onProgress?.(35, 'Fetching article text...');
      const serverApiUrl = `/api/extract-url?url=${encodeURIComponent(url)}`;
      const res = await fetchWithTimeout(serverApiUrl, 9000);
      if (res.ok) {
        const data = await res.json();
        if (data.html) {
          html = data.html;
          fetchSuccessful = true;
        } else if (data.markdown) {
          markdownText = data.markdown;
          fetchSuccessful = true;
        }
      }
    } catch {
      // Server endpoint unavailable (e.g. static extension or offline), continue to fallbacks
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Step 3: Direct browser fetch (works if the target site allows CORS)
  if (!fetchSuccessful) {
    try {
      onProgress?.(50, 'Contacting host directly...');
      const res = await fetchWithTimeout(url, 4000, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });
      if (res.ok) {
        html = await res.text();
        fetchSuccessful = true;
      }
    } catch {
      // Direct fetch blocked by browser CORS policy
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Step 4: CORS Proxy 1 (AllOrigins JSON proxy)
  if (!fetchSuccessful) {
    try {
      onProgress?.(65, 'Reading via web proxy...');
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await fetchWithTimeout(proxyUrl, 5000);
      if (res.ok) {
        const json = await res.json();
        if (json.contents) {
          html = json.contents;
          fetchSuccessful = true;
        }
      }
    } catch {
      // Proxy 1 failed or timed out
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Step 5: CORS Proxy 2 (corsproxy.io)
  if (!fetchSuccessful) {
    try {
      onProgress?.(80, 'Trying alternate proxy...');
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const res = await fetchWithTimeout(proxyUrl, 5000);
      if (res.ok) {
        html = await res.text();
        fetchSuccessful = true;
      }
    } catch {
      // Proxy 2 failed
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (!fetchSuccessful || (!html && !markdownText)) {
    throw new Error("Couldn't extract this page. The website may block remote access, require login, or be behind a paywall.");
  }

  // If we received markdown (from reader API):
  if (markdownText) {
    onProgress?.(85, 'Cleaning article text...');
    const content = markdownToReadableText(markdownText);
    const title = extractSuggestedTitle(content) || (wikiInfo ? wikiInfo.title.replace(/_/g, ' ') : 'Imported Article');
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
        wordCount,
      },
    };
  }

  onProgress?.(85, 'Cleaning article text...');
  const { title, content, author } = parseHtmlArticle(html, url);

  onProgress?.(95, 'Preparing reader document...');
  const wordCount = countWords(content);
  const direction = detectTextDirection(content);

  return {
    id: `url_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sourceType: 'url',
    title: title || (wikiInfo ? wikiInfo.title.replace(/_/g, ' ') : 'Imported Article'),
    sourceUrl: url,
    content,
    direction,
    metadata: {
      author,
      wordCount,
    },
  };
}

/**
 * Quick preview fetcher: Extracts title, word count, estimated reading duration,
 * domain, and short excerpt before the user commits to the full import.
 * Keeps the full ReaderDocument preloaded so subsequent import is instant.
 */
export async function fetchUrlPreview(
  urlInput: string,
  wpm: number = 300,
  signal?: AbortSignal
): Promise<UrlPreviewData> {
  const doc = await extractUrl(urlInput, undefined, signal);
  const wordCount = doc.metadata?.wordCount || countWords(doc.content);
  const readingSpeed = Math.max(50, wpm || 300);
  const estimatedMinutes = Math.max(1, Math.round((wordCount / readingSpeed) * 10) / 10);

  let domain = '';
  try {
    const parsed = new URL(doc.sourceUrl || urlInput);
    domain = parsed.hostname.replace(/^www\./, '');
  } catch {
    domain = urlInput.replace(/^https?:\/\//, '').split('/')[0];
  }

  // Extract a clean 1-2 sentence excerpt from the first substantial paragraph
  const paragraphs = doc.content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 25 && !p.startsWith('•'));

  const leadText = paragraphs[0] || doc.content;
  const excerpt = leadText.length > 150 ? `${leadText.slice(0, 147).trim()}...` : leadText;

  return {
    url: doc.sourceUrl || urlInput,
    title: doc.title || 'Untitled Article',
    wordCount,
    estimatedMinutes,
    domain,
    author: doc.metadata?.author,
    excerpt,
    document: doc,
  };
}
