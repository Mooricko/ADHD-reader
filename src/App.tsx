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
import { parseTextIntoWords, countWordsFast } from './utils/textParser';
import { logDevDiagnostic } from './utils/performanceDiagnostics';
import { THEME_CONFIGS, HIGHLIGHT_COLORS, FONT_CONFIGS, getTheme } from './utils/themeStyles';
import { Header } from './components/Header';
import { RSVPReader } from './components/RSVPReader';
import { FlowReader } from './components/FlowReader';
import { TextInputModal } from './components/TextInputModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ExtensionHubModal } from './components/ExtensionHubModal';
import { FocusTimerModal } from './components/FocusTimerModal';
import { ReadingStatsModal } from './components/ReadingStatsModal';
import { safeStorage } from './utils/safeStorage';
import { 
  isChromeExtensionEnvironment, 
  getStoredCapturedText, 
  clearStoredCapturedText 
} from './utils/extensionBridge';
import { useReadingHeatmap } from './hooks/useReadingHeatmap';
import { useSmartAutoPause, AutoPauseReason } from './hooks/useSmartAutoPause';
import { calculateWarmupStatus, WARMUP_TOTAL_WORDS } from './utils/smartPacing';
import { CheckCircle2, Zap, Upload } from 'lucide-react';

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
  doNotDisturb: false,
  showHeatmapProgress: true,
  smartAutoPause: true,
  smartPace: true,
  warmupMode: false,
  warmupStartWpm: 180,
  driftAnimation: false,
  driftIntensity: 'moderate',
};

const STORAGE_KEYS = {
  SETTINGS: 'adhd_reader_settings_v1',
  VIEW_MODE: 'adhd_reader_view_mode_v1',
  CURRENT_TEXT: 'adhd_reader_text_v1',
  CURRENT_TITLE: 'adhd_reader_title_v1',
  SAVED_DOCS: 'adhd_reader_saved_docs_v1',
  CURRENT_INDEX: 'adhd_reader_index_v1',
};

