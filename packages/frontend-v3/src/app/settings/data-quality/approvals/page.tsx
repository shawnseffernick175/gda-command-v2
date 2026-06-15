"use client";

import { MatchApprovals } from "@/components/settings/MatchApprovals";

export default function DataQualityApprovalsPage() {
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Match Approvals
        </h1>
        <p className="text-xs text-muted-foreground">
          Settings &rsaquo; Data Quality &rsaquo; Match Approvals
        </p>
      </div>
      <MatchApprovals />
    </div>
  );
}
