"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useQaChecklist as useQaChecklistContext } from "./qa-checklist-context";
import { useQaChecklist as useQaChecklistQuery, type QaChecklistItem } from "@/hooks/use-qa-checklist";
import { NAV_ITEMS } from "@/components/shell/nav-items";

const DRAWER_WIDTH = "w-[420px]";

const SEVERITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

const SEVERITY_COLORS: Record<string, string> = {
  P0: "bg-red-600 text-white",
  P1: "bg-red-500 text-white",
  P2: "bg-blue-600 text-white",
  P3: "bg-black text-white",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-white text-black border border-border",
  "in-dev": "bg-blue-600 text-white",
  "pr-open": "bg-pink-600 text-white",
  "deployed-needs-verify": "bg-red-500 text-white",
  "verified-live": "bg-green-600 text-white",
  blocked: "bg-black text-white",
};

const CATEGORY_COLORS: Record<string, string> = {
  UX: "border-pink-500 text-pink-500",
  data: "border-blue-600 text-blue-600",
  linkage: "border-green-600 text-green-600",
  analysis: "border-red-500 text-red-500",
  layout: "border-black text-black",
  calc: "border-blue-600 text-blue-600",
  workflow: "border-green-600 text-green-600",
};

function routeLabel(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) =>
      pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  return match?.label ?? pathname;
}

function sortItems(items: QaChecklistItem[]): QaChecklistItem[] {
  return [...items].sort((a, b) => {
    const aHighSev = (SEVERITY_ORDER[a.severity] ?? 9) <= 1;
    const bHighSev = (SEVERITY_ORDER[b.severity] ?? 9) <= 1;
    const aVerified = a.status === "verified-live";
    const bVerified = b.status === "verified-live";

    const aPriority = aHighSev && !aVerified;
    const bPriority = bHighSev && !bVerified;

    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;

    if (aVerified && !bVerified) return 1;
    if (!aVerified && bVerified) return -1;

    const sevA = SEVERITY_ORDER[a.severity] ?? 9;
    const sevB = SEVERITY_ORDER[b.severity] ?? 9;
    if (sevA !== sevB) return sevA - sevB;

    return a.id - b.id;
  });
}

function filterByRoute(items: QaChecklistItem[], pathname: string): QaChecklistItem[] {
  const label = routeLabel(pathname);
  return items.filter(
    (item) =>
      item.page_area.toLowerCase() === label.toLowerCase() ||
      item.page_area.toLowerCase().includes(label.toLowerCase()),
  );
}

function SkeletonRows() {
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

function ChecklistRow({ item }: { item: QaChecklistItem }) {
  const [expanded, setExpanded] = useState(false);

  const severityClass = SEVERITY_COLORS[item.severity] ?? "bg-black text-white";
  const statusClass = STATUS_COLORS[item.status] ?? "bg-white text-black border border-border";
  const categoryClass = CATEGORY_COLORS[item.category] ?? "border-black text-black";

  const lastUpdated = new Date(item.last_updated).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded border border-border bg-gda-panel p-3 space-y-2">
      {/* Top row: severity + page area + verified checkbox */}
      <div className="flex items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", severityClass)}>
          {item.severity}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground truncate">
          {item.page_area}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <input
            type="checkbox"
            checked={item.verified_live}
            readOnly
            disabled
            className="h-3 w-3 accent-green-600"
          />
        </span>
      </div>

      {/* Problem summary */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <p
          className={cn(
            "text-xs text-foreground",
            !expanded && "line-clamp-2",
          )}
        >
          {item.problem_summary}
        </p>
      </button>

      {/* Category + status + timestamp */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[11px] font-medium",
            categoryClass,
          )}
        >
          {item.category}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-medium",
            statusClass,
          )}
        >
          {item.status.replace(/-/g, " ")}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {lastUpdated}
        </span>
      </div>

      {/* Links + evidence */}
      {(item.github_issue || item.github_pr || item.evidence_note) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {item.github_issue && (
            <a
              href={`https://github.com/shawnseffernick175/gda-command-v2/issues/${item.github_issue.replace("#", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gda-cyan hover:underline"
            >
              {item.github_issue}
            </a>
          )}
          {item.github_pr && (
            <a
              href={`https://github.com/shawnseffernick175/gda-command-v2/pull/${item.github_pr.replace("#", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gda-cyan hover:underline"
            >
              PR {item.github_pr}
            </a>
          )}
          {item.evidence_note && (
            <span className="text-muted-foreground italic truncate max-w-[200px]">
              {item.evidence_note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function QaChecklistDrawer() {
  const { isOpen, close, routeFilter, setRouteFilter } = useQaChecklistContext();
  const pathname = usePathname();
  const { data: items, isLoading, isError } = useQaChecklistQuery();

  if (!isOpen) return null;

  const currentLabel = routeLabel(pathname);

  const filtered =
    routeFilter === "current" && items
      ? filterByRoute(items, pathname)
      : items ?? [];

  const sorted = sortItems(filtered);

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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-xs text-muted-foreground">
            {routeFilter === "all"
              ? "Showing checks for all pages"
              : `Showing checks for ${currentLabel}`}
            {sorted.length > 0 && ` (${sorted.length})`}
          </p>

          {isLoading && <SkeletonRows />}

          {isError && (
            <p className="text-xs text-red-500">
              Failed to load checklist items.
            </p>
          )}

          {!isLoading && !isError && sorted.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No checklist items found.
            </p>
          )}

          {!isLoading && !isError && sorted.length > 0 && (
            <div className="space-y-3">
              {sorted.map((item) => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
