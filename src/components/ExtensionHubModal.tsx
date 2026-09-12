import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Download, 
  Puzzle, 
  Check, 
  Copy, 
  ExternalLink, 
  Zap, 
  FileCode, 
  Sparkles, 
  MousePointer, 
  Layers, 
  Command, 
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ReaderSettings } from '../types';
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from '../utils/themeStyles';
import { downloadExtensionPackage } from '../utils/extensionPacker';
import { isChromeExtensionEnvironment, captureActiveTabText } from '../utils/extensionBridge';

interface ExtensionHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCapturedText: (text: string, title?: string) => void;
  settings: ReaderSettings;
}

export const ExtensionHubModal: React.FC<ExtensionHubModalProps> = ({
  isOpen,
  onClose,
  onApplyCapturedText,
  settings,
}) => {
  const [activeTab, setActiveTab] = useState<'simulator' | 'install' | 'files'>('simulator');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<'manifest' | 'contentJs' | 'contentCss' | 'background'>('contentJs');

  // Simulator State
  const [simulatedSelection, setSimulatedSelection] = useState<string>('');
  const [bubblePosition, setBubblePosition] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [isCapturingActiveTab, setIsCapturingActiveTab] = useState(false);
  const simulatorContainerRef = useRef<HTMLDivElement>(null);

  const isExtensionEnv = isChromeExtensionEnvironment();
  const theme = THEME_CONFIGS[settings.theme];
  const highlight = HIGHLIGHT_COLORS[settings.highlightColor];

  // Handle selection within simulator
  const handleSimulatorMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !simulatorContainerRef.current) {
      setBubblePosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 3) {
      setBubblePosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    // Check if selection is inside container
    const range = selection.getRangeAt(0);
    if (!simulatorContainerRef.current.contains(range.commonAncestorContainer)) {
      setBubblePosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = simulatorContainerRef.current.getBoundingClientRect();

    setSimulatedSelection(text);
    setBubblePosition({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 12,
      visible: true
    });
  };

  const handleTriggerSimulatedCapture = (textToRead?: string) => {
    const text = textToRead || simulatedSelection;
    if (!text) return;

    setCaptureFeedback('⚡ Captured highlighted text!');
    setTimeout(() => {
      onApplyCapturedText(text, 'Web Article Selection');
      onClose();
    }, 600);
  };

  const handleCaptureRealTab = async () => {
    setIsCapturingActiveTab(true);
    setCaptureFeedback(null);
    try {
      const result = await captureActiveTabText();
      if (result && result.text) {
        setCaptureFeedback('Captured from active tab!');
        setTimeout(() => {
          onApplyCapturedText(result.text, result.title || 'Captured Webpage');
          onClose();
        }, 500);
      } else {
        setCaptureFeedback('No text was selected on the active page.');
      }
    } catch {
      setCaptureFeedback('Unable to capture from tab.');
    } finally {
      setIsCapturingActiveTab(false);
    }
  };

  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      await downloadExtensionPackage();
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(key);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="extension-hub-modal"
        className={`w-full max-w-3xl rounded-2xl border ${theme.borderClass} ${theme.cardBgClass} shadow-2xl flex flex-col max-h-[92vh] overflow-hidden`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-5 sm:px-6 py-4 border-b ${theme.borderClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 text-red-500 border border-red-500/25 shrink-0">
              <Puzzle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base sm:text-lg font-bold ${theme.textPrimary}`}>
                  Chrome Extension (Manifest V3)
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Ready to Load
                </span>
              </div>
              <p className={`text-xs ${theme.textMuted}`}>
                Capture highlighted text from any website and read with RSVP & middle focus
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="download-extension-header-btn"
              type="button"
              onClick={handleDownloadZip}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              {downloadDone ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              <span>{isDownloading ? 'Packaging...' : downloadDone ? 'Downloaded!' : 'Download .zip'}</span>
            </button>

            <button
              id="close-extension-modal-btn"
              type="button"
              onClick={onClose}
              aria-label="Close extension modal"
              className={`p-2 rounded-lg border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary} hover:${theme.accentSurface} transition-colors`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className={`flex items-center px-5 sm:px-6 pt-3 border-b ${theme.borderClass} gap-4`}>
          <button
            id="tab-sim-btn"
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'simulator'
                ? 'border-red-500 text-red-500'
                : `border-transparent ${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <MousePointer className="w-4 h-4" />
            <span>Interactive Content Script Simulator</span>
          </button>

          <button
            id="tab-guide-btn"
            type="button"
            onClick={() => setActiveTab('install')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'install'
                ? 'border-red-500 text-red-500'
                : `border-transparent ${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Installation Guide</span>
          </button>

          <button
            id="tab-code-btn"
            type="button"
            onClick={() => setActiveTab('files')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'files'
                ? 'border-red-500 text-red-500'
                : `border-transparent ${theme.textMuted} hover:${theme.textPrimary}`
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Manifest & Scripts</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: CONTENT SCRIPT SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              {/* Instructions banner */}
              <div className={`p-3.5 rounded-xl border ${theme.borderClass} ${theme.accentSurface} flex items-start gap-3 text-xs`}>
                <Sparkles className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className={`font-semibold ${theme.textPrimary}`}>
                    Try highlighting text below with your mouse!
                  </p>
                  <p className={theme.textMuted}>
                    Notice how the content script attaches the floating <strong className="text-red-500">[ ⚡ Read in ADHD Reader ]</strong> bubble directly over your selection. Clicking it instantly transfers the text into RSVP word-by-word mode.
                  </p>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold ${theme.textMuted}`}>Quick Try:</span>
                <button
                  id="sim-sample-1-btn"
                  type="button"
                  onClick={() => handleTriggerSimulatedCapture("Visual anchor fixation helps people with ADHD maintain unbroken reading flow by reducing involuntary regressions.")}
                  className={`text-xs px-2.5 py-1 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:border-red-500/40 hover:bg-red-500/10 transition-colors`}
                >
                  Anchor Fixation Concept
                </button>
                <button
                  id="sim-sample-2-btn"
                  type="button"
                  onClick={() => handleTriggerSimulatedCapture("Rapid Serial Visual Presentation presents words sequentially at an Optimal Recognition Point, saving your eyes from saccadic fatigue.")}
                  className={`text-xs px-2.5 py-1 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:border-red-500/40 hover:bg-red-500/10 transition-colors`}
                >
                  RSVP Ergonomics
                </button>
                {isExtensionEnv && (
                  <button
                    id="capture-live-tab-btn"
                    type="button"
                    onClick={handleCaptureRealTab}
                    disabled={isCapturingActiveTab}
                    className="text-xs px-3 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-500 font-semibold hover:bg-red-500 hover:text-white transition-colors"
                  >
                    {isCapturingActiveTab ? 'Capturing...' : 'Capture Active Browser Tab'}
                  </button>
                )}
              </div>

              {/* Simulated Webpage Article Box */}
              <div className="relative">
                <div className={`p-2.5 rounded-t-xl border-t border-x ${theme.borderClass} bg-black/40 flex items-center justify-between text-[11px] ${theme.textMuted}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/60 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60 inline-block" />
                    <span className="ml-2 font-mono text-[10px] truncate max-w-xs">https://en.wikipedia.org/wiki/Rapid_serial_visual_presentation</span>
                  </div>
                  <span className="font-semibold text-emerald-400">content.js active</span>
                </div>

                <div
                  ref={simulatorContainerRef}
                  onMouseUp={handleSimulatorMouseUp}
                  className={`p-5 rounded-b-xl border ${theme.borderClass} ${theme.inputBg} relative select-text leading-relaxed text-sm ${theme.textPrimary} font-sans min-h-[220px]`}
                >
                  <h4 className="text-base font-bold mb-2 text-red-500">
                    How RSVP & Middle-Letter Highlights Empower ADHD Reading
                  </h4>
                  <p className="mb-3 text-sm opacity-90">
                    Traditional reading requires constant eye movements called <em>saccades</em>, accompanied by brief pauses termed <em>fixations</em>. For neurodivergent readers, particularly individuals diagnosed with Attention-Deficit/Hyperactivity Disorder, these rapid micro-movements frequently cause involuntary regressions, losing track of lines, and attention drift.
                  </p>
                  <p className="text-sm opacity-90">
                    By combining <strong>Rapid Serial Visual Presentation (RSVP)</strong> with <strong>two middle-letter color contrast</strong>, the reader's visual cortex locks directly onto the word's Optimal Recognition Point (ORP). Your brain decodes lexical meaning up to 300% faster without mechanical eye strain.
                  </p>

                  {/* Simulated Floating Content Script Bubble */}
                  {bubblePosition.visible && (
                    <div
                      id="simulated-selection-bubble"
                      style={{
                        position: 'absolute',
                        left: `${bubblePosition.x}px`,
                        top: `${bubblePosition.y}px`,
                        transform: 'translate(-50%, -100%)',
                      }}
                      className="z-30 pointer-events-auto animate-in zoom-in-95 duration-150"
                    >
                      <button
                        type="button"
                        onClick={() => handleTriggerSimulatedCapture()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-red-500 text-white text-xs font-bold shadow-xl hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all"
                      >
                        <Zap className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                        <span>Read in ADHD Reader</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status or Success Feedback */}
              {captureFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{captureFeedback}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INSTALLATION GUIDE */}
          {activeTab === 'install' && (
            <div className="space-y-4 text-xs sm:text-sm">
              <div className={`p-4 rounded-xl border ${theme.borderClass} ${theme.accentSurface} space-y-2`}>
                <h4 className={`text-sm font-bold ${theme.textPrimary} flex items-center gap-2`}>
                  <Puzzle className="w-4 h-4 text-red-500" />
                  Install ADHD Reader in Google Chrome in 30 Seconds
                </h4>
                <p className={`text-xs ${theme.textMuted}`}>
                  Follow these standard developer steps to load the Manifest V3 extension:
                </p>
              </div>

              <div className="space-y-3">
                <div className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} space-y-1.5`}>
                  <div className="flex items-center gap-2 font-bold text-red-500 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">1</span>
                    Download and Extract
                  </div>
                  <p className={theme.textPrimary}>
                    Click the <strong>"Download .zip"</strong> button above to download <code className="px-1.5 py-0.5 rounded bg-black/30 font-mono text-xs">adhd-reader-chrome-extension-v3.zip</code>. Unzip the file on your computer.
                  </p>
                </div>

                <div className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} space-y-1.5`}>
                  <div className="flex items-center gap-2 font-bold text-red-500 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">2</span>
                    Open Extensions in Chrome
                  </div>
                  <p className={theme.textPrimary}>
                    In Google Chrome or any Chromium browser (Brave, Edge), navigate to:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-red-400">
                      chrome://extensions
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('chrome://extensions', 'url')}
                      className={`p-1.5 rounded-lg border ${theme.borderClass} hover:${theme.accentSurface}`}
                      title="Copy URL"
                    >
                      {copiedCode === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} space-y-1.5`}>
                  <div className="flex items-center gap-2 font-bold text-red-500 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">3</span>
                    Enable Developer Mode
                  </div>
                  <p className={theme.textPrimary}>
                    In the top-right corner of the Extensions page, toggle the <strong>Developer mode</strong> switch ON.
                  </p>
                </div>

                <div className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} space-y-1.5`}>
                  <div className="flex items-center gap-2 font-bold text-red-500 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">4</span>
                    Load Unpacked Extension
                  </div>
                  <p className={theme.textPrimary}>
                    Click the <strong>Load unpacked</strong> button in the top-left corner, and select the extracted folder containing <code className="font-mono text-xs">manifest.json</code>.
                  </p>
                </div>

                <div className={`p-4 rounded-xl border ${theme.borderClass} ${theme.inputBg} space-y-1.5`}>
                  <div className="flex items-center gap-2 font-bold text-emerald-400 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">5</span>
                    Start Highlighting & Reading
                  </div>
                  <p className={theme.textPrimary}>
                    Visit any website (news, Wikipedia, documentation, Substack). Highlight any text to see the floating <strong>⚡ Read in ADHD Reader</strong> button, or right-click to read!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MANIFEST & SCRIPTS CODE VIEWER */}
          {activeTab === 'files' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFileType('contentJs')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedFileType === 'contentJs'
                        ? 'bg-red-500 text-white'
                        : `border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary}`
                    }`}
                  >
                    content.js (Capture Script)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFileType('manifest')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedFileType === 'manifest'
                        ? 'bg-red-500 text-white'
                        : `border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary}`
                    }`}
                  >
                    manifest.json (V3)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFileType('background')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedFileType === 'background'
                        ? 'bg-red-500 text-white'
                        : `border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary}`
                    }`}
                  >
                    background.js
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFileType('contentCss')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedFileType === 'contentCss'
                        ? 'bg-red-500 text-white'
                        : `border ${theme.borderClass} ${theme.textMuted} hover:${theme.textPrimary}`
                    }`}
                  >
                    content.css
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const code = getCodeSnippet(selectedFileType);
                    copyToClipboard(code, selectedFileType);
                  }}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${theme.borderClass} ${theme.textPrimary} hover:${theme.accentSurface}`}
                >
                  {copiedCode === selectedFileType ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode === selectedFileType ? 'Copied' : 'Copy File'}</span>
                </button>
              </div>

              <div className="relative rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[380px]">
                <pre>{getCodeSnippet(selectedFileType)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function getCodeSnippet(type: 'manifest' | 'contentJs' | 'contentCss' | 'background'): string {
  switch (type) {
    case 'manifest':
      return `{
  "manifest_version": 3,
  "name": "ADHD Reader - RSVP & Focus Highlighter",
  "version": "1.0.0",
  "description": "Word-by-word RSVP focus reader highlighting middle letters in red. Capture highlighted text from any webpage instantly.",
  "permissions": [
    "activeTab",
    "scripting",
    "contextMenus",
    "storage"
  ],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "index.html",
    "default_title": "ADHD Reader",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "commands": {
    "read-selection": {
      "suggested_key": { "default": "Alt+R", "mac": "Alt+R" },
      "description": "Capture highlighted text and read in ADHD Reader"
    }
  }
}`;
    case 'contentJs':
      return `// content.js - Content Script for capturing highlighted text on any webpage
(function () {
  let floatingButton = null;

  function updateFloatingButton() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2) {
      if (floatingButton) floatingButton.style.display = 'none';
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!floatingButton) {
      floatingButton = document.createElement('div');
      floatingButton.id = 'adhd-reader-selection-bubble';
      floatingButton.innerHTML = '<div class="adhd-reader-bubble-inner">⚡ Read in ADHD Reader</div>';
      floatingButton.onclick = () => {
        chrome.runtime.sendMessage({
          action: 'CAPTURE_AND_READ',
          text: text,
          title: document.title,
          url: window.location.href
        });
      };
      document.body.appendChild(floatingButton);
    }

    floatingButton.style.left = (rect.left + window.scrollX + rect.width / 2) + 'px';
    floatingButton.style.top = (rect.top + window.scrollY - 36) + 'px';
    floatingButton.style.display = 'block';
  }

  document.addEventListener('mouseup', () => setTimeout(updateFloatingButton, 10));
})();`;
    case 'background':
      return `// background.js - Service Worker for context menus and tab dispatch
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'adhd-read-selection',
    title: '⚡ Read selected text with ADHD Reader',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'adhd-read-selection' && info.selectionText) {
    await chrome.storage.local.set({
      capturedText: info.selectionText,
      capturedTitle: tab.title || 'Selected Web Text',
      capturedUrl: tab.url,
      capturedTime: Date.now()
    });
    chrome.tabs.create({ url: 'index.html?source=web-capture' });
  }
});`;
    case 'contentCss':
      return `/* content.css - Injected floating quick-read bubble */
#adhd-reader-selection-bubble {
  position: absolute;
  z-index: 2147483647;
  transform: translateX(-50%);
  cursor: pointer;
}
.adhd-reader-bubble-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #0f172a;
  color: #fff;
  border: 1px solid #ef4444;
  border-radius: 9999px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5), 0 0 10px rgba(239,68,68,0.4);
  font-size: 12px;
  font-weight: 600;
}`;
  }
}
