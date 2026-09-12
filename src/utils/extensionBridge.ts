/**
 * Extension Bridge Utility
 * Handles communication with Chrome Extension APIs (Manifest V3),
 * active tab text capture, storage syncing, and graceful fallback in web preview.
 */

export interface CapturedPayload {
  text: string;
  title: string;
  url?: string;
  timestamp?: number;
}

/**
 * Detect if running inside a real Chrome Extension environment
 */
export function isChromeExtensionEnvironment(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime && chrome.runtime.id) &&
    typeof window !== 'undefined' &&
    window.location.protocol.includes('chrome-extension')
  );
}

/**
 * Capture highlighted or article text from the active browser tab
 */
export async function captureActiveTabText(): Promise<CapturedPayload | null> {
  if (!isChromeExtensionEnvironment() || !chrome.tabs) {
    return null;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('No active browser tab found.');
    }

    // Try messaging the content script first
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id!,
        { action: 'GET_SELECTED_TEXT' },
        async (response) => {
          if (chrome.runtime.lastError || !response) {
            // Content script may not be injected yet (e.g. tab was open before extension install)
            // Use chrome.scripting.executeScript fallback
            try {
              if (chrome.scripting) {
                const results = await chrome.scripting.executeScript({
                  target: { tabId: tab.id! },
                  func: () => {
                    const selection = window.getSelection()?.toString().trim();
                    if (selection) return { text: selection, title: document.title, isSelection: true };

                    const article = document.querySelector('article') || document.body;
                    const text = (article?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
                    return { text, title: document.title, isSelection: false };
                  }
                });

                if (results && results[0]?.result?.text) {
                  resolve({
                    text: results[0].result.text,
                    title: results[0].result.title || tab.title || 'Captured Webpage',
                    url: tab.url,
                    timestamp: Date.now()
                  });
                  return;
                }
              }
            } catch {
              // Ignore scripting error
            }
            resolve(null);
            return;
          }

          const capturedText = response.selectedText || response.articleText;
          if (capturedText) {
            resolve({
              text: capturedText,
              title: response.title || tab.title || 'Web Selection',
              url: response.url || tab.url,
              timestamp: Date.now()
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  } catch (err) {
    console.warn('Failed to capture active tab text:', err);
    return null;
  }
}

/**
 * Check URL params and chrome.storage.local for captured text from context menu or content script
 */
export async function getStoredCapturedText(): Promise<CapturedPayload | null> {
  // 1. Check URL query parameters first (instant, synchronous, highly reliable)
  if (typeof window !== 'undefined' && window.location.search) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const captureText = urlParams.get('captureText');
      const captureTitle = urlParams.get('captureTitle');
      const captureUrl = urlParams.get('captureUrl');

      if (captureText && captureText.trim()) {
        // Clean URL to prevent re-capturing on refresh
        try {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch {
          // ignore
        }

        return {
          text: decodeURIComponent(captureText),
          title: captureTitle ? decodeURIComponent(captureTitle) : 'Captured Web Selection',
          url: captureUrl ? decodeURIComponent(captureUrl) : '',
          timestamp: Date.now()
        };
      }
    } catch (e) {
      console.warn('Error reading URL params:', e);
    }
  }

  // 2. Check chrome.storage.local
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['capturedText', 'capturedTitle', 'capturedUrl', 'capturedTime'], (items) => {
      const data = items as Record<string, any>;
      if (data && data.capturedText) {
        resolve({
          text: String(data.capturedText),
          title: String(data.capturedTitle || 'Captured Webpage Text'),
          url: String(data.capturedUrl || ''),
          timestamp: typeof data.capturedTime === 'number' ? data.capturedTime : Date.now()
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Clear captured text from storage after applying
 */
export async function clearStoredCapturedText(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.remove(['capturedText', 'capturedTitle', 'capturedUrl', 'capturedTime']);
  }
}
