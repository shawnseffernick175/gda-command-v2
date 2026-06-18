"use client";

import type { ColorReview, ReviewColor } from "@/lib/types";

const ALL_COLORS: ReviewColor[] = ["pink", "red", "black", "blue", "white", "green"];

const COLOR_MAP: Record<ReviewColor, string> = {
  pink: "#ec4899",
  red: "#ef4444",
  black: "#374151",
  blue: "#3b82f6",
  white: "#9ca3af",
  green: "#22c55e",
};

const COLOR_LABELS: Record<ReviewColor, string> = {
  pink: "Pink Team",
  red: "Red Team",
  black: "Black Hat",
  blue: "Blue Team",
  white: "White Team",
  green: "Green (Pricing)",
};

interface ReviewColorDotsProps {
  reviews: ColorReview[];
  onDotClick?: (color: ReviewColor) => void;
}

export function ReviewColorDots({ reviews, onDotClick }: ReviewColorDotsProps) {
  const reviewsByColor = new Map<ReviewColor, ColorReview>();
  for (const r of reviews) {
    reviewsByColor.set(r.color, r);
  }

  return (
    <div className="flex items-center gap-1">
      {ALL_COLORS.map((color) => {
        const review = reviewsByColor.get(color);
        const status = review?.status;

        let dotClass = "w-2.5 h-2.5 rounded-full border cursor-pointer";
        let style: React.CSSProperties = {};

        if (status === "complete") {
          style = { backgroundColor: COLOR_MAP[color], borderColor: COLOR_MAP[color] };
        } else if (status === "scheduled" || status === "in_progress") {
          style = { borderColor: COLOR_MAP[color], borderWidth: "2px", backgroundColor: "transparent" };
        } else {
          style = { borderColor: "#4b5563", backgroundColor: "transparent" };
          dotClass += " opacity-40";
        }

        return (
          <button
            key={color}
            type="button"
            title={`${COLOR_LABELS[color]}${status ? ` — ${status}` : " — not scheduled"}`}
            className={dotClass}
            style={style}
            onClick={() => onDotClick?.(color)}
          />
        );
      })}
    </div>
  );
}
