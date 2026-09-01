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
import { THEME_CONFIGS, HIGHLIGHT_COLORS } from './utils/themeStyles';
import { Header } from './components/Header';
import { RSVPReader } from './components/RSVPReader';
import { FlowReader } from './components/FlowReader';
import { TextInputModal } from './components/TextInputModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';

const DEFAULT_SETTINGS: ReaderSettings = {
  wpm: 320,
  chunkSize: 1,
  highlightColor: 'red',
  highlightStyle: 'middle-two',
  theme: 'midnight',
  fontFamily: 'lexend',
  fontSize: 54,
  flowFontSize: 20,
  lineHeight: 1.8,
  letterSpacing: 0.02,
  smartPunctuationPause: true,
  metronomeSound: false,
  metronomeVolume: 0.3,
  showReticleGuides: true,
  showContextWords: false,
  opticalCenterLock: true,
};

const STORAGE_KEYS = {
  SETTINGS: 'adhd_reader_settings_v1',
  CURRENT_TEXT: 'adhd_reader_text_v1',
  CURRENT_TITLE: 'adhd_reader_title_v1',
  SAVED_DOCS: 'adhd_reader_saved_docs_v1',
  CURRENT_INDEX: 'adhd_reader_index_v1',
};

export default function App() {
  // 1. Settings state with localStorage recovery
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SETTINGS;
  });

  // 2. Text & Document state
  const [currentText, setCurrentText] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_TEXT);
      if (saved) return saved;
    } catch {
      // Ignore
    }
    return SAMPLE_TEXTS[0].text;
  });

  const [currentTitle, setCurrentTitle] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_TITLE);
      if (saved) return saved;
    } catch {
      // Ignore
    }
    return SAMPLE_TEXTS[0].title;
  });

  const [savedDocs, setSavedDocs] = useState<SavedDocument[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SAVED_DOCS);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return SAMPLE_TEXTS;
  });

  // 3. Playback & navigation state
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
      if (saved) return Math.max(0, parseInt(saved, 10));
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

  // Save settings on update
  const handleUpdateSettings = useCallback((updater: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updater };
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    } catch {
      // Ignore
    }
  };

  // Parse words with the chosen highlight style
  const parsedWords = useMemo<HighlightedWordParts[]>(() => {
    return parseTextIntoWords(currentText, settings.highlightStyle);
  }, [currentText, settings.highlightStyle]);

  // Keep index within bounds
  useEffect(() => {
    if (parsedWords.length > 0 && currentIndex >= parsedWords.length) {
      setCurrentIndex(0);
    }
  }, [parsedWords.length, currentIndex]);

  // Save text changes
  const handleApplyText = useCallback((text: string, title?: string) => {
    const validTitle = title || 'Custom Reading';
    setCurrentText(text);
    setCurrentTitle(validTitle);
    setCurrentIndex(0);
    setIsPlaying(false);

    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_TEXT, text);
      localStorage.setItem(STORAGE_KEYS.CURRENT_TITLE, validTitle);
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, '0');

      // Update or add to saved docs
      setSavedDocs((prev) => {
        const existingIdx = prev.findIndex((d) => d.title === validTitle);
        const newDoc: SavedDocument = {
          id: existingIdx >= 0 ? prev[existingIdx].id : `doc-${Date.now()}`,
          title: validTitle,
          text,
          wordCount: text.trim().split(/\s+/).filter(Boolean).length,
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
        localStorage.setItem(STORAGE_KEYS.SAVED_DOCS, JSON.stringify(updated));
        return updated;
      });
    } catch {
      // Ignore
    }
  }, []);

  const handleDeleteDocument = useCallback((id: string) => {
    setSavedDocs((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_DOCS, JSON.stringify(filtered));
      } catch {
        // Ignore
      }
      return filtered;
    });
  }, []);

  // Save index on change
  const handleIndexChange = useCallback((newIdx: number) => {
    setCurrentIndex(newIdx);
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, newIdx.toString());
    } catch {
      // Ignore
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && currentIndex >= parsedWords.length - 1) {
        handleIndexChange(0);
        return true;
      }
      return !prev;
    });
  }, [currentIndex, parsedWords.length, handleIndexChange]);

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
      } else if (e.code === 'Escape') {
        setIsTextInputOpen(false);
        setIsSettingsOpen(false);
        setIsShortcutsOpen(false);
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

  const currentThemeConfig = THEME_CONFIGS[settings.theme];

  return (
    <div 
      id="adhd-reader-app"
      className={`min-h-screen flex flex-col ${currentThemeConfig.bgClass} ${currentThemeConfig.textPrimary} transition-colors duration-200`}
    >
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
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          currentTitle={currentTitle}
        />
      )}

      {/* Main Interactive Stage */}
      <main className="flex-1 flex flex-col relative w-full h-full">
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
