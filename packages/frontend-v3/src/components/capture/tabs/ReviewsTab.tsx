"use client";

import { useState } from "react";
import { useScheduleReview, useDownloadOutbrief } from "@/hooks/use-capture-reviews";
import type { ColorReview, ReviewColor } from "@/lib/types";

// Status-strip order (left-to-right) kept as-is for visual continuity.
const ALL_COLORS: ReviewColor[] = ["pink", "red", "black", "blue", "white", "green"];

// Canonical doctrine order (black → blue → pink → green → red → white).
// Used in the Schedule picker so "review everything up to this color"
// (cumulative) reads in the order reviews actually happen.
const DOCTRINE_ORDER: ReviewColor[] = ["black", "blue", "pink", "green", "red", "white"];

const COLOR_LABELS: Record<ReviewColor, string> = {
  pink: "Pink Team",
  red: "Red Team",
  black: "Black Hat",
  blue: "Blue Team",
  white: "White Team",
  green: "Green (Pricing)",
};

// Prior colors in doctrine order, used to explain what a cumulative
// back-review will additionally cover.
function priorColors(color: ReviewColor): ReviewColor[] {
  const idx = DOCTRINE_ORDER.indexOf(color);
  return idx > 0 ? DOCTRINE_ORDER.slice(0, idx) : [];
}

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
              <p className="mt-1 text-[12px] text-muted-foreground uppercase">{color}</p>
              <p className="text-[12px] text-muted-foreground">
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

const DOT_COMPLETE_CLS: Record<ReviewColor, string> = {
  pink: "bg-pink-500 border-pink-500",
  red: "bg-red-500 border-red-500",
  black: "bg-gray-700 border-gray-700",
  blue: "bg-blue-500 border-blue-500",
  white: "bg-gray-400 border-gray-400",
  green: "bg-green-500 border-green-500",
};

const DOT_SCHEDULED_CLS: Record<ReviewColor, string> = {
  pink: "border-pink-500 bg-transparent",
  red: "border-red-500 bg-transparent",
  black: "border-gray-700 bg-transparent",
  blue: "border-blue-500 bg-transparent",
  white: "border-gray-400 bg-transparent",
  green: "border-green-500 bg-transparent",
};

function ReviewDot({ color, status }: { color: ReviewColor; status: string }) {
  let cls: string;
  if (status === "complete") {
    cls = DOT_COMPLETE_CLS[color];
  } else if (status === "none") {
    cls = "border-gray-500 bg-transparent opacity-40";
  } else {
    cls = DOT_SCHEDULED_CLS[color];
  }

  return (
    <div className={`mx-auto h-4 w-4 rounded-full border-2 ${cls}`} />
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
          <span className="text-[12px] text-muted-foreground">
            {review.status === "complete"
              ? `COMPLETE ${review.completed_date ?? ""}`
              : review.scheduled_date
              ? `scheduled ${review.scheduled_date}`
              : "no date"}
          </span>
        </div>
        {review.status === "complete" && review.overall_color_rating && (
          <span className="rounded bg-gda-green/10 px-2 py-0.5 text-[12px] font-medium text-gda-green">
            Overall: {review.overall_color_rating}
          </span>
        )}
      </div>

      {reviewerNames && (
        <p className="text-[12px] text-muted-foreground">Reviewers: {reviewerNames}</p>
      )}

      {totalSections > 0 && review.status !== "complete" && (
        <p className="text-[12px] text-muted-foreground">
          Status: {scoredSections} of {totalSections} sections scored
        </p>
      )}

      {review.status === "complete" && review.pwin_impact != null && (
        <p className="text-[12px] text-muted-foreground">
          Pwin impact: {review.pwin_impact > 0 ? "+" : ""}{Math.round(review.pwin_impact * 100)}%
        </p>
      )}

      <div className="flex gap-2">
        {review.status !== "complete" && review.status !== "cancelled" && (
          <button
            type="button"
            onClick={onResume}
            className="rounded border border-gda-green/30 bg-gda-green/10 px-2 py-0.5 text-[12px] font-medium text-gda-green hover:bg-gda-green/20"
          >
            Resume
          </button>
        )}
        {review.status === "complete" && (
          <OutbriefDownload reviewId={review.id} />
        )}
      </div>
    </div>
  );
}

function OutbriefDownload({ reviewId }: { reviewId: number }) {
  const download = useDownloadOutbrief(reviewId);
  const pending = download.isPending;
  const pendingFormat = (download.variables as "docx" | "pdf" | undefined) ?? null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-muted-foreground">Outbrief:</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => download.mutate("docx")}
        className="rounded border border-border px-2 py-0.5 text-[12px] font-medium text-muted-foreground hover:bg-gda-panel disabled:opacity-50"
        title="Download the outbrief as a Word document"
      >
        {pending && pendingFormat === "docx" ? "Preparing…" : "Word"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => download.mutate("pdf")}
        className="rounded border border-border px-2 py-0.5 text-[12px] font-medium text-muted-foreground hover:bg-gda-panel disabled:opacity-50"
        title="Download the outbrief as a PDF"
      >
        {pending && pendingFormat === "pdf" ? "Preparing…" : "PDF"}
      </button>
      {download.isError && (
        <span className="text-[12px] text-gda-red">
          {(download.error as Error).message}
        </span>
      )}
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
  const [cumulative, setCumulative] = useState(false);
  const reviewerRole = "lead";

  const schedule = useScheduleReview(captureId);

  const earlier = priorColors(color);
  const canBeCumulative = earlier.length > 0;
  const earlierLabels = earlier.map((c) => COLOR_LABELS[c]).join(", ");

  function handleSchedule() {
    schedule.mutate(
      {
        color,
        scheduled_date: scheduledDate || undefined,
        reviewers: reviewerName
          ? [{ name: reviewerName, role: reviewerRole }]
          : undefined,
        cumulative: canBeCumulative ? cumulative : undefined,
      },
      { onSuccess: () => onClose() }
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded border border-border bg-gda-bg-base p-6 shadow-xl space-y-4">
        <h3 className="font-mono text-sm font-bold text-foreground">Schedule New Review</h3>

        <div>
          <span className="text-[12px] text-muted-foreground">Color</span>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as ReviewColor)}
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground"
          >
            {DOCTRINE_ORDER.map((c) => (
              <option key={c} value={c}>{COLOR_LABELS[c]}</option>
            ))}
          </select>
        </div>

        {/* Cumulative back-review */}
        <div className="rounded border border-border bg-gda-panel/50 p-2.5">
          <label className={`flex items-start gap-2 ${canBeCumulative ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
            <input
              type="checkbox"
              checked={canBeCumulative && cumulative}
              disabled={!canBeCumulative}
              onChange={(e) => setCumulative(e.target.checked)}
              className="mt-0.5 accent-gda-green"
            />
            <span className="text-xs text-foreground">
              Also back-review earlier stages
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                {canBeCumulative
                  ? `Adds a labeled section to confirm ${earlierLabels} ${earlier.length === 1 ? "was" : "were"} done right before this ${COLOR_LABELS[color]} review. Use when you're starting mid-stream and want to catch anything missed earlier.`
                  : "Black Hat is the first stage, so there is nothing earlier to back-review."}
              </span>
            </span>
          </label>
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground">Due Date</span>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground"
          />
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground">Lead Reviewer</span>
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
