import { useEffect, useRef } from 'react';
import type { DialogProps } from '../../types';

const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };

export function Dialog({ open, onClose, title, size = 'md', children, footer }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/60" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`w-full ${sizeMap[size]} rounded-md border border-border bg-surface-raised`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'var(--duration-reveal) ease-out fadeIn' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="dialog-title" className="text-md font-semibold text-ink-primary">{title}</h2>
          <button type="button" className="text-ink-muted hover:text-ink-primary text-lg" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">{footer}</div>}
      </div>
    </div>
  );
}
