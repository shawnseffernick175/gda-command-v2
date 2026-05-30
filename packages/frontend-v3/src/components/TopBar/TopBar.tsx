import type { TopBarProps } from '../../types';

export function TopBar({ children }: TopBarProps) {
  return (
    <header className="h-12 flex items-center px-4 border-b border-border bg-surface shrink-0">
      <span className="text-sm font-semibold text-ink-primary">GDA Command</span>
      <div className="flex-1" />
      {children}
    </header>
  );
}
