"use client";

import { useState } from "react";
import { useAwardDismiss } from "@/hooks/use-awards";
import { cn } from "@/lib/utils";

const DISMISS_REASONS = [
  { key: "wrong_naics", label: "Wrong NAICS for us" },
  { key: "wrong_agency", label: "Wrong agency" },
  { key: "wrong_dollar_size", label: "Wrong dollar size" },
  { key: "wrong_set_aside", label: "Wrong set-aside" },
  { key: "wrong_relationship", label: "Wrong customer relationship" },
  { key: "incumbent_too_strong", label: "Incumbent too strong" },
  { key: "other", label: "Other" },
] as const;

export function DismissDialog({
  awardId,
  onClose,
}: {
  awardId: string;
  onClose: () => void;
}) {
  const dismiss = useAwardDismiss();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  function handleDismiss() {
    if (!selectedReason) return;
    const note = selectedReason === "other" ? otherText : undefined;
    dismiss.mutate(
      { awardId, reason: selectedReason, note },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded border border-border bg-gda-panel p-5 shadow-xl space-y-4">
        <h3 className="font-mono text-sm font-semibold text-foreground">
          Not Interested — Why?
        </h3>
        <p className="text-xs text-muted-foreground">
          Select a reason. This helps refine the wheelhouse filter over time.
        </p>

        <div className="flex flex-wrap gap-2">
          {DISMISS_REASONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setSelectedReason(r.key)}
              className={cn(
                "rounded border px-3 py-1.5 text-xs font-mono transition-colors",
                selectedReason === r.key
                  ? "border-gda-cyan bg-gda-cyan/10 text-gda-cyan"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {selectedReason === "other" && (
          <input
            type="text"
            placeholder="Describe the reason…"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            className="w-full rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
          />
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleDismiss}
            disabled={!selectedReason || dismiss.isPending}
            className="rounded border border-gda-red/40 bg-gda-red/10 px-4 py-1.5 text-xs font-mono text-gda-red hover:bg-gda-red/20 disabled:opacity-50 transition-colors"
          >
            {dismiss.isPending ? "Dismissing…" : "Dismiss Award"}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
