import { useState, useRef, useEffect, type ReactElement, cloneElement } from 'react';
import type { PopoverProps } from '../../types';

export function Popover({ content, side = 'bottom', children, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, setOpen]);

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div ref={ref} className="relative inline-flex">
      {cloneElement(children as ReactElement<{ onClick?: () => void }>, { onClick: () => setOpen(!isOpen) })}
      {isOpen && (
        <div className={`absolute z-30 rounded-md border border-border bg-surface-raised p-4 ${positionClasses[side]}`}>
          {content}
        </div>
      )}
    </div>
  );
}
