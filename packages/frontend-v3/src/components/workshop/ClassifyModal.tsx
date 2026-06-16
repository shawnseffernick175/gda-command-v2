"use client";

import { useState } from "react";

const CLASSIFICATIONS = [
  { value: "proposal_draft", label: "Proposal draft (ours or competitor's)" },
  {
    value: "competitor_whitepaper",
    label: "Competitor whitepaper / capabilities deck",
  },
  { value: "rfp_solicitation", label: "RFP / solicitation" },
  { value: "past_performance", label: "Past performance write-up" },
  {
    value: "financial_statement",
    label: "Financial statement / 10-K / 10-Q",
  },
  { value: "meeting_notes", label: "Meeting notes / transcript" },
  { value: "contract_agreement", label: "Contract / agreement" },
  { value: "other", label: "Other" },
] as const;

export function ClassifyModal({
  filename,
  onClassify,
  onCancel,
  isPending,
}: {
  filename: string;
  onClassify: (classification: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<string>("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded border border-border bg-card p-6 shadow-lg">
        <h3 className="text-base font-semibold text-foreground">
          What is this?
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Classifying: {filename}
        </p>

        <div className="mt-4 space-y-1.5">
          {CLASSIFICATIONS.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-gda-panel"
            >
              <input
                type="radio"
                name="classification"
                value={c.value}
                checked={selected === c.value}
                onChange={(e) => setSelected(e.target.value)}
                className="accent-gda-green"
              />
              {c.label}
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-border px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-base"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-gda-green px-4 py-1.5 text-[13px] font-medium text-gda-bg-deep transition-colors hover:bg-gda-green-muted disabled:opacity-50"
            onClick={() => selected && onClassify(selected)}
            disabled={!selected || isPending}
          >
            {isPending ? "Classifying..." : "Classify & Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
