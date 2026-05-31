import { useLocation } from 'react-router-dom';
import { SidebarNavItem } from '../SidebarNavItem/SidebarNavItem';
import type { ReactNode } from 'react';

interface NavEntry {
  label: string;
  href: string;
  icon: ReactNode;
}

const svgProps = { xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Launchpad',
    href: '/launchpad',
    icon: <svg {...svgProps}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
  },
  {
    label: 'Fast Track',
    href: '/fast-track',
    icon: <svg {...svgProps}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  },
  {
    label: 'Opportunities',
    href: '/opportunities',
    icon: <svg {...svgProps}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 7V5a4 4 0 0 0-8 0v2" /></svg>,
  },
  {
    label: 'Capture',
    href: '/capture',
    icon: <svg {...svgProps}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  },
  {
    label: 'Pipeline',
    href: '/pipeline',
    icon: <svg {...svgProps}><path d="M22 3 2 12l10 3 3 10 7-22z" /></svg>,
  },
  {
    label: 'Action Items',
    href: '/action-items',
    icon: <svg {...svgProps}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  },
];

interface NavItemsProps {
  collapsed: boolean;
}

export function NavItems({ collapsed }: NavItemsProps) {
  const location = useLocation();

  return (
    <>
      {NAV_ITEMS.map((item) => (
        <SidebarNavItem
          key={item.href}
          icon={item.icon}
          label={item.label}
          href={item.href}
          active={location.pathname === item.href || location.pathname.startsWith(item.href + '/')}
          collapsed={collapsed}
        />
      ))}
    </>
  );
}
