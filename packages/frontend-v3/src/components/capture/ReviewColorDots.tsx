"use client";

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

const DOT_COMPLETE: Record<ReviewColor, string> = {
  pink: "bg-pink-500 border-pink-500",
  red: "bg-red-500 border-red-500",
  black: "bg-gray-700 border-gray-700",
  blue: "bg-blue-500 border-blue-500",
  white: "bg-gray-400 border-gray-400",
  green: "bg-green-500 border-green-500",
};

const DOT_SCHEDULED: Record<ReviewColor, string> = {
  pink: "border-pink-500 border-2 bg-transparent",
  red: "border-red-500 border-2 bg-transparent",
  black: "border-gray-700 border-2 bg-transparent",
  blue: "border-blue-500 border-2 bg-transparent",
  white: "border-gray-400 border-2 bg-transparent",
  green: "border-green-500 border-2 bg-transparent",
};

const DOT_NONE = "border-gray-500 bg-transparent opacity-40";

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

        let dotStyle: string;
        if (status === "complete") {
          dotStyle = DOT_COMPLETE[color];
        } else if (status === "scheduled" || status === "in_progress") {
          dotStyle = DOT_SCHEDULED[color];
        } else {
          dotStyle = DOT_NONE;
        }

        return (
          <button
            key={color}
            type="button"
            title={`${COLOR_LABELS[color]}${status ? ` — ${status}` : " — not scheduled"}`}
            className={`w-2.5 h-2.5 rounded-full border cursor-pointer ${dotStyle}`}
            onClick={() => onDotClick?.(color)}
          />
        );
      })}
    </div>
  );
}
