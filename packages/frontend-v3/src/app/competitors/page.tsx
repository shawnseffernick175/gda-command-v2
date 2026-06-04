"use client";

import { PendingState } from "@/components/shared/pending-state";
import { SourceChip } from "@/components/shared/source-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapseSection } from "@/components/shared/collapse-section";

export default function CompetitorsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Competitors
      </h1>
      <p className="text-sm text-muted-foreground">
        Competitor intelligence and threat assessment. Auto-research from FPDS,
        SAM.gov, and news feeds.
      </p>

      <PendingState
        surface="Competitors"
        reason="Activates with the competitor intelligence backend. Will show a sortable table with size (S/M/L), FPDS win count, overlap score, threat level, and research status."
      />

      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Table Preview (schema ready)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Size</th>
                  <th className="px-3 py-2 text-left font-medium">Overlap</th>
                  <th className="px-3 py-2 text-left font-medium">FPDS Wins</th>
                  <th className="px-3 py-2 text-left font-medium">Threat</th>
                  <th className="px-3 py-2 text-left font-medium">Research</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground italic">
                    Pending competitor intelligence backend
                    <div className="mt-2">
                      <SourceChip label="CI engine pending" kind="pending" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CollapseSection
        id="comp-black-hat"
        title="Black Hat Analysis"
        defaultOpen={false}
      >
        <PendingState
          surface="Black Hat Analysis"
          reason="Activates with the intelligence layer (F-217). Will auto-generate competitor perspective analysis using the LLM router."
        />
      </CollapseSection>
    </div>
  );
}
