import { Link } from 'react-router-dom';
import type { SidebarNavItemProps } from '../../types';

export function SidebarNavItem({ icon, label, href, active = false, badge, collapsed = false }: SidebarNavItemProps) {
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 h-9 rounded-sm px-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-surface-raised text-ink-primary border-l-2 border-l-accent'
          : 'text-ink-muted hover:bg-surface hover:text-ink-primary'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="shrink-0 w-4 h-4">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="text-xs bg-accent/15 text-accent px-1.5 rounded-full">{badge}</span>
          )}
        </>
      )}
    </Link>
  );
}
