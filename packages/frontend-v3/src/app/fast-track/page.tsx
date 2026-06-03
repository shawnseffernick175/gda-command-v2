"use client";

import { PendingState } from "@/components/shared/pending-state";
import { SourceChip } from "@/components/shared/source-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FastTrackPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Fast Track
      </h1>
      <p className="text-sm text-muted-foreground">
        Discover innovation from academia &amp; research. Auto-suggest government
        match + your angle.
      </p>

      <PendingState
        surface="Fast Track Discovery Engine"
        reason="Activates with the discovery engine (F-520). This surface will crawl academia/research, cluster innovations, and auto-suggest government matches once the backend is built."
      />

      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Signal Card Preview (3-layer format)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="rounded border border-border bg-gda-bg-base p-3">
            <p className="font-medium text-foreground">
              ① Innovation (source: TTO/NSF/arXiv)
            </p>
            <p className="mt-1 italic">
              Pending — real signal data will appear here
            </p>
            <SourceChip label="F-520 pending" kind="pending" className="mt-2" />
          </div>
          <div className="rounded border border-border bg-gda-bg-base p-3">
            <p className="font-medium text-foreground">
              ② Auto-suggested gov match + fit
            </p>
            <p className="mt-1 italic">
              AI-suggested — verify (pending F-217 + F-520)
            </p>
            <SourceChip
              label="keyword — pending real scoring"
              kind="heuristic"
              className="mt-2"
            />
          </div>
          <div className="rounded border border-border bg-gda-bg-base p-3">
            <p className="font-medium text-foreground">
              ③ Your angle (prime / broker) + Promote / Dismiss
            </p>
            <p className="mt-1 italic">
              Pending discovery engine integration
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
