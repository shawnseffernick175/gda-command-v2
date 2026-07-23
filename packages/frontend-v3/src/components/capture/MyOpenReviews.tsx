"use client";

import { useMyOpenReviews } from "@/hooks/use-capture-reviews";
import type { ReviewColor } from "@/lib/types";

const COLOR_LABELS: Record<ReviewColor, string> = {
  pink: "Pink",
  red: "Red",
  black: "Black Hat",
  blue: "Blue",
  white: "White",
  green: "Green",
};

interface MyOpenReviewsProps {
  onResumeReview?: (reviewId: number) => void;
}

export function MyOpenReviews({ onResumeReview }: MyOpenReviewsProps) {
  const { data, isLoading } = useMyOpenReviews();

  if (isLoading) {
    return (
      <div className="rounded border border-border bg-gda-bg-base p-4">
        <div className="h-6 w-48 animate-pulse rounded bg-gda-skeleton" />
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) return null;

  return (
    <div className="rounded border border-border bg-gda-bg-base p-4 space-y-3">
      <h3 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">
        My Open Reviews
      </h3>
      <div className="space-y-2">
        {items.map((item) => {
          const pct = item.total_sections > 0
            ? Math.round((item.scored_sections / item.total_sections) * 100)
            : 0;

          return (
            <div
              key={item.review_id}
              className="flex items-center justify-between rounded border border-border bg-gda-panel px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-foreground">
                  {item.capture_name ?? "Untitled Capture"}
                </span>
                <span className="rounded bg-gda-bg-deep px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground uppercase">
                  {COLOR_LABELS[item.color]}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {item.scheduled_date && (
                  <span className="text-[12px] text-muted-foreground">
                    Due {item.scheduled_date}
                  </span>
                )}
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {pct}% scored
                </span>
                <button
                  type="button"
                  onClick={() => onResumeReview?.(item.review_id)}
                  className="rounded border border-gda-green/30 bg-gda-green/10 px-2 py-0.5 text-[12px] font-medium text-gda-green hover:bg-gda-green/20"
                >
                  Resume
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
