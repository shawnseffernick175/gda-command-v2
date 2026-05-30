import { type ReactNode } from "react";

export interface CardProps {
  variant?: "default" | "banner";
  bannerSeverity?: "info" | "critical";
  clickable?: boolean;
  onClick?: () => void;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const paddings = { none: "", sm: "p-4", md: "p-6", lg: "p-8" };

export function Card({
  variant = "default",
  bannerSeverity = "info",
  clickable,
  onClick,
  padding = "md",
  children,
}: CardProps) {
  const base = [
    "rounded-md border border-border bg-surface",
    paddings[padding],
    clickable && "cursor-pointer hover:bg-surface-raised transition-colors duration-[var(--duration-state)]",
    variant === "banner" &&
      (bannerSeverity === "critical" ? "border-l-[4px] border-l-critical" : "border-l-[4px] border-l-accent"),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={base} onClick={clickable ? onClick : undefined} role={clickable ? "button" : undefined}>
      {children}
    </div>
  );
}