export default function App() {
  // 1. Settings state with safeStorage recovery and strict sanitization (persisting chunkSize, fontSize, flowFontSize, etc.)
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
          if (typeof merged.fontSize !== 'number' || isNaN(merged.fontSize) || merged.fontSize < 16) merged.fontSize = DEFAULT_SETTINGS.fontSize;
          if (typeof merged.flowFontSize !== 'number' || isNaN(merged.flowFontSize) || merged.flowFontSize < 12) merged.flowFontSize = DEFAULT_SETTINGS.flowFontSize;
          if (![1, 3, 5].includes(Number(merged.chunkSize))) {
            merged.chunkSize = 1;
          } else {
            merged.chunkSize = Number(merged.chunkSize) as 1 | 3 | 5;
          }
          if (typeof merged.doNotDisturb !== 'boolean') merged.doNotDisturb = false;
          if (typeof merged.showHeatmapProgress !== 'boolean') merged.showHeatmapProgress = true;
          if (typeof merged.smartAutoPause !== 'boolean') merged.smartAutoPause = true;
          if (typeof merged.smartPace !== 'boolean') merged.smartPace = true;
          if (typeof merged.warmupMode !== 'boolean') merged.warmupMode = false;
          if (typeof merged.warmupStartWpm !== 'number' || isNaN(merged.warmupStartWpm) || merged.warmupStartWpm < 50) {
            merged.warmupStartWpm = 180;
          }
          if (typeof merged.driftAnimation !== 'boolean') merged.driftAnimation = false;
          if (!['subtle', 'moderate', 'dynamic'].includes(merged.driftIntensity as string)) {
            merged.driftIntensity = 'moderate';
          }
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
  const [viewMode, setViewMode] = useState<ReaderViewMode>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      if (saved === 'rsvp' || saved === 'flow') {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'rsvp';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Synchronize viewMode to localStorage so reader remembers user preference on refresh
  useEffect(() => {
    try {
      safeStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
    } catch {
      // Ignore
    }
  }, [viewMode]);

  // Synchronize settings (chunk size, font size, etc.) to localStorage on change
  useEffect(() => {
    try {
      safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }, [settings]);

  // 4. Modals and drawers
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isExtensionHubOpen, setIsExtensionHubOpen] = useState(false);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // 5. Reading Focus Timer & Sessions (Requirement 4 & 5)
  const [timerSecondsRemaining, setTimerSecondsRemaining] = useState<number>(0);
  const [initialTimerDuration, setInitialTimerDuration] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimerSet, setIsTimerSet] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timer countdown effect
  useEffect(() => {
    if (isTimerRunning && timerSecondsRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current as NodeJS.Timeout);
            setIsTimerRunning(false);
            setIsTimerSet(false);
            // Auto pause playback when session finishes
            setIsPlaying(false);

            // Notify user unless Do Not Disturb is enabled
            if (!settings.doNotDisturb) {
              setToastNotification('🎉 Focus reading session complete! Take a deep breath.');
              setTimeout(() => setToastNotification(null), 5000);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isTimerRunning, timerSecondsRemaining, settings.doNotDisturb]);

  // Show Toast with Do Not Disturb enforcement (Requirement 5)
  const showToast = useCallback((msg: string) => {
    // When timer is set and Do Not Disturb is ON, suppress all notifications
    if (isTimerSet && settings.doNotDisturb) {
      return;
    }
    setToastNotification(msg);
    setTimeout(() => {
      setToastNotification((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, [isTimerSet, settings.doNotDisturb]);

  // Warm-up Mode Session Tracking (Gradually increases speed over first 300 words)
  const [sessionWordsRead, setSessionWordsRead] = useState(0);

  const warmupStatus = useMemo(() => {
    return calculateWarmupStatus(
      settings.wpm,
      settings.warmupMode,
      settings.warmupStartWpm || 180,
      sessionWordsRead
    );
  }, [sessionWordsRead, settings.warmupStartWpm, settings.wpm, settings.warmupMode]);

  const handleWordStep = useCallback(() => {
    setSessionWordsRead((prev) => prev + 1);
  }, []);

  const handleSkipWarmup = useCallback(() => {
    setSessionWordsRead(WARMUP_TOTAL_WORDS);
  }, []);

  const handleResetWarmup = useCallback(() => {
    setSessionWordsRead(0);
  }, []);

  // 6. Window-level Drag & Drop for Universal Input Hub
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsWindowDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsWindowDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsWindowDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        setIsTextInputOpen(true);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleStartTimer = useCallback((durationMinutes = 15) => {
    const totalSecs = durationMinutes * 60;
    setInitialTimerDuration(totalSecs);
    setTimerSecondsRemaining(totalSecs);
    setIsTimerSet(true);
    setIsTimerRunning(true);
    if (!settings.doNotDisturb) {
      showToast(`⏱️ ${durationMinutes} min focus timer started`);
    }
  }, [settings.doNotDisturb, showToast]);

  const handlePauseTimer = useCallback(() => {
    setIsTimerRunning(false);
  }, []);

  const handleResumeTimer = useCallback(() => {
    if (timerSecondsRemaining > 0) {
      setIsTimerRunning(true);
    }
  }, [timerSecondsRemaining]);

  const handleResetTimer = useCallback(() => {
    setIsTimerRunning(false);
    setIsTimerSet(false);
    setTimerSecondsRemaining(0);
    setInitialTimerDuration(0);
  }, []);

  const handleAdjustTimer = useCallback((deltaSeconds: number) => {
    setTimerSecondsRemaining((prev) => Math.max(10, prev + deltaSeconds));
  }, []);

  // Formatted Timer String for Header
  const timerFormatted = useMemo(() => {
    const m = Math.floor(timerSecondsRemaining / 60);
    const s = timerSecondsRemaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [timerSecondsRemaining]);

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

  // Dev-only timing instrumentation for initial reader render
  const lastRenderedTextRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastRenderedTextRef.current !== currentText) {
      lastRenderedTextRef.current = currentText;
      const start = performance.now();
      requestAnimationFrame(() => {
        const durationMs = Math.round((performance.now() - start) * 100) / 100;
        logDevDiagnostic('initial reader render', {
          durationMs,
          charCount: currentText.length,
          wordCount: parsedWords.length,
        });
      });
    }
  }, [currentText, parsedWords.length]);

  // Save text changes
  const handleApplyText = useCallback((text: string, title?: string) => {
    const validText = text && text.trim() ? text : SAMPLE_TEXTS[0].text;
    const validTitle = title || 'Custom Reading';
    setCurrentText(validText);
    setCurrentTitle(validTitle);
    setCurrentIndex(0);
    setIsPlaying(false);
    setSessionWordsRead(0);

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
          wordCount: countWordsFast(validText),
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

  // Debounced persistence for currentIndex to prevent disk I/O thrashing during 5-10 words/sec RSVP playback
  const indexSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingIndexSaveRef = useRef<number | null>(null);

  const flushIndexSave = useCallback(() => {
    if (pendingIndexSaveRef.current !== null) {
      try {
        safeStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, pendingIndexSaveRef.current.toString());
      } catch {
        // Ignore
      }
      pendingIndexSaveRef.current = null;
    }
  }, []);

  // Save index on change (React state updates immediately; storage write is debounced)
  const handleIndexChange = useCallback((newIdx: number) => {
    setIsAutoPaused(false);
    setAutoPauseReason(null);
    const validIdx = Math.max(0, isNaN(newIdx) || !isFinite(newIdx) ? 0 : Math.floor(newIdx));
    setCurrentIndex(validIdx);
    pendingIndexSaveRef.current = validIdx;

    if (!indexSaveTimeoutRef.current) {
      indexSaveTimeoutRef.current = setTimeout(() => {
        indexSaveTimeoutRef.current = null;
        flushIndexSave();
      }, 750);
    }
  }, [flushIndexSave]);

  // Flush pending index whenever playback stops
  useEffect(() => {
    if (!isPlaying) {
      flushIndexSave();
    }
  }, [isPlaying, flushIndexSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushIndexSave();
    };
  }, [flushIndexSave]);

  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const parsedWordsLengthRef = useRef(parsedWords.length);
  useEffect(() => {
    parsedWordsLengthRef.current = parsedWords.length;
  }, [parsedWords.length]);

  // Smart Auto-Pause state
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoPauseReason, setAutoPauseReason] = useState<AutoPauseReason | null>(null);

  const handleAutoPause = useCallback((reason: AutoPauseReason) => {
    setIsPlaying(false);
    setIsAutoPaused(true);
    setAutoPauseReason(reason);
    const reasonText = reason === 'mouse' ? 'cursor left window' : 'window lost focus';
    showToast(`⏸️ Smart Auto-Paused (${reasonText})`);
  }, [showToast]);

  // Hook for Smart Auto-Pause
  useSmartAutoPause({
    isPlaying,
    enabled: settings.smartAutoPause !== false,
    onAutoPause: handleAutoPause,
  });

  const handleTogglePlay = useCallback(() => {
    setIsAutoPaused(false);
    setAutoPauseReason(null);
    setIsPlaying((prev) => {
      if (!prev && currentIndexRef.current >= parsedWordsLengthRef.current - 1) {
        handleIndexChange(0);
        return true;
      }
      return !prev;
    });
  }, [handleIndexChange]);

  const handleRestart = useCallback(() => {
    setIsAutoPaused(false);
    setAutoPauseReason(null);
    setIsPlaying(false);
    setSessionWordsRead(0);
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

      // Universal Input Hub Shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setIsTextInputOpen(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        setIsTextInputOpen(true);
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
      } else if (e.key === 't' || e.key === 'T') {
        setIsTimerModalOpen((prev) => !prev);
      } else if (e.key === 'a' || e.key === 'A') {
        setIsStatsModalOpen((prev) => !prev);
      } else if (e.key === 'd' || e.key === 'D') {
        handleUpdateSettings({ theme: settings.theme === 'light' ? 'midnight' : 'light' });
      } else if (e.code === 'Escape') {
        setIsTextInputOpen(false);
        setIsSettingsOpen(false);
        setIsShortcutsOpen(false);
        setIsExtensionHubOpen(false);
        setIsTimerModalOpen(false);
        setIsStatsModalOpen(false);
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
    settings.speechNarration,
    settings.theme,
    parsedWords.length, 
    currentIndex, 
    handleUpdateSettings,
    showToast
  ]);

  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isAnyModalOpen = isTextInputOpen || isSettingsOpen || isShortcutsOpen || isExtensionHubOpen || isTimerModalOpen || isStatsModalOpen;

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

  // Heatmap Dwell Time & Complexity Tracking Engine
  const { heatmapData, statsSummary, resetHeatmap, clearAllStats } = useReadingHeatmap({
    words: parsedWords,
    currentIndex,
    isPlaying,
    wpm: settings.wpm,
    documentTitle: currentTitle,
    isIdle,
  });

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
          timerFormatted={timerFormatted}
          isTimerRunning={isTimerRunning}
          isTimerSet={isTimerSet}
          onOpenTimerModal={() => setIsTimerModalOpen(true)}
          onOpenStatsModal={() => setIsStatsModalOpen(true)}
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
            heatmapData={heatmapData}
            onResetHeatmap={resetHeatmap}
            onOpenStatsModal={() => setIsStatsModalOpen(true)}
            isAutoPaused={isAutoPaused}
            autoPauseReason={autoPauseReason}
            onResume={handleTogglePlay}
            warmupStatus={warmupStatus}
            onWordStep={handleWordStep}
            onSkipWarmup={handleSkipWarmup}
            onResetWarmup={handleResetWarmup}
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
            heatmapData={heatmapData}
            onResetHeatmap={resetHeatmap}
            onOpenStatsModal={() => setIsStatsModalOpen(true)}
            warmupStatus={warmupStatus}
            onWordStep={handleWordStep}
            onSkipWarmup={handleSkipWarmup}
            onResetWarmup={handleResetWarmup}
          />
        )}
      </main>

      {/* Persistent Bottom Edge Visual Heatmap Progress Line */}
      {settings.showHeatmapProgress !== false && heatmapData && (
        <div
          id="screen-bottom-heatmap-indicator"
          className="fixed bottom-0 inset-x-0 h-1 sm:h-1.5 z-30 transition-all duration-300 opacity-85 hover:opacity-100 pointer-events-none"
          style={{
            background: heatmapData.gradientCss,
            boxShadow: '0 -1px 6px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Active playhead point on bottom edge */}
          <div
            className="absolute top-0 bottom-0 w-2.5 -translate-x-1/2 bg-white shadow-md rounded-full"
            style={{
              left: `${parsedWords.length > 0 ? (currentIndex / Math.max(1, parsedWords.length - 1)) * 100 : 0}%`,
            }}
          />
        </div>
      )}

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
        onOpenTimerModal={() => setIsTimerModalOpen(true)}
        warmupStatus={warmupStatus}
        onResetWarmup={handleResetWarmup}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        settings={settings}
      />

      {/* Focus Session Timer Modal (Requirement 4 & 5) */}
      <FocusTimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        secondsRemaining={timerSecondsRemaining}
        initialDurationSeconds={initialTimerDuration}
        isRunning={isTimerRunning}
        isSet={isTimerSet}
        onStart={handleStartTimer}
        onPause={handlePauseTimer}
        onResume={handleResumeTimer}
        onReset={handleResetTimer}
        onAdjustTime={handleAdjustTimer}
        doNotDisturb={settings.doNotDisturb}
        onToggleDoNotDisturb={(dnd) => handleUpdateSettings({ doNotDisturb: dnd })}
        theme={currentThemeConfig}
        highlightHex={HIGHLIGHT_COLORS[settings.highlightColor]?.hex || '#ef4444'}
      />

      {/* Reading Statistics & Heatmap Analytics Modal */}
      <ReadingStatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        statsSummary={statsSummary}
        settings={settings}
        currentDocumentTitle={currentTitle}
        onClearStats={clearAllStats}
      />

      {/* Global Drag & Drop Overlay */}
      {isWindowDragging && (
        <div 
          id="window-drag-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 pointer-events-none animate-in fade-in duration-150"
        >
          <div className="p-8 rounded-3xl border-2 border-dashed border-red-500 bg-red-500/10 text-center max-w-md shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-red-500 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
              <Upload className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Drop to Import into ADHD Reader</h2>
            <p className="text-sm text-slate-300 mb-4">
              Release your TXT, Markdown, or PDF document to start reading immediately
            </p>
            <div className="flex items-center justify-center gap-3 text-xs font-mono text-slate-400">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">TXT</span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">MD</span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">PDF</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
