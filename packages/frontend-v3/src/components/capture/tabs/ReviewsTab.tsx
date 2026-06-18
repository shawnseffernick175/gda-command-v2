"use client";

import { useState } from "react";
import { useScheduleReview } from "@/hooks/use-capture-reviews";
import type { ColorReview, ReviewColor } from "@/lib/types";

const ALL_COLORS: ReviewColor[] = ["pink", "red", "black", "blue", "white", "green"];

const COLOR_LABELS: Record<ReviewColor, string> = {
  pink: "Pink Team",
  red: "Red Team",
  black: "Black Hat",
  blue: "Blue Team",
  white: "White Team",
  green: "Green (Pricing)",
};

interface ReviewsTabProps {
  captureId: number | string;
  reviews: ColorReview[];
  onOpenScoringWorkspace?: (reviewId: number) => void;
}

export function ReviewsTab({ captureId, reviews, onOpenScoringWorkspace }: ReviewsTabProps) {
  const [showSchedule, setShowSchedule] = useState(false);

  const reviewsByColor = new Map<ReviewColor, ColorReview>();
  for (const r of reviews) {
    reviewsByColor.set(r.color, r);
  }

  return (
    <div className="space-y-4">
      {/* Status strip */}
      <div className="flex items-center gap-4">
        {ALL_COLORS.map((color) => {
          const review = reviewsByColor.get(color);
          const status = review?.status ?? "none";
          return (
            <div key={color} className="text-center">
              <ReviewDot color={color} status={status} />
              <p className="mt-1 text-[11px] text-muted-foreground uppercase">{color}</p>
              <p className="text-[11px] text-muted-foreground">
                {status === "none" ? "Not yet" : status === "complete" ? "Done" : "Sched"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Schedule button */}
      <button
        type="button"
        onClick={() => setShowSchedule(true)}
        className="rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs font-medium text-gda-green hover:bg-gda-green/20"
      >
        + Schedule New Review
      </button>

      {/* Review list */}
      <div className="space-y-3">
        {reviews.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No reviews scheduled. Click + Schedule New Review to start your Pink, Red, Black Hat, Blue, White, or Green review.
          </p>
        ) : (
          reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onResume={() => onOpenScoringWorkspace?.(review.id)}
            />
          ))
        )}
      </div>

      {/* Schedule modal */}
      {showSchedule && (
        <ScheduleReviewModal
          captureId={captureId}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
}

function ReviewDot({ color, status }: { color: ReviewColor; status: string }) {
  const colorMap: Record<ReviewColor, string> = {
    pink: "#ec4899",
    red: "#ef4444",
    black: "#374151",
    blue: "#3b82f6",
    white: "#9ca3af",
    green: "#22c55e",
  };

  const fill = status === "complete" ? colorMap[color] : "transparent";
  const border = status === "none" ? "#4b5563" : colorMap[color];

  return (
    <div
      className="mx-auto h-4 w-4 rounded-full"
      style={{
        backgroundColor: fill,
        border: `2px solid ${border}`,
        opacity: status === "none" ? 0.4 : 1,
      }}
    />
  );
}

function ReviewCard({ review, onResume }: { review: ColorReview; onResume: () => void }) {
  const totalSections = review.total_sections ?? 0;
  const scoredSections = review.scored_sections ?? 0;
  const reviewerNames = review.reviewers
    ?.map((r) => r.reviewer_name ?? r.name ?? "")
    .filter(Boolean)
    .join(", ") ?? "";

  return (
    <div className="rounded border border-border bg-gda-panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {COLOR_LABELS[review.color]}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {review.status === "complete"
              ? `COMPLETE ${review.completed_date ?? ""}`
              : review.scheduled_date
              ? `scheduled ${review.scheduled_date}`
              : "no date"}
          </span>
        </div>
        {review.status === "complete" && review.overall_color_rating && (
          <span className="rounded bg-gda-green/10 px-2 py-0.5 text-[11px] font-medium text-gda-green">
            Overall: {review.overall_color_rating}
          </span>
        )}
      </div>

      {reviewerNames && (
        <p className="text-[11px] text-muted-foreground">Reviewers: {reviewerNames}</p>
      )}

      {totalSections > 0 && review.status !== "complete" && (
        <p className="text-[11px] text-muted-foreground">
          Status: {scoredSections} of {totalSections} sections scored
        </p>
      )}

      {review.status === "complete" && review.pwin_impact != null && (
        <p className="text-[11px] text-muted-foreground">
          Pwin impact: {review.pwin_impact > 0 ? "+" : ""}{Math.round(review.pwin_impact * 100)}%
        </p>
      )}

      <div className="flex gap-2">
        {review.status !== "complete" && review.status !== "cancelled" && (
          <button
            type="button"
            onClick={onResume}
            className="rounded border border-gda-green/30 bg-gda-green/10 px-2 py-0.5 text-[11px] font-medium text-gda-green hover:bg-gda-green/20"
          >
            Resume
          </button>
        )}
        {review.status === "complete" && (
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-gda-panel"
          >
            View Report
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleReviewModal({
  captureId,
  onClose,
}: {
  captureId: number | string;
  onClose: () => void;
}) {
  const [color, setColor] = useState<ReviewColor>("pink");
  const [scheduledDate, setScheduledDate] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const reviewerRole = "lead";

  const schedule = useScheduleReview(captureId);

  function handleSchedule() {
    schedule.mutate(
      {
        color,
        scheduled_date: scheduledDate || undefined,
        reviewers: reviewerName
          ? [{ name: reviewerName, role: reviewerRole }]
          : undefined,
      },
      { onSuccess: () => onClose() }
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded border border-border bg-gda-bg-base p-6 shadow-xl space-y-4">
        <h3 className="font-mono text-sm font-bold text-foreground">Schedule New Review</h3>

        <div>
          <span className="text-[11px] text-muted-foreground">Color</span>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as ReviewColor)}
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground"
          >
            {ALL_COLORS.map((c) => (
              <option key={c} value={c}>{COLOR_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <span className="text-[11px] text-muted-foreground">Due Date</span>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground"
          />
        </div>

        <div>
          <span className="text-[11px] text-muted-foreground">Lead Reviewer</span>
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Reviewer name"
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSchedule}
            disabled={schedule.isPending}
            className="rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
          >
            {schedule.isPending ? "Scheduling…" : "Schedule"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-gda-panel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
