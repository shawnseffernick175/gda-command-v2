"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
interface QaChecklistState {
  isOpen: boolean;
  routeFilter: "all" | "current";
  open: () => void;
  close: () => void;
  toggle: () => void;
  setRouteFilter: (filter: "all" | "current") => void;
}

const QaChecklistContext = createContext<QaChecklistState | null>(null);

export function QaChecklistProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState<"all" | "current">("current");

  const open = useCallback(() => {
    setRouteFilter("current");
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) setRouteFilter("current");
      return !prev;
    });
  }, []);

  return (
    <QaChecklistContext.Provider
      value={{ isOpen, routeFilter, open, close, toggle, setRouteFilter }}
    >
      {children}
    </QaChecklistContext.Provider>
  );
}

export function useQaChecklist() {
  const ctx = useContext(QaChecklistContext);
  if (!ctx) throw new Error("useQaChecklist must be inside QaChecklistProvider");
  return ctx;
}
