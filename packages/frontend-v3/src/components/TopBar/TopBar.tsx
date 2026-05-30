import { type ReactNode } from "react";

export interface TopBarProps {
  logo?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ logo, breadcrumb, actions }: TopBarProps) {
  return (
    <header className="h-12 border-b border-border bg-surface flex items-center px-4 shrink-0">
      <div className="flex items-center gap-4">
        {logo || <span className="text-sm font-semibold text-ink-primary">GDA Command</span>}
        {breadcrumb}
      </div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  );
}
