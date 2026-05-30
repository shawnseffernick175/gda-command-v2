import { useState, useCallback } from 'react';
import type { ListProps } from '../../types';

export function List<T>({ items, activeId, onActivate, renderItem, itemKey, emptyState }: ListProps<T>) {
  const [focusIdx, setFocusIdx] = useState(0);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, items.length - 1));
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && items[focusIdx] && onActivate) {
        onActivate(items[focusIdx]);
      }
    },
    [items, focusIdx, onActivate]
  );

  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div role="listbox" tabIndex={0} onKeyDown={onKeyDown} className="outline-none">
      {items.map((item, i) => {
        const id = itemKey(item);
        const isActive = id === activeId || i === focusIdx;
        return (
          <div
            key={id}
            role="option"
            aria-selected={id === activeId}
            className={`flex items-center min-h-9 px-2 cursor-pointer border-b border-border ${isActive ? 'bg-surface-raised border-l-2 border-l-accent' : 'hover:bg-surface'}`}
            onClick={() => onActivate?.(item)}
          >
            {renderItem(item, isActive)}
          </div>
        );
      })}
    </div>
  );
}
