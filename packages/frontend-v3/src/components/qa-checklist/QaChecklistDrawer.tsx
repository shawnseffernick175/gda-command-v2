"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useQaChecklist } from "./qa-checklist-context";
import { NAV_ITEMS } from "@/components/shell/nav-items";

const DRAWER_WIDTH = "w-[420px]";

function routeLabel(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) =>
      pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  return match?.label ?? pathname;
}

function PlaceholderRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2 rounded border border-border bg-gda-panel p-3">
          <div className="h-3 w-3/4 rounded bg-gda-panel-alt" />
          <div className="h-2 w-1/2 rounded bg-gda-panel-alt" />
        </div>
      ))}
    </div>
  );
}

export function QaChecklistDrawer() {
  const { isOpen, close, routeFilter, setRouteFilter } = useQaChecklist();
  const pathname = usePathname();

  if (!isOpen) return null;

  const currentLabel = routeLabel(pathname);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={close}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col",
          "border-l border-border bg-gda-bg-base shadow-xl",
          DRAWER_WIDTH,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-foreground">
            QA Checklist
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-gda-panel"
          >
            ×
          </button>
        </div>

        {/* Route filter */}
        <div className="flex gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setRouteFilter("all")}
            className={cn(
              "rounded border px-3 py-1 text-xs font-medium transition-colors",
              routeFilter === "all"
                ? "border-gda-green bg-gda-panel text-gda-green"
                : "border-border text-muted-foreground hover:bg-gda-panel hover:text-foreground",
            )}
          >
            All Pages
          </button>
          <button
            type="button"
            onClick={() => setRouteFilter("current")}
            className={cn(
              "rounded border px-3 py-1 text-xs font-medium transition-colors",
              routeFilter === "current"
                ? "border-gda-green bg-gda-panel text-gda-green"
                : "border-border text-muted-foreground hover:bg-gda-panel hover:text-foreground",
            )}
          >
            {currentLabel}
          </button>
        </div>

        {/* Body — placeholder loading state */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-xs text-muted-foreground">
            {routeFilter === "all"
              ? "Showing checks for all pages"
              : `Showing checks for ${currentLabel}`}
          </p>
          <PlaceholderRows />
        </div>
      </aside>
    </>
  );
}
