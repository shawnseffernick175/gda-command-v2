"use client";

import { useDigestNews } from "@/hooks/use-digest-news";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function formatNewsDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
}

export default function GovConNews() {
  const { data: items, isLoading, error } = useDigestNews(12);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 bg-gda-panel-alt" />
        <Skeleton className="h-12 bg-gda-panel-alt" />
        <Skeleton className="h-12 bg-gda-panel-alt" />
      </div>
    );
  }

  if (error || !items || items.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No GovCon news available. Check back after the daily refresh.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] font-semibold text-foreground hover:text-gda-cyan hover:underline leading-tight block"
            >
              {item.title}
            </a>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
              {item.blurb}
            </p>
            <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <span>{item.source_name}</span>
              <span>{formatNewsDate(item.published_at)}</span>
              {!item.is_wheelhouse && (
                <span className="italic">general</span>
              )}
            </div>
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      ))}
    </div>
  );
}
