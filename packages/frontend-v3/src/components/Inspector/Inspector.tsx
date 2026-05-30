import { useState, useEffect, useCallback } from 'react';
import type { InspectorProps } from '../../types';

const STORAGE_KEY = 'gda-inspector-width';
const MIN_W = 320;
const MAX_W = 560;

export function Inspector({ open, onClose, title, children, defaultWidth = 400 }: InspectorProps) {
  const [width, setWidth] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return saved ? Math.min(MAX_W, Math.max(MIN_W, Number(saved))) : defaultWidth;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  const onMouseDown = useCallback(() => setDragging(true), []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const newW = window.innerWidth - e.clientX;
      setWidth(Math.min(MAX_W, Math.max(MIN_W, newW)));
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  if (!open) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full z-40 flex border-l border-border bg-surface"
      style={{ width: `${width}px`, animation: 'var(--duration-reveal) ease-out slideInRight' }}
    >
      <div className="w-1 cursor-col-resize hover:bg-accent/30 flex-shrink-0" onMouseDown={onMouseDown} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
          <button type="button" className="text-ink-muted hover:text-ink-primary" onClick={onClose} aria-label="Close inspector">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
