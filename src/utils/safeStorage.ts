/**
 * Safe Storage Wrapper
 * Prevents DOMException / SecurityError when cookies or storage are restricted
 * (e.g. in cross-origin iframes, sandboxed environments, or private browsing).
 */

const memoryFallback: Record<string, string> = {};

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__adhd_storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const hasLocalStorage = isLocalStorageAvailable();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (hasLocalStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('Storage read fallback to memory:', e);
    }
    return memoryFallback[key] ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (hasLocalStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn('Storage write fallback to memory:', e);
    }
    memoryFallback[key] = value;
  },

  removeItem(key: string): void {
    try {
      if (hasLocalStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
    delete memoryFallback[key];
  },

  clearAll(): void {
    try {
      if (hasLocalStorage) {
        window.localStorage.clear();
      }
    } catch {
      // Ignore
    }
    for (const k of Object.keys(memoryFallback)) {
      delete memoryFallback[k];
    }
  },
};
