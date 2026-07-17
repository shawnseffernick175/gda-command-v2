"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PINNED_ITEMS,
  NAV_GROUPS,
  SETTINGS_SUB_ITEMS,
  type NavItem,
} from "./nav-items";
import { useSentinel } from "@/hooks/use-sentinel";
import { useRegulatoryCount } from "@/hooks/use-regulatory";

const GROUPS_STORAGE_KEY = "gda-nav-groups-open";

function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function readStoredGroups(): Record<string, boolean> {
  const defaults = Object.fromEntries(NAV_GROUPS.map((g) => [g.label, true]));
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY);
    if (raw) {
      return { ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) };
    }
  } catch {
    /* ignore malformed storage */
  }
  return defaults;
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: sentinel } = useSentinel();
  const { data: regCount } = useRegulatoryCount();

  const [openGroups, setOpenGroups] =
    useState<Record<string, boolean>>(readStoredGroups);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const sentinelColor =
    sentinel?.overall === "healthy"
      ? "bg-gda-green"
      : sentinel?.overall === "degraded"
        ? "bg-gda-amber"
        : sentinel?.overall === "down"
          ? "bg-gda-red"
          : "bg-muted-foreground";

  const renderNavLink = (item: NavItem) => {
    const active = isRouteActive(pathname, item.href);
    const Icon = item.icon;
    const isSettings = item.href === "/settings";
    return (
      <div key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-2.5 rounded px-3 py-1.5 text-[13px] transition-colors",
            active
              ? "border-l-2 border-gda-green bg-gda-panel text-gda-green"
              : "text-muted-foreground hover:bg-gda-panel hover:text-foreground",
          )}
        >
          <Icon size={15} />
          <span className="flex-1">{item.label}</span>
          {item.href === "/regulatory" && regCount?.count != null && (
            <span className="ml-auto rounded-full bg-gda-panel px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
              {regCount.count}
            </span>
          )}
        </Link>

        {isSettings &&
          pathname.startsWith("/settings") &&
          SETTINGS_SUB_ITEMS.map((sub) => {
            const subActive = isRouteActive(pathname, sub.href);
            const SubIcon = sub.icon;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={cn(
                  "flex items-center gap-2 rounded px-3 py-1 pl-8 text-[12px] transition-colors",
                  subActive
                    ? "text-gda-green"
                    : "text-muted-foreground hover:bg-gda-panel hover:text-foreground",
                )}
              >
                <SubIcon size={13} />
                <span>{sub.label}</span>
              </Link>
            );
          })}
      </div>
    );
  };

  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r border-border bg-gda-bg-base">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="font-mono text-base font-bold text-gda-green">
          GDA
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          Command
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto pb-2">
        {PINNED_ITEMS.map((item) => renderNavLink(item))}

        <div className="my-2 border-t border-border" />

        {NAV_GROUPS.map((group) => {
          const containsActive = group.items.some((item) =>
            isRouteActive(pathname, item.href),
          );
          const open = containsActive || (openGroups[group.label] ?? true);
          return (
            <div key={group.label} className="pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={open}
                className="flex w-full items-center gap-1.5 rounded px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                {open ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
                <span className="flex-1 text-left">{group.label}</span>
              </button>
              {open && (
                <div className="space-y-0.5">
                  {group.items.map((item) => renderNavLink(item))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", sentinelColor)} />
          <span>Sentinel {sentinel?.overall ?? "..."}</span>
        </div>
      </div>
    </aside>
  );
}
