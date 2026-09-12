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
  await chrome.storage.local.set({
    capturedText: text,
    capturedTitle: title || 'Captured Webpage Text',
    capturedUrl: url || '',
    capturedTime: timestamp
  });

  // Check if an ADHD Reader tab is already open
  const existingTabs = await chrome.tabs.query({
    url: chrome.runtime.getURL('index.html*')
  });

  if (existingTabs.length > 0) {
    // Focus existing reader tab and notify it
    const readerTab = existingTabs[0];
    await chrome.tabs.update(readerTab.id, { active: true });
    if (readerTab.windowId) {
      await chrome.windows.update(readerTab.windowId, { focused: true });
    }
    chrome.tabs.sendMessage(readerTab.id, {
      action: 'NEW_CAPTURED_TEXT',
      text,
      title,
      url,
      timestamp
    }).catch(() => {});
  } else {
    // Open a new dedicated ADHD Reader tab
    await chrome.tabs.create({
      url: chrome.runtime.getURL('index.html?source=web-capture')
    });
  }
}
