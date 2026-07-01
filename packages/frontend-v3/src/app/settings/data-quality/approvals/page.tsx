"use client";

import { MatchApprovals } from "@/components/settings/MatchApprovals";

export default function DataQualityApprovalsPage() {
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
            Match Approvals
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Review and confirm suggested matches between records before they are linked — approve correct ones, reject wrong ones.
          </p>
        </div>
      </div>
      <MatchApprovals />
    </div>
  );
}
