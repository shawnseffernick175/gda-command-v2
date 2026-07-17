"use client";

import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import type { DailyNewsItem } from "@/hooks/use-launchpad";

const SOURCE_LABELS: Record<string, string> = {
  sam: "SAM.gov",
  usaspending: "USAspending",
  federal_register: "Federal Register",
  govwin: "GovWin",
  news: "News",
};

function formatDollar(cents: number | null): string | null {
  if (cents == null) return null;
  if (cents >= 1_000_000) return `$${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `$${(cents / 1_000).toFixed(0)}K`;
  return `$${cents.toFixed(0)}`;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  return `${diffD}d ago`;
}

interface LaunchpadNewsCardProps {
  item: DailyNewsItem;
  onFeedback?: (newsId: number, action: "clicked" | "dismissed" | "saved") => void;
}

export default function LaunchpadNewsCard({ item, onFeedback }: LaunchpadNewsCardProps) {
  const sourceLabel = SOURCE_LABELS[item.source] ?? item.source;
  const dollarStr = formatDollar(item.dollar_value);

  return (
    <div
      className={cn(
        "rounded border border-border bg-gda-panel p-3 space-y-1.5",
        "border-l-2 border-l-gda-cyan",
      )}
    >
      {/* Header row: agency chip + dollar value */}
      <div className="flex items-center gap-2 flex-wrap">
        {item.agency && (
          <span className="inline-flex items-center rounded bg-gda-cyan/10 border border-gda-cyan/20 px-1.5 py-0.5 font-mono text-[11px] text-gda-cyan uppercase tracking-wide">
            {item.agency}
          </span>
        )}
        {dollarStr && (
          <span className="font-mono text-[11px] font-bold text-foreground tabular-nums">
            {dollarStr}
          </span>
        )}
        {item.naics_code && (
          <span className="font-mono text-[11px] text-muted-foreground">
            NAICS {item.naics_code}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="font-mono text-xs font-semibold text-foreground leading-tight">
        {item.source_url ? (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gda-cyan hover:underline"
            onClick={() => onFeedback?.(item.id, "clicked")}
          >
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h4>

      {/* Why it matters */}
      {item.why_it_matters && (
        <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
          {item.why_it_matters}
        </p>
      )}

      {/* Footer: source + time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span>Source: {sourceLabel}</span>
          {item.source_id && <span className="truncate max-w-[120px]">{item.source_id}</span>}
          <span>{relativeTime(item.posted_at)}</span>
        </div>
        <div className="flex items-center gap-1">
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onFeedback?.(item.id, "clicked")}
            >
              <ExternalLink size={11} />
            </a>
          )}
          {onFeedback && (
            <button
              type="button"
              onClick={() => onFeedback(item.id, "dismissed")}
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground px-1"
              title="Dismiss"
            >
              x
            </button>
          )}
        </div>
      </div>

      {/* Doctrine excluded badge */}
      {item.doctrine_excluded && (
        <span className="inline-block font-mono text-[11px] italic text-muted-foreground">
          Doctrine excluded
        </span>
      )}
    </div>
  );
}
