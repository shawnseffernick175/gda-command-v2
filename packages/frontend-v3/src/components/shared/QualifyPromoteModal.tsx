"use client";

import { useState } from "react";
import { useUpdateStage } from "@/hooks/use-opportunities";

/**
 * F — capture-phase entry gate.
 *
 * Shown when a forward stage move is refused because the opportunity has not
 * cleared the qualify-first gate (backend returns `QUALIFY_REQUIRED`). Offers
 * the doctrine-clean default ("Qualify & promote") and an explicit audited
 * override that records the owner's rationale (who/when/why) in the audit log.
 */
export function QualifyPromoteModal({
  opportunityId,
  targetStage,
  targetLabel,
  onClose,
  onSuccess,
}: {
  opportunityId: string;
  targetStage: string;
  targetLabel: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [mode, setMode] = useState<"choose" | "override">("choose");
  const [reason, setReason] = useState("");
  const updateStage = useUpdateStage();

  const reasonChars = reason.trim().length;
  const reasonValid = reasonChars >= 20;

  function qualifyAndPromote() {
    updateStage.mutate(
      { id: opportunityId, stage: targetStage, relevance_status: "relevant" },
      {
        onSuccess: () => {
          onSuccess(`Qualified & moved to ${targetLabel}`);
          onClose();
        },
      },
    );
  }

  function submitOverride() {
    if (!reasonValid) return;
    updateStage.mutate(
      { id: opportunityId, stage: targetStage, override: true, override_reason: reason.trim() },
      {
        onSuccess: () => {
          onSuccess(`Override recorded — moved to ${targetLabel}`);
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
            Qualify required to move to {targetLabel}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            This opportunity hasn&apos;t been qualified yet. Per capture doctrine, the
            owner qualifies an opportunity before it enters the pipeline. Qualify &amp;
            promote it now, or record an audited override for an exception.
          </p>
        </div>

        {mode === "choose" ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={qualifyAndPromote}
              disabled={updateStage.isPending}
              className="block w-full rounded border border-gda-green bg-gda-green/10 px-3 py-2 text-left text-xs text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
            >
              <span className="font-semibold">Qualify &amp; promote</span>
              <span className="block text-[12px] text-gda-green/80">
                Mark relevant and move to {targetLabel} (recommended)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("override")}
              disabled={updateStage.isPending}
              className="block w-full rounded border border-border px-3 py-2 text-left text-xs text-foreground hover:border-gda-amber/50 disabled:opacity-50 transition-colors"
            >
              <span className="font-semibold">Override with reason</span>
              <span className="block text-[12px] text-muted-foreground">
                Move without qualifying — logged with who/when/why
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
              Override reason (min 20 characters)
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this opportunity moving into the pipeline without qualification?"
              className="w-full rounded border border-border bg-gda-bg-base px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-amber/50 resize-none"
            />
            <p className={`text-[12px] font-mono ${reasonValid ? "text-gda-green" : "text-muted-foreground"}`}>
              {reasonChars}/20 characters
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={mode === "override" ? () => setMode("choose") : onClose}
            disabled={updateStage.isPending}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            {mode === "override" ? "Back" : "Cancel"}
          </button>
          {mode === "override" && (
            <button
              type="button"
              onClick={submitOverride}
              disabled={!reasonValid || updateStage.isPending}
              className="rounded border border-gda-amber bg-gda-amber/10 px-3 py-1.5 text-xs text-gda-amber hover:bg-gda-amber/20 disabled:opacity-50 transition-colors"
            >
              {updateStage.isPending ? "Submitting..." : "Submit override"}
            </button>
          )}
        </div>

        {updateStage.isError && (
          <p className="text-[12px] text-gda-red">
            Failed: {updateStage.error instanceof Error ? updateStage.error.message : "Unknown error"}
          </p>
        )}
      </div>
    </div>
  );
}
