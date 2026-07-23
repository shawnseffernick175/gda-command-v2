"use client";

import { cn } from "@/lib/utils";
import type { FTSignalFeed } from "@/hooks/use-fastrac-bidirectional";

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-[12px] font-mono text-muted-foreground">
      {label}
    </span>
  );
}

function SignalStrength({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Signal strength: ${value}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-2 w-2 rounded-full border",
            i < value
              ? "bg-gda-green border-gda-green"
              : "bg-transparent border-border"
          )}
        />
      ))}
    </div>
  );
}

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-red-500/15 border-red-500/40 text-red-400",
  high: "bg-orange-500/15 border-orange-500/40 text-orange-400",
  medium: "bg-amber-400/15 border-amber-400/40 text-amber-400",
  low: "bg-muted/30 border-border text-muted-foreground",
};

export function SignalFeedCard({
  signal,
  actionLabel,
  actionLoading,
  onAction,
}: {
  signal: FTSignalFeed;
  actionLabel: string;
  actionLoading?: boolean;
  onAction: () => void;
}) {
  const matchCount = parseInt(signal.match_count, 10) || 0;

  return (
    <div className="rounded border border-border bg-gda-panel p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-mono text-gda-cyan whitespace-nowrap">
              {signal.source}
            </span>
            {signal.urgency && (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[12px] font-mono uppercase",
                  URGENCY_STYLES[signal.urgency] ?? URGENCY_STYLES.low
                )}
              >
                {signal.urgency}
              </span>
            )}
            {matchCount > 0 && (
              <span className="rounded border border-gda-green/30 bg-gda-green/10 px-1.5 py-0.5 text-[12px] font-mono text-gda-green">
                {matchCount} match{matchCount !== 1 ? "es" : ""}
              </span>
            )}
          </div>

          {signal.source_url ? (
            <a
              href={signal.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-gda-cyan hover:underline leading-snug"
            >
              {signal.title}
            </a>
          ) : (
            <p className="text-xs font-semibold text-foreground leading-snug">
              {signal.title}
            </p>
          )}

          {signal.summary && (
            <p className="text-[12px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">
              {signal.summary}
            </p>
          )}

          <div className="flex flex-wrap gap-1 mt-2">
            {signal.mission_tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <SignalStrength value={signal.signal_strength} />
          <span className="text-[12px] text-muted-foreground font-mono">
            {signal.horizon}
          </span>
          <button
            onClick={onAction}
            disabled={actionLoading}
            className="rounded border border-gda-cyan bg-gda-cyan/10 px-3 py-1 text-[12px] font-mono font-medium text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {actionLoading ? "Searching…" : actionLabel}
          </button>
        </div>
      </div>

      {signal.institution_name && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{signal.institution_name}</span>
          {signal.published_at && (
            <span>· {new Date(signal.published_at).toLocaleDateString()}</span>
          )}
        </div>
      )}
    </div>
  );
}
