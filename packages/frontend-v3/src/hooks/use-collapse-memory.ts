"use client";

import { useCallback, useState } from "react";

/**
 * Collapse memory — localStorage-backed.
 * Persists open/closed state across browser sessions.
 */
export function useCollapseMemory(key: string, defaultOpen = false) {
  const storageKey = `settings_collapsed_${key}`;

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === "1";
    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }, [storageKey]);

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      localStorage.setItem(storageKey, open ? "1" : "0");
    },
    [storageKey],
  );

  return { isOpen, toggle, setOpen };
}
