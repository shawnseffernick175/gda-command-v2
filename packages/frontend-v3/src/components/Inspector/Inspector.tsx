import { type ReactNode, useState, useEffect, useCallback } from "react";

export interface InspectorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const STORAGE_KEY = "gda-inspector-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 320;
const MAX_WIDTH = 560;

function getStoredWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (val >= MIN_WIDTH && val <= MAX_WIDTH) return val;
    }
  } catch { /* noop */ }
  return DEFAULT_WIDTH;
}

export function Inspector({ open, onClose, title, children }: InspectorProps) {
  const [width, setWidth] = useState(getStoredWidth);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(width)); } catch { /* noop */ }
  }, [width]);

  const handleMouseDown = useCallback(() => {
    setResizing(true);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth)));
    };
    const handleUp = () => setResizing(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizing]);

  if (!open) return null;

  return (
    <aside
      style={{ width }}
      className="fixed top-0 right-0 h-screen bg-surface border-l border-border z-30 flex flex-col animate-[slideInRight_120ms_ease-out]"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/20"
        onMouseDown={handleMouseDown}
      />
      <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-ink-primary">{title}</span>
        <button
          onClick={onClose}
          className="text-ink-muted hover:text-ink-primary text-lg"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
