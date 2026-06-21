"use client";

import { MatchApprovals } from "@/components/settings/MatchApprovals";

export default function DataQualityApprovalsPage() {
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
            Match Approvals
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {"Review and confirm the system's suggested matches between records (such as opportunities, awards, and vehicles) before they are linked. Approve the correct matches and reject the wrong ones to keep your data clean and trustworthy."}
          </p>
        </div>
      </div>
      <MatchApprovals />
    </div>
  );
}
