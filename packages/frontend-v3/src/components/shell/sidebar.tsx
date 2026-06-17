"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SETTINGS_ITEM, SETTINGS_SUB_ITEMS, PROMPT_CREATOR_ITEM } from "./nav-items";
import { useSentinel } from "@/hooks/use-sentinel";

export function Sidebar() {
  const pathname = usePathname();
  const { data: sentinel } = useSentinel();

  const sentinelColor =
    sentinel?.overall === "healthy"
      ? "bg-gda-green"
      : sentinel?.overall === "degraded"
        ? "bg-gda-amber"
        : sentinel?.overall === "down"
          ? "bg-gda-red"
          : "bg-muted-foreground";

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

      <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded px-3 py-1.5 text-[13px] transition-colors",
                active
                  ? "border-l-2 border-gda-green bg-gda-panel text-gda-green"
                  : "text-muted-foreground hover:bg-gda-panel hover:text-foreground",
              )}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 px-2 pb-2">
        <Link
          href={SETTINGS_ITEM.href}
          className={cn(
            "flex items-center gap-2.5 rounded px-3 py-1.5 text-[13px] transition-colors",
            pathname.startsWith("/settings")
              ? "border-l-2 border-gda-green bg-gda-panel text-gda-green"
              : "text-muted-foreground hover:bg-gda-panel hover:text-foreground",
          )}
        >
          <SETTINGS_ITEM.icon size={15} />
          <span>{SETTINGS_ITEM.label}</span>
        </Link>

        {pathname.startsWith("/settings") && SETTINGS_SUB_ITEMS.map((sub) => {
          const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
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

        <Link
          href={PROMPT_CREATOR_ITEM.href}
          className={cn(
            "flex items-center gap-2.5 rounded px-3 py-1.5 text-[13px] transition-colors",
            pathname.startsWith("/prompt-creator")
              ? "border-l-2 border-gda-green bg-gda-panel text-gda-green"
              : "text-muted-foreground hover:bg-gda-panel hover:text-foreground",
          )}
        >
          <PROMPT_CREATOR_ITEM.icon size={15} />
          <span>{PROMPT_CREATOR_ITEM.label}</span>
        </Link>

        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", sentinelColor)} />
          <span>Sentinel {sentinel?.overall ?? "..."}</span>
        </div>
      </div>
    </aside>
  );
}
