/**
 * Safe Storage Wrapper
 * Prevents DOMException / SecurityError when cookies or storage are restricted
 * (e.g. in cross-origin iframes, sandboxed environments, or private browsing).
 * Gracefully handles QuotaExceededError and prevents oversized payloads from failing.
 */

import { logDevDiagnostic } from './performanceDiagnostics';

// Safe limit per item (2 MB) to prevent exhausting browser 5MB origin limit
export const SAFE_MAX_STORAGE_ITEM_BYTES = 2 * 1024 * 1024;

const memoryFallback: Record<string, string> = {};
// Track keys that failed or were diverted to in-memory fallback
const fallbackKeys = new Set<string>();

export interface StorageDiagnosticInfo {
  quotaExceededCount: number;
  lastErrorKey: string | null;
  lastErrorMessage: string | null;
  lastErrorTimestamp: number | null;
  inMemoryKeys: string[];
}

const storageDiagnostics: StorageDiagnosticInfo = {
  quotaExceededCount: 0,
  lastErrorKey: null,
  lastErrorMessage: null,
  lastErrorTimestamp: null,
  inMemoryKeys: [],
};

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

let hasLocalStorage = isLocalStorageAvailable();

export const safeStorage = {
  getItem(key: string): string | null {
    // If this key was explicitly diverted to memory fallback (e.g. due to quota), return memory copy first
    if (fallbackKeys.has(key)) {
      return memoryFallback[key] ?? null;
    }

    try {
      if (hasLocalStorage) {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
          return value;
        }
      }
    } catch (e) {
      console.warn(`[SafeStorage] Read failed for key "${key}", falling back to memory:`, e);
    }

    return memoryFallback[key] ?? null;
  },

  setItem(key: string, value: string): void {
    const sizeBytes = value.length * 2; // Approximate UTF-16 size in bytes

    // Large document payload safeguard:
    // If a document exceeds the safe item size, store in memory fallback to avoid QuotaExceededError
    if (sizeBytes > SAFE_MAX_STORAGE_ITEM_BYTES) {
      memoryFallback[key] = value;
      fallbackKeys.add(key);
      storageDiagnostics.inMemoryKeys = Array.from(fallbackKeys);
      logDevDiagnostic('Storage Diverted to Memory (Payload Size)', {
        key,
        sizeKb: Math.round(sizeBytes / 1024),
        reason: 'Exceeds SAFE_MAX_STORAGE_ITEM_BYTES threshold',
      });
      return;
    }

    try {
      if (hasLocalStorage) {
        window.localStorage.setItem(key, value);
        // If it succeeded, clear any previous fallback marker
        fallbackKeys.delete(key);
        delete memoryFallback[key];
        storageDiagnostics.inMemoryKeys = Array.from(fallbackKeys);
        return;
      }
    } catch (e: any) {
      const isQuotaError = 
        e?.name === 'QuotaExceededError' || 
        e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
        e?.code === 22 || 
        e?.code === 1014;

      if (isQuotaError) {
        storageDiagnostics.quotaExceededCount++;
      }

      storageDiagnostics.lastErrorKey = key;
      storageDiagnostics.lastErrorMessage = e?.message || String(e);
      storageDiagnostics.lastErrorTimestamp = Date.now();

      console.warn(
        `[SafeStorage] LocalStorage write failed for key "${key}" (${Math.round(sizeBytes / 1024)} KB). Retaining safely in memory:`,
        e
      );
    }

    // Always ensure memory copy is preserved so user work is never lost
    memoryFallback[key] = value;
    fallbackKeys.add(key);
    storageDiagnostics.inMemoryKeys = Array.from(fallbackKeys);
  },

  removeItem(key: string): void {
    fallbackKeys.delete(key);
    delete memoryFallback[key];
    storageDiagnostics.inMemoryKeys = Array.from(fallbackKeys);

    try {
      if (hasLocalStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  },

  clearAll(): void {
    fallbackKeys.clear();
    for (const k of Object.keys(memoryFallback)) {
      delete memoryFallback[k];
    }
    storageDiagnostics.inMemoryKeys = [];

    try {
      if (hasLocalStorage) {
        window.localStorage.clear();
      }
    } catch {
      // Ignore
    }
  },

  getDiagnostics(): Readonly<StorageDiagnosticInfo> {
    return { ...storageDiagnostics };
  },

  isFallbackKey(key: string): boolean {
    return fallbackKeys.has(key);
  },
};

