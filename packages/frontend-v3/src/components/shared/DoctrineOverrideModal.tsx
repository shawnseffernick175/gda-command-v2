"use client";

import { useState } from "react";
import { useDoctrineOverride } from "@/hooks/use-doctrine-evaluation";

export function DoctrineOverrideModal({
  entityId,
  entityKind,
  kind,
  exclusionIds,
  onClose,
  onSuccess,
}: {
  entityId: string;
  entityKind: string;
  kind: string;
  exclusionIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rationale, setRationale] = useState("");
  const override = useDoctrineOverride();
  const charCount = rationale.trim().length;
  const isValid = charCount >= 50;

  function handleSubmit() {
    if (!isValid) return;
    override.mutate(
      {
        entity_kind: entityKind,
        entity_id: entityId,
        kind,
        rationale: rationale.trim(),
        exclusion_ids: exclusionIds,
      },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded border border-border bg-white p-6 space-y-4 shadow-lg">
        <div>
          <h3 className="font-mono text-sm font-bold text-foreground">
            {kind === "exclusion_override" ? "Exclusion Override" : "Margin Override"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {kind === "exclusion_override"
              ? "One or more strategic exclusions are triggered. Override requires written executive rationale that will be permanently logged."
              : "Margin falls below the 8% floor. Override requires written executive rationale."}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
            Rationale (min 50 characters)
          </label>
          <textarea
            rows={4}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Provide executive rationale for overriding this rule..."
            className="w-full rounded border border-border bg-gda-bg-base px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
          />
          <p className={`text-[12px] font-mono ${isValid ? "text-gda-green" : "text-muted-foreground"}`}>
            {charCount}/50 characters
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || override.isPending}
            className="rounded border border-gda-green bg-gda-green/10 px-3 py-1.5 text-xs text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {override.isPending ? "Submitting..." : "Submit Override"}
          </button>
        </div>

        {override.isError && (
          <p className="text-[12px] text-gda-red">
            Failed to submit override: {override.error instanceof Error ? override.error.message : "Unknown error"}
          </p>
        )}
      </div>
    </div>
  );
}
