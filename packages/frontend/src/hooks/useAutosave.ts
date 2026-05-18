import { useRef, useEffect, useCallback } from "react";

interface AutosaveOptions {
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * useAutosave — W3 autosave hook.
 * Debounces saves and flushes on page unload via sendBeacon.
 *
 * @param record - The current form state (compared by JSON.stringify)
 * @param saveFn - Async function to persist the record
 * @param options - { debounceMs: 10000, enabled: true }
 */
export function useAutosave<T>(
  record: T,
  saveFn: (data: T) => Promise<void>,
  options: AutosaveOptions = {}
) {
  const { debounceMs = 10_000, enabled = true } = options;

  const latestRecord = useRef<T>(record);
  const lastSavedJson = useRef<string>(JSON.stringify(record));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const isDirty = useCallback(() => {
    return JSON.stringify(latestRecord.current) !== lastSavedJson.current;
  }, []);

  const flush = useCallback(async () => {
    if (!isDirty()) return;
    const data = latestRecord.current;
    try {
      await saveFnRef.current(data);
      lastSavedJson.current = JSON.stringify(data);
    } catch {
      // Save failed — will retry on next debounce
    }
  }, [isDirty]);

  // Update ref whenever record changes
  useEffect(() => {
    latestRecord.current = record;
  }, [record]);

  // Debounced save
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flush();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [record, debounceMs, enabled, flush]);

  // Flush on page unload via sendBeacon
  useEffect(() => {
    if (!enabled) return;
    const handleUnload = () => {
      if (!isDirty()) return;
      const data = JSON.stringify(latestRecord.current);
      // Store to localStorage as a draft backup
      const key = `gda_autosave_${window.location.pathname}`;
      try {
        localStorage.setItem(key, data);
        localStorage.setItem(`${key}_at`, new Date().toISOString());
      } catch {
        // localStorage full or unavailable
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [enabled, isDirty]);

  return { flush, isDirty };
}

/**
 * useDraftRestore — checks localStorage for an unsaved draft.
 * Returns the draft and a clear function.
 */
export function useDraftRestore<T>(key: string): {
  draft: T | null;
  draftAt: string | null;
  clearDraft: () => void;
} {
  const storageKey = `gda_autosave_${key}`;
  let draft: T | null = null;
  let draftAt: string | null = null;

  try {
    const raw = localStorage.getItem(storageKey);
    const rawAt = localStorage.getItem(`${storageKey}_at`);
    if (raw) {
      draft = JSON.parse(raw) as T;
      draftAt = rawAt;
    }
  } catch {
    // ignore
  }

  const clearDraft = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(`${storageKey}_at`);
  };

  return { draft, draftAt, clearDraft };
}
