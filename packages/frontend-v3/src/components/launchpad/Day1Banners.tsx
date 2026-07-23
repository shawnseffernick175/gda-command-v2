"use client";

import { useDay1Banners, useDismissBanner } from "@/hooks/use-launchpad";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function formatDollar(cents: number | null): string | null {
  if (cents == null) return null;
  if (cents >= 1_000_000) return `$${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `$${(cents / 1_000).toFixed(0)}K`;
  return `$${cents.toFixed(0)}`;
}

export default function Day1Banners() {
  const { data, isLoading } = useDay1Banners();
  const dismissMutation = useDismissBanner();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 bg-gda-panel" />
      </div>
    );
  }

  const banners = data?.banners ?? [];
  if (banners.length === 0) return null;

  return (
    <div className="space-y-2">
      {banners.map((banner) => {
        const dollarStr = formatDollar(banner.dollar_value);
        return (
          <div
            key={banner.id}
            className={cn(
              "rounded border border-border bg-gda-panel p-3",
              "border-l-4 border-l-gda-amber",
              "flex items-start justify-between gap-3",
            )}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded bg-gda-amber/10 border border-gda-amber/20 px-1.5 py-0.5 font-mono text-[12px] text-gda-amber uppercase tracking-wide">
                  Day-1
                </span>
                {banner.agency && (
                  <span className="font-mono text-[12px] text-muted-foreground uppercase">
                    {banner.agency}
                  </span>
                )}
                {dollarStr && (
                  <span className="font-mono text-[12px] font-bold text-foreground tabular-nums">
                    {dollarStr}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-foreground leading-tight">
                {banner.source_url ? (
                  <a
                    href={banner.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gda-cyan hover:underline"
                  >
                    {banner.title}
                  </a>
                ) : (
                  banner.title
                )}
              </p>
              {banner.why_it_matters && (
                <p className="font-mono text-[12px] text-muted-foreground">
                  {banner.why_it_matters}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissMutation.mutate(banner.id)}
              disabled={dismissMutation.isPending}
              className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground"
              title="Dismiss"
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}
