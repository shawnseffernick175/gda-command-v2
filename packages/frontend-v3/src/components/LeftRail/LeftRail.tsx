import type { LeftRailProps } from '../../types';

export function LeftRail({ collapsed = false, onToggle, children }: LeftRailProps) {
  return (
    <nav
      className={`flex flex-col border-r border-border bg-surface shrink-0 transition-[width] duration-[var(--duration-reveal)] ${collapsed ? 'w-[52px]' : 'w-60'}`}
      role="navigation"
    >
      <div className="flex items-center justify-end px-2 py-2">
        {onToggle && (
          <button type="button" className="text-ink-muted hover:text-ink-primary text-sm" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '▶' : '◀'}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 flex flex-col gap-0.5">{children}</div>
    </nav>
  );
}
