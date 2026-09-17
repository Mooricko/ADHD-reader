/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ReaderSettings, 
  ReaderViewMode, 
  SavedDocument, 
  HighlightedWordParts 
} from './types';
import { SAMPLE_TEXTS } from './data/sampleTexts';
import { parseTextIntoWords } from './utils/textParser';
import { THEME_CONFIGS, HIGHLIGHT_COLORS, FONT_CONFIGS, getTheme } from './utils/themeStyles';
import { Header } from './components/Header';
import { RSVPReader } from './components/RSVPReader';
import { FlowReader } from './components/FlowReader';
import { TextInputModal } from './components/TextInputModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ExtensionHubModal } from './components/ExtensionHubModal';
import { safeStorage } from './utils/safeStorage';
import { 
  isChromeExtensionEnvironment, 
  getStoredCapturedText, 
  clearStoredCapturedText 
} from './utils/extensionBridge';
import { CheckCircle2, Zap } from 'lucide-react';

const DEFAULT_SETTINGS: ReaderSettings = {
  wpm: 320,
  chunkSize: 1,
  highlightColor: 'red',
  highlightStyle: 'middle-two',
  theme: 'midnight',
  fontFamily: 'lexend',
  fontSize: 54,
  flowFontSize: 22,
  lineHeight: 1.8,
  letterSpacing: 0.02,
  focusParagraphBlur: false,
  smartPunctuationPause: true,
  metronomeSound: false,
  metronomeVolume: 0.3,
  showReticleGuides: true,
  showContextWords: false,
  opticalCenterLock: true,
  morphTransition: true,
  speechNarration: false,
  speechVoiceURI: '',
  speechPitch: 1.0,
  speechVolume: 1.0,
  speechRateMultiplier: 1.0,
};

const STORAGE_KEYS = {
  SETTINGS: 'adhd_reader_settings_v1',
  CURRENT_TEXT: 'adhd_reader_text_v1',
  CURRENT_TITLE: 'adhd_reader_title_v1',
  SAVED_DOCS: 'adhd_reader_saved_docs_v1',
  CURRENT_INDEX: 'adhd_reader_index_v1',
};

