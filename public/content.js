/**
 * ADHD Reader - Content Script (Manifest V3)
 * Captures highlighted / selected text from any webpage and provides
 * instant one-click focus reading.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__adhdReaderInjected) return;
  window.__adhdReaderInjected = true;

  let floatingButton = null;
  let lastSelectionText = '';

  /**
   * Create and position floating "⚡ Read with ADHD Reader" button near selection
   */
  function createFloatingButton() {
    if (floatingButton) return floatingButton;

    const btn = document.createElement('div');
    btn.id = 'adhd-reader-selection-bubble';
    btn.className = 'adhd-reader-bubble-hidden';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', 'Read highlighted text with ADHD Reader');

    btn.innerHTML = `
      <div class="adhd-reader-bubble-inner">
        <span class="adhd-reader-bubble-icon">⚡</span>
        <span class="adhd-reader-bubble-label">Read in ADHD Reader</span>
      </div>
    `;

    btn.addEventListener('mousedown', (e) => {
      // Prevent selection collapse on click
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleReadSelectedText();
    });

    document.body.appendChild(btn);
    floatingButton = btn;
    return btn;
  }

  /**
   * Trigger reader with currently selected text
   */
  function handleReadSelectedText() {
    const text = lastSelectionText || window.getSelection()?.toString().trim();
    if (!text) {
      hideFloatingButton();
      return;
    }

    const payload = {
      action: 'CAPTURE_AND_READ',
      text: text,
      title: document.title || 'Web Selection',
      url: window.location.href,
      timestamp: Date.now()
    };

    // Send to background service worker
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            console.debug('ADHD Reader background message fallback:', chrome.runtime.lastError.message);
            // Fallback: direct window.open if background worker is temporarily unresponsive
            try {
              const directUrl = chrome.runtime.getURL(
                `index.html?source=web-capture&captureTitle=${encodeURIComponent(payload.title)}&captureText=${encodeURIComponent(text.slice(0, 2000))}`
              );
              window.open(directUrl, '_blank');
            } catch (err) {
              console.warn('Fallback tab open failed:', err);
            }
          }
        });
      }
    } catch (err) {
      console.error('ADHD Reader error sending message:', err);
    }

    // Save directly to chrome.storage.local if available
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          capturedText: text,
          capturedTitle: document.title || 'Web Selection',
          capturedUrl: window.location.href,
          capturedTime: Date.now()
        });
      }
    } catch {
      // Ignore storage restrictions
    }

    // Show quick visual feedback on button
    if (floatingButton) {
      floatingButton.classList.add('adhd-reader-bubble-success');
      const label = floatingButton.querySelector('.adhd-reader-bubble-label');
      if (label) label.textContent = 'Opening Reader...';
      setTimeout(() => {
        hideFloatingButton();
        if (label) label.textContent = 'Read in ADHD Reader';
        floatingButton?.classList.remove('adhd-reader-bubble-success');
      }, 1000);
    }
  }

  /**
   * Position floating button just above or below the user's text selection
   */
  function updateFloatingButtonPosition() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      hideFloatingButton();
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      hideFloatingButton();
      return;
    }

    lastSelectionText = text;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideFloatingButton();
      return;
    }

    const btn = createFloatingButton();

    // Calculate position relative to viewport / scroll
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    // Center horizontally on selection
    let left = rect.left + scrollX + rect.width / 2;
    // Position 10px above selection rect, or below if too close to top of viewport
    let top = rect.top + scrollY - 38;
    if (rect.top < 50) {
      top = rect.bottom + scrollY + 10;
    }

    btn.style.left = `${Math.max(10, left)}px`;
    btn.style.top = `${Math.max(10, top)}px`;
    btn.classList.remove('adhd-reader-bubble-hidden');
    btn.classList.add('adhd-reader-bubble-visible');
  }

  function hideFloatingButton() {
    if (floatingButton) {
      floatingButton.classList.remove('adhd-reader-bubble-visible');
      floatingButton.classList.add('adhd-reader-bubble-hidden');
    }
  }

  // Event listeners for text selection
  document.addEventListener('mouseup', () => {
    // Small timeout to allow browser to finalize selection range
    setTimeout(updateFloatingButtonPosition, 10);
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' || e.key.startsWith('Arrow')) {
      setTimeout(updateFloatingButtonPosition, 10);
    }
  });

  document.addEventListener('mousedown', (e) => {
    // If clicking outside floating button, hide it
    if (floatingButton && !floatingButton.contains(e.target)) {
      hideFloatingButton();
    }
  });

  // Listen for messages from extension popup or background
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'GET_SELECTED_TEXT') {
        const selection = window.getSelection()?.toString().trim() || '';
        let articleText = '';

        // If user didn't select text, fall back to main article content
        if (!selection) {
          const articleElem = document.querySelector('article') || document.querySelector('main') || document.body;
          if (articleElem) {
            // Get clean text while avoiding scripts and styles
            const clone = articleElem.cloneNode(true);
            const scripts = clone.querySelectorAll('script, style, nav, footer, header, noscript');
            scripts.forEach((s) => s.remove());
            articleText = (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
          }
        }

        sendResponse({
          selectedText: selection,
          articleText: articleText,
          title: document.title || 'Current Webpage',
          url: window.location.href
        });
        return true;
      }
    });
  }
})();
