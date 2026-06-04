"use client";

import { PendingState } from "@/components/shared/pending-state";
import { SourceChip } from "@/components/shared/source-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";

export default function RisksPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Risks
      </h1>
      <p className="text-sm text-muted-foreground">
        Risk register for active pursuits and organizational risks.
        Likelihood × Impact = Score. Track mitigation status.
      </p>

      <PendingState
        surface="Risk Register"
        reason="Activates with the risk management backend. Will show a sortable table with category, L×I score, status (Open/Mitigating/Closed), owner, and linked pursuit."
      />

      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Risk Table Preview (schema ready)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">L</th>
                  <th className="px-3 py-2 text-left font-medium">I</th>
                  <th className="px-3 py-2 text-left font-medium">Score</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground italic">
                    Pending risk management backend
                    <div className="mt-2">
                      <SourceChip label="Risk DB pending" kind="pending" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <Badge variant="outline" className="text-[11px] border-gda-green/30 text-gda-green">Open</Badge>
            <Badge variant="outline" className="text-[11px] border-gda-amber/30 text-gda-amber">Mitigating</Badge>
            <Badge variant="outline" className="text-[11px] border-muted-foreground/30 text-muted-foreground">Closed</Badge>
          </div>
        </CardContent>
      </Card>

      <CollapseSection
        id="risks-heatmap"
        title="Risk Heat Map"
        defaultOpen={false}
      >
        <PendingState
          surface="Risk Heat Map"
          reason="L×I matrix visualization. Activates when risk data is available."
        />
      </CollapseSection>
    </div>
  );
}
