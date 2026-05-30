import type { TabsProps } from '../../types';

export function Tabs({ items, activeId, onChange }: TabsProps) {
  return (
    <div className="flex gap-4 border-b border-border" role="tablist">
      {items.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={`pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab.id === activeId
              ? 'border-accent text-ink-primary'
              : 'border-transparent text-ink-muted hover:text-ink-primary'
          } ${tab.disabled ? 'opacity-40 pointer-events-none' : ''}`}
          onClick={() => onChange(tab.id)}
          disabled={tab.disabled}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
