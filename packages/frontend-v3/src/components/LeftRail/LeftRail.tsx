import { type ReactNode } from "react";

export interface NavItem {
  icon: ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
}

export interface LeftRailProps {
  items: NavItem[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export function LeftRail({ items, collapsed = false }: LeftRailProps) {
  return (
    <nav
      className={[
        "h-full border-r border-border bg-surface flex flex-col py-2 shrink-0",
        "transition-[width] duration-[var(--duration-reveal)]",
        collapsed ? "w-[52px]" : "w-60",
      ].join(" ")}
      role="navigation"
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={[
            "flex items-center gap-3 h-9 mx-2 px-3 rounded-sm text-sm font-medium",
            "transition-colors duration-[var(--duration-state)]",
            item.active
              ? "bg-surface-raised text-ink-primary border-l-2 border-l-accent"
              : "text-ink-muted hover:bg-surface hover:text-ink-primary",
          ].join(" ")}
        >
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            {item.icon}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-xs text-ink-muted">{item.badge}</span>
              )}
            </>
          )}
        </a>
      ))}
    </nav>
  );
}
