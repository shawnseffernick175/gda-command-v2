"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCapture } from "@/hooks/use-captures";
import { usePipeline } from "@/hooks/use-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScoreDisplay } from "@/components/score-display";
import { StageDropdown } from "@/components/shared/stage-dropdown";
import { SourceChip } from "@/components/shared/source-chip";
import { PendingState } from "@/components/shared/pending-state";
import { AskAiPanel } from "@/components/shared/ask-ai-panel";
import { formatMoney } from "@/lib/format-money";

export default function CapturePage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64 bg-gda-panel" />}>
      <CaptureContent />
    </Suspense>
  );
}

function CaptureContent() {
  const searchParams = useSearchParams();
  const oppId = searchParams.get("opp");

  if (oppId) return <CaptureDetail oppId={oppId} />;
  return <CaptureList />;
}

function CaptureList() {
  const { data: pipeline, isLoading } = usePipeline({ stage: "Pursue" });

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Capture
      </h1>
      <p className="text-sm text-muted-foreground">
        Pursuits in Capture (Pursue stage and beyond). pwin set here via Shipley
        drivers — pursuit without a capture plan shows “—” and is
        unforecastable.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 bg-gda-panel" />
          ))}
        </div>
      ) : pipeline?.items && pipeline.items.length > 0 ? (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Program</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-center font-medium">pwin</th>
                <th className="px-3 py-2 text-left font-medium">Next Milestone</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.items.map((item) => (
                <tr
                  key={item.internal_id}
                  className="border-b border-border hover:bg-gda-panel/50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/capture?opp=${item.internal_id}`}
                      className="text-foreground hover:text-gda-green"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StageDropdown value={item.stage} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatMoney(item.value)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.pwin != null ? (
                      <ScoreDisplay score={item.pwin} className="text-sm" />
                    ) : (
                      <span className="text-xs text-muted-foreground" title="No capture plan — unforecastable">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {item.next_milestone ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PendingState
          surface="Capture Plans"
          reason="No pursuits are currently in capture stage. Move an opportunity to Pursue stage to begin capture."
        />
      )}
    </div>
  );
}

function CaptureDetail({ oppId }: { oppId: string }) {
  const { data: capture, isLoading, error } = useCapture(oppId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-gda-panel" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 bg-gda-panel" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-gda-red/30 bg-gda-red/10 p-4 text-gda-red text-sm">
        Failed to load capture: {(error as Error).message}
      </div>
    );
  }

  if (!capture) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/capture"
          className="text-xs text-muted-foreground hover:text-gda-green"
        >
          ← Capture
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold text-foreground">
          {capture.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StageDropdown value={capture.stage} />
          {capture.color_review_status && (
            <Badge variant="outline" className="text-xs">
              {capture.color_review_status} Review
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Capture Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Value:</span>
              <span className="font-mono text-foreground">{formatMoney(capture.value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">pwin (Capture):</span>
              {capture.pwin != null ? (
                <ScoreDisplay score={capture.pwin} className="text-sm" />
              ) : (
                <span className="text-muted-foreground" title="No capture plan — unforecastable">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Compliance:</span>
              <span className="font-mono text-foreground">
                {capture.compliance_pct != null ? `${capture.compliance_pct}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next Milestone:</span>
              <span className="text-foreground">{capture.next_milestone ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Win Strategy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {capture.win_strategy ? (
              <p className="text-xs text-foreground whitespace-pre-wrap">
                {capture.win_strategy}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No win strategy documented yet.
              </p>
            )}
            {capture.discriminators && capture.discriminators.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Discriminators:</p>
                <div className="flex flex-wrap gap-1">
                  {capture.discriminators.map((d, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-gda-panel col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Color Reviews (Shipley)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {["Pink", "Red", "Gold", "White"].map((color) => {
                const active =
                  capture.color_review_status?.toLowerCase() ===
                  color.toLowerCase();
                return (
                  <div
                    key={color}
                    className={`flex-1 rounded border p-3 text-center text-xs ${
                      active
                        ? "border-gda-green bg-gda-green/10 text-gda-green"
                        : "border-border bg-gda-bg-base text-muted-foreground"
                    }`}
                  >
                    <p className="font-medium">{color}</p>
                    <p className="mt-1">
                      {active ? "Current" : "—"}
                    </p>
                    <SourceChip
                      label={active ? "active" : "pending"}
                      kind={active ? "real" : "pending"}
                      className="mt-1"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <AskAiPanel objectType="capture" objectId={oppId} />
    </div>
  );
}
