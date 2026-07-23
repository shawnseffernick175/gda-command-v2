"use client";

import { cn } from "@/lib/utils";

export type FastracView = "match-engine" | "need-feed" | "solution-feed";

const VIEW_OPTIONS: { value: FastracView; label: string }[] = [
  { value: "match-engine", label: "Match Engine" },
  { value: "need-feed", label: "Need Feed" },
  { value: "solution-feed", label: "Solution Feed" },
];

export function ViewToggle({
  active,
  onChange,
}: {
  active: FastracView;
  onChange: (v: FastracView) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-muted-foreground font-mono uppercase tracking-wide">
        View:
      </span>
      <div className="flex gap-1">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded border px-3 py-1 text-xs font-mono font-medium transition-colors",
              active === opt.value
                ? "border-gda-cyan/40 bg-gda-cyan/15 text-gda-cyan"
                : "border-border bg-gda-bg-base text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