export default function App() {
  // 1. Settings state with safeStorage recovery and strict sanitization
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const merged = { ...DEFAULT_SETTINGS, ...parsed };
          if (!THEME_CONFIGS[merged.theme as keyof typeof THEME_CONFIGS]) merged.theme = DEFAULT_SETTINGS.theme;
          if (!HIGHLIGHT_COLORS[merged.highlightColor as keyof typeof HIGHLIGHT_COLORS]) merged.highlightColor = DEFAULT_SETTINGS.highlightColor;
          if (!FONT_CONFIGS[merged.fontFamily as keyof typeof FONT_CONFIGS]) merged.fontFamily = DEFAULT_SETTINGS.fontFamily;
          if (typeof merged.wpm !== 'number' || isNaN(merged.wpm) || merged.wpm < 50) merged.wpm = DEFAULT_SETTINGS.wpm;
          if (typeof merged.fontSize !== 'number' || isNaN(merged.fontSize)) merged.fontSize = DEFAULT_SETTINGS.fontSize;
          return merged;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SETTINGS;
  });

  // 2. Text & Document state
  const [currentText, setCurrentText] = useState<string>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEYS.CURRENT_TEXT);
      if (saved && typeof saved === 'string' && saved.trim()) return saved;
    } catch {
      // Ignore
    }
    return SAMPLE_TEXTS[0].text;
  });

  const [currentTitle, setCurrentTitle] = useState<string>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEYS.CURRENT_TITLE);
      if (saved && typeof saved === 'string' && saved.trim()) return saved;
    } catch {
      // Ignore
    }
    return SAMPLE_TEXTS[0].title;
  });

  const [savedDocs, setSavedDocs] = useState<SavedDocument[]>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEYS.SAVED_DOCS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore
    }
    return SAMPLE_TEXTS;
  });

  // 3. Playback & navigation state
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
      if (saved) {
        const parsedIdx = parseInt(saved, 10);
        if (!isNaN(parsedIdx) && isFinite(parsedIdx)) {
          return Math.max(0, parsedIdx);
        }
      }
    } catch {
      // Ignore
    }
    return 0;
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<ReaderViewMode>('rsvp');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 4. Modals and drawers
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isExtensionHubOpen, setIsExtensionHubOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastNotification(msg);
    setTimeout(() => {
      setToastNotification((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, []);

  // Save settings on update
  const handleUpdateSettings = useCallback((updater: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updater };
      try {
        safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    } catch {
      // Ignore
    }
  };

  // Parse words with the chosen highlight style - guaranteed never empty
  const parsedWords = useMemo<HighlightedWordParts[]>(() => {
    const textToParse = currentText && currentText.trim() ? currentText : SAMPLE_TEXTS[0].text;
    const words = parseTextIntoWords(textToParse, settings.highlightStyle);
    if (words.length === 0) {
      return parseTextIntoWords(SAMPLE_TEXTS[0].text, settings.highlightStyle);
    }
    return words;
  }, [currentText, settings.highlightStyle]);

  // Keep index within bounds
  useEffect(() => {
    if (parsedWords.length > 0 && currentIndex >= parsedWords.length) {
      setCurrentIndex(0);
    }
  }, [parsedWords.length, currentIndex]);

  // Save text changes
  const handleApplyText = useCallback((text: string, title?: string) => {
    const validText = text && text.trim() ? text : SAMPLE_TEXTS[0].text;
    const validTitle = title || 'Custom Reading';
    setCurrentText(validText);
    setCurrentTitle(validTitle);
    setCurrentIndex(0);
    setIsPlaying(false);

    try {
      safeStorage.setItem(STORAGE_KEYS.CURRENT_TEXT, validText);
      safeStorage.setItem(STORAGE_KEYS.CURRENT_TITLE, validTitle);
      safeStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, '0');

      // Update or add to saved docs
      setSavedDocs((prev) => {
        const existingIdx = prev.findIndex((d) => d.title === validTitle);
        const newDoc: SavedDocument = {
          id: existingIdx >= 0 ? prev[existingIdx].id : `doc-${Date.now()}`,
          title: validTitle,
          text: validText,
          wordCount: validText.trim().split(/\s+/).filter(Boolean).length,
          lastReadIndex: 0,
          lastReadDate: new Date().toISOString(),
        };

        let updated: SavedDocument[];
        if (existingIdx >= 0) {
          updated = [...prev];
          updated[existingIdx] = newDoc;
        } else {
          updated = [newDoc, ...prev];
        }
        safeStorage.setItem(STORAGE_KEYS.SAVED_DOCS, JSON.stringify(updated));
        return updated;
      });
    } catch {
      // Ignore
    }
  }, []);

  // Check for captured text from Chrome Extension (URL params, storage, or runtime message)
  useEffect(() => {
    let isMounted = true;

    const checkCapturedText = async (): Promise<boolean> => {
      try {
        const stored = await getStoredCapturedText();
        if (stored && stored.text && stored.text.trim()) {
          if (!isMounted) return true;
          handleApplyText(stored.text, stored.title || 'Web Selection');
          showToast(`⚡ Loaded highlighted text from ${stored.title || 'webpage'}`);
          await clearStoredCapturedText();
          return true;
        }
      } catch (err) {
        console.warn('Error checking captured text:', err);
      }
      return false;
    };

    let timer1: NodeJS.Timeout | null = null;
    let timer2: NodeJS.Timeout | null = null;

    // Immediate check
    checkCapturedText().then((found) => {
      // If not immediately found in storage, check again after short intervals
      // to account for any storage I/O delay between background worker & tab launch
      if (!found && isMounted) {
        timer1 = setTimeout(checkCapturedText, 150);
        timer2 = setTimeout(checkCapturedText, 500);
      }
    });

    // Listen for real-time messages ONLY in verified Chrome Extension environment
    let messageListener: ((message: any) => void) | null = null;
    try {
      if (isChromeExtensionEnvironment() && typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
        messageListener = (message: any) => {
          if (message && message.action === 'NEW_CAPTURED_TEXT' && message.text) {
            handleApplyText(message.text, message.title || 'Web Selection');
            showToast(`⚡ Captured highlighted text: "${message.title || 'Web Selection'}"`);
          }
        };

        chrome.runtime.onMessage.addListener(messageListener);
      }
    } catch (err) {
      console.warn('Could not attach extension message listener:', err);
    }

    return () => {
      isMounted = false;
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      try {
        if (messageListener && isChromeExtensionEnvironment() && typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(messageListener);
        }
      } catch {
        // ignore
      }
    };
  }, [handleApplyText, showToast]);

  const handleDeleteDocument = useCallback((id: string) => {
    setSavedDocs((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      try {
        safeStorage.setItem(STORAGE_KEYS.SAVED_DOCS, JSON.stringify(filtered));
      } catch {
        // Ignore
      }
      return filtered;
    });
  }, []);

  // Save index on change
  const handleIndexChange = useCallback((newIdx: number) => {
    const validIdx = Math.max(0, isNaN(newIdx) || !isFinite(newIdx) ? 0 : Math.floor(newIdx));
    setCurrentIndex(validIdx);
    try {
      safeStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, validIdx.toString());
    } catch {
      // Ignore
    }
  }, []);

  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const parsedWordsLengthRef = useRef(parsedWords.length);
  useEffect(() => {
    parsedWordsLengthRef.current = parsedWords.length;
  }, [parsedWords.length]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && currentIndexRef.current >= parsedWordsLengthRef.current - 1) {
        handleIndexChange(0);
        return true;
      }
      return !prev;
    });
  }, [handleIndexChange]);

  const handleRestart = useCallback(() => {
    setIsPlaying(false);
    handleIndexChange(0);
  }, [handleIndexChange]);

  // Fullscreen toggle
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Listen to fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing inside input / textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleIndexChange(Math.max(0, currentIndex - (e.shiftKey ? 1 : 10)));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleIndexChange(Math.min(parsedWords.length - 1, currentIndex + (e.shiftKey ? 1 : 10)));
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleUpdateSettings({ wpm: Math.min(1000, settings.wpm + 25) });
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleUpdateSettings({ wpm: Math.max(60, settings.wpm - 25) });
      } else if (e.key === 'r' || e.key === 'R') {
        handleRestart();
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        setViewMode((m) => (m === 'rsvp' ? 'flow' : 'rsvp'));
      } else if (e.key === 's' || e.key === 'S') {
        handleUpdateSettings({ metronomeSound: !settings.metronomeSound });
      } else if (e.key === 'v' || e.key === 'V') {
        handleUpdateSettings({ speechNarration: !settings.speechNarration });
        showToast(!settings.speechNarration ? '🎙️ Voice-Over Narration Enabled' : '🔇 Voice-Over Narration Disabled');
      } else if (e.code === 'Escape') {
        setIsTextInputOpen(false);
        setIsSettingsOpen(false);
        setIsShortcutsOpen(false);
        setIsExtensionHubOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleTogglePlay, 
    handleIndexChange, 
    handleRestart, 
    settings.wpm, 
    settings.metronomeSound, 
    parsedWords.length, 
    currentIndex, 
    handleUpdateSettings
  ]);

  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isAnyModalOpen = isTextInputOpen || isSettingsOpen || isShortcutsOpen || isExtensionHubOpen;

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (isAnyModalOpen) return;
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 5000);
  }, [isAnyModalOpen]);

  useEffect(() => {
    if (isAnyModalOpen) {
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const handleActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [resetIdleTimer, isAnyModalOpen]);

  const currentThemeConfig = getTheme(settings.theme);

  return (
    <div 
      id="adhd-reader-app"
      className={`h-screen max-h-screen overflow-hidden flex flex-col ${currentThemeConfig.bgClass} ${currentThemeConfig.textPrimary} transition-colors duration-200 select-none`}
    >
      {/* Toast Notification for Extension Web Capture */}
      {toastNotification && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-red-500/50 text-white shadow-2xl animate-in slide-in-from-top-2 duration-200">
          <Zap className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
          <span className="text-xs font-semibold">{toastNotification}</span>
        </div>
      )}

      {/* Top Navigation / Header */}
      {!isFullscreen && (
        <Header
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          onOpenTextInput={() => setIsTextInputOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onOpenExtensionHub={() => setIsExtensionHubOpen(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          currentTitle={currentTitle}
          isIdle={isIdle}
        />
      )}

      {/* Main Interactive Stage */}
      <main className="flex-1 flex flex-col relative w-full h-full min-h-0 overflow-hidden">
        {viewMode === 'rsvp' ? (
          <RSVPReader
            words={parsedWords}
            currentIndex={currentIndex}
            onIndexChange={handleIndexChange}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onRestart={handleRestart}
            isIdle={isIdle}
          />
        ) : (
          <FlowReader
            words={parsedWords}
            currentIndex={currentIndex}
            onIndexChange={handleIndexChange}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onRestart={handleRestart}
            onSwitchToRsvp={() => setViewMode('rsvp')}
            isIdle={isIdle}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <TextInputModal
        isOpen={isTextInputOpen}
        onClose={() => setIsTextInputOpen(false)}
        currentText={currentText}
        currentTitle={currentTitle}
        onApplyText={handleApplyText}
        savedDocuments={savedDocs}
        onSaveDocument={(doc) => setSavedDocs((prev) => [doc, ...prev])}
        onDeleteDocument={handleDeleteDocument}
        onOpenExtensionHub={() => {
          setIsTextInputOpen(false);
          setIsExtensionHubOpen(true);
        }}
        settings={settings}
      />

      <ExtensionHubModal
        isOpen={isExtensionHubOpen}
        onClose={() => setIsExtensionHubOpen(false)}
        onApplyCapturedText={(text, title) => {
          handleApplyText(text, title || 'Captured Webpage Selection');
          showToast(`⚡ Captured text loaded into ADHD Reader!`);
        }}
        settings={settings}
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onResetDefaults={handleResetDefaults}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        settings={settings}
      />
    </div>
  );
}
