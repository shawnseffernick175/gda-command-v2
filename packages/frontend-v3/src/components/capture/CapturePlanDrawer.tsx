"use client";

import { useState } from "react";
import {
  useCapturePlan,
  useCaptureMilestones,
  useCaptureReviews,
} from "@/hooks/use-capture-reviews";
import { DriversTab } from "./tabs/DriversTab";
import { ReviewsTab } from "./tabs/ReviewsTab";
import { MilestonesTab } from "./tabs/MilestonesTab";
import { OverviewTab } from "./tabs/OverviewTab";
import type { CaptureDetail } from "@/lib/types";

type TabId = "overview" | "drivers" | "reviews" | "milestones" | "documents" | "actions";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "drivers", label: "Drivers" },
  { id: "reviews", label: "Reviews" },
  { id: "milestones", label: "Milestones" },
  { id: "documents", label: "Documents" },
  { id: "actions", label: "Action Items" },
];

interface CapturePlanDrawerProps {
  capture: CaptureDetail;
  onClose: () => void;
  onOpenScoringWorkspace?: (reviewId: number) => void;
}

export function CapturePlanDrawer({
  capture,
  onClose,
  onOpenScoringWorkspace,
}: CapturePlanDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const captureId = capture.id;

  const { data: plan } = useCapturePlan(captureId);
  const { data: milestones } = useCaptureMilestones(captureId);
  const { data: reviews } = useCaptureReviews(captureId);
  const docs = undefined as { items: Array<{ id: number; filename: string; doc_type: string }> } | undefined;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[60%] min-w-[600px] max-w-[900px] flex-col border-l border-border bg-gda-bg-base shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="font-mono text-sm font-bold text-foreground">
            {capture.title ?? "Capture Plan"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Stage: {capture.stage} · Pwin: {plan?.computed_pwin != null ? `${Math.round(plan.computed_pwin * 100)}%` : "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-gda-panel"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-gda-green text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "overview" && (
          <OverviewTab capture={capture} plan={plan ?? null} />
        )}
        {activeTab === "drivers" && (
          <DriversTab captureId={captureId} plan={plan ?? null} />
        )}
        {activeTab === "reviews" && (
          <ReviewsTab
            captureId={captureId}
            reviews={reviews?.items ?? []}
            onOpenScoringWorkspace={onOpenScoringWorkspace}
          />
        )}
        {activeTab === "milestones" && (
          <MilestonesTab
            captureId={captureId}
            milestones={milestones?.items ?? []}
          />
        )}
        {activeTab === "documents" && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">Linked Documents</h3>
            {(docs?.items ?? []).length > 0 ? (
              <div className="space-y-2">
                {(docs?.items ?? []).map((doc: { id: number; filename: string; doc_type: string }) => (
                  <div key={doc.id} className="flex items-center justify-between rounded border border-border bg-gda-panel px-3 py-2">
                    <span className="text-xs text-foreground">{doc.filename}</span>
                    <span className="text-[11px] text-muted-foreground">{doc.doc_type}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No documents linked to this capture.</p>
            )}
          </div>
        )}
        {activeTab === "actions" && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">Action Items</h3>
            <p className="text-xs text-muted-foreground">
              Action items generated from completed reviews will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
