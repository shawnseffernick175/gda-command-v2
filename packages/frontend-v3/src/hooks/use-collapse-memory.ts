"use client";

import { useCallback, useState } from "react";

/**
 * Collapse memory — sessionStorage-backed.
 * Collapsed on first visit; open-state remembered while session lasts;
 * resets to collapsed on browser close (sessionStorage, NOT localStorage).
 */
export function useCollapseMemory(key: string, defaultOpen = false) {
  const storageKey = `gda-collapse:${key}`;

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = sessionStorage.getItem(storageKey);
    if (stored !== null) return stored === "1";
    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }, [storageKey]);

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      sessionStorage.setItem(storageKey, open ? "1" : "0");
    },
    [storageKey],
  );

  return { isOpen, toggle, setOpen };
}
