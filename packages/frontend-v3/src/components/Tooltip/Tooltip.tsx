import { useState, useRef } from 'react';
import type { TooltipProps } from '../../types';

export function Tooltip({ content, side = 'top', delay = 300, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = () => { timer.current = setTimeout(() => setVisible(true), delay); };
  const hide = () => { clearTimeout(timer.current); setVisible(false); };

  const posClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`absolute z-40 rounded-sm border border-border-strong bg-surface-raised px-2 py-1 text-xs text-ink-primary max-w-60 whitespace-nowrap ${posClasses[side]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
