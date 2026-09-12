/**
 * ADHD Reader - Background Service Worker (Manifest V3)
 */

// Register context menus on extension install / update
chrome.runtime.onInstalled.addListener(() => {
  // Selection context menu
  chrome.contextMenus.create({
    id: 'adhd-read-selection',
    title: '⚡ Read selected text with ADHD Reader',
    contexts: ['selection']
  });

  // Entire page context menu
  chrome.contextMenus.create({
    id: 'adhd-read-page',
    title: '📖 Read webpage with ADHD Reader',
    contexts: ['page']
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'adhd-read-selection' && info.selectionText) {
    await saveCapturedTextAndOpen(
      info.selectionText,
      tab?.title || 'Selected Text',
      tab?.url || ''
    );
  } else if (info.menuItemId === 'adhd-read-page' && tab?.id) {
    // Request content script to extract text
    try {
      chrome.tabs.sendMessage(tab.id, { action: 'GET_SELECTED_TEXT' }, async (response) => {
        if (chrome.runtime.lastError) {
          console.debug('Could not query page:', chrome.runtime.lastError.message);
          return;
        }
        const textToRead = response?.selectedText || response?.articleText;
        if (textToRead) {
          await saveCapturedTextAndOpen(textToRead, response.title, response.url);
        }
      });
    } catch (err) {
      console.error('Failed to send message to tab:', err);
    }
  }
});

// Handle keyboard command (e.g. Alt+R)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'read-selection') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: 'GET_SELECTED_TEXT' }, async (response) => {
        if (chrome.runtime.lastError) return;
        const text = response?.selectedText || response?.articleText;
        if (text) {
          await saveCapturedTextAndOpen(text, response.title, response.url);
        }
      });
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE_AND_READ' && message.text) {
    saveCapturedTextAndOpen(message.text, message.title, message.url).then(() => {
      sendResponse({ success: true });
    });
    return true; // async response
  }
});

/**
 * Stores captured text in chrome.storage.local and opens/focuses the reader
 */
async function saveCapturedTextAndOpen(text, title, url) {
  const timestamp = Date.now();
  const cleanTitle = (title || 'Captured Webpage Text').slice(0, 150);

  // 1. Store in chrome.storage.local for full text persistence
  try {
    await chrome.storage.local.set({
      capturedText: text,
      capturedTitle: cleanTitle,
      capturedUrl: url || '',
      capturedTime: timestamp
    });
  } catch (err) {
    console.warn('ADHD Reader storage error:', err);
  }

  // 2. Build URL with query params for instant synchronous loading (up to 2000 chars)
  const safeTextParam = text && text.length <= 2000 
    ? `&captureText=${encodeURIComponent(text)}` 
    : '';
  const safeTitleParam = cleanTitle 
    ? `&captureTitle=${encodeURIComponent(cleanTitle)}` 
    : '';
  const safeUrlParam = url 
    ? `&captureUrl=${encodeURIComponent(url)}` 
    : '';

  const targetUrl = chrome.runtime.getURL(
    `index.html?source=web-capture${safeTitleParam}${safeUrlParam}${safeTextParam}`
  );

  // 3. Check if an ADHD Reader tab is already open
  try {
    const readerBaseUrl = chrome.runtime.getURL('index.html');
    const tabs = await chrome.tabs.query({});
    const readerTab = tabs.find(t => t.url && t.url.startsWith(readerBaseUrl));

    if (readerTab && readerTab.id) {
      // Focus existing reader tab and notify it
      await chrome.tabs.update(readerTab.id, { active: true });
      if (readerTab.windowId) {
        await chrome.windows.update(readerTab.windowId, { focused: true });
      }
      chrome.tabs.sendMessage(readerTab.id, {
        action: 'NEW_CAPTURED_TEXT',
        text,
        title: cleanTitle,
        url: url || '',
        timestamp
      }).catch(() => {});
      return;
    }
  } catch (err) {
    console.debug('Could not query tabs, opening new tab:', err);
  }

  // 4. Open a new dedicated ADHD Reader tab
  try {
    await chrome.tabs.create({
      url: targetUrl
    });
  } catch (err) {
    console.error('Failed to create ADHD Reader tab:', err);
  }
}
