"use client";

import { useState } from "react";
import { useAwards, useAwardsCount } from "@/hooks/use-awards";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
import { SourceChip } from "@/components/shared/source-chip";
import { PendingState } from "@/components/shared/pending-state";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";

export default function AwardsPage() {
  const [tab, setTab] = useState<"won" | "lost">("won");
  const { data, isLoading, error, refetch } = useAwards({ outcome: tab });
  const { data: countData } = useAwardsCount();

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Awards &amp; Intel
      </h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("won")}
          className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
            tab === "won"
              ? "bg-gda-green/20 text-gda-green border border-gda-green/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Won
        </button>
        <button
          type="button"
          onClick={() => setTab("lost")}
          className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
            tab === "lost"
              ? "bg-gda-red/20 text-gda-red border border-gda-red/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Lost
        </button>
      </div>

      {countData && (
        <p className="text-xs text-muted-foreground">
          {countData.count} total awards tracked
        </p>
      )}

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 bg-gda-panel" />
          ))}
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="space-y-2">
          {data.items.map((award) => (
            <Card key={award.id} className="border-border bg-gda-panel">
              <CardContent className="flex items-center gap-4 py-3">
                <Badge
                  variant="outline"
                  className={
                    award.outcome === "won"
                      ? "border-gda-green/30 text-gda-green"
                      : "border-gda-red/30 text-gda-red"
                  }
                >
                  {award.outcome}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm text-foreground">{award.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {award.agency ?? "—"} · {new Date(award.date).toLocaleDateString()}
                  </p>
                  {award.outcome === "lost" && award.loss_reason && (
                    <p className="mt-1 text-xs text-gda-amber italic">
                      Loss reason: {award.loss_reason}
                    </p>
                  )}
                </div>
                <span className="font-mono text-sm text-foreground tabular-nums">
                  {formatMoney(award.value)}
                </span>
                {award.source ? (
                  <SourceChip label={award.source} kind="real" />
                ) : (
                  <SourceChip label="FPDS" kind="heuristic" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <PendingState
          surface="Awards"
          reason="No award data available. Awards will be populated from FPDS and manual entry."
        />
      )}

      {/* News Digest — pending F-217 */}
      <CollapseSection
        id="awards-news"
        title="News Digest"
        defaultOpen={false}
      >
        <PendingState
          surface="News Digest"
          reason="Activates with the intelligence layer (F-217). Will auto-summarize industry news, competitor moves, and policy changes."
        />
      </CollapseSection>
    </div>
  );
}
