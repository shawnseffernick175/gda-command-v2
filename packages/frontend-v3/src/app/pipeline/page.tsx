"use client";

import { useState } from "react";
import Link from "next/link";
import { usePipeline } from "@/hooks/use-pipeline";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreDisplay } from "@/components/score-display";
import { CollapseSection } from "@/components/shared/collapse-section";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";
import { ACTIVE_STAGES, isTerminal } from "@/lib/stages";
import { cn } from "@/lib/utils";

export default function PipelinePage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = usePipeline({ limit: 500 });

  const items = (data?.items ?? []).filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.agency?.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = ACTIVE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = items.filter(
        (i) => i.stage === stage && !isTerminal(i.stage),
      );
      return acc;
    },
    {} as Record<string, typeof items>,
  );

  const totalValue = items.reduce((sum, i) => sum + (i.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Pipeline
        </h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground">
            {items.length} items · {formatMoney(totalValue)}
          </span>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter pipeline..."
        className="w-full max-w-sm rounded border border-border bg-gda-bg-base px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
      />

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 bg-gda-panel" />
          ))}
        </div>
      ) : (
        <Card className="border-border bg-gda-panel overflow-hidden">
          <CardContent className="p-0">
            {ACTIVE_STAGES.map((stage) => {
              const stageItems = grouped[stage] ?? [];
              return (
                <CollapseSection
                  key={stage}
                  id={`pipeline-${stage}`}
                  title={stage}
                  count={stageItems.length}
                  defaultOpen={false}
                >
                  {stageItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No items in {stage}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {stageItems.map((item) => (
                        <Link
                          key={item.internal_id}
                          href={`/opportunities?id=${item.internal_id}`}
                          className={cn(
                            "flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-gda-bg-base transition-colors",
                            item.stalled && "border-l-2 border-gda-amber",
                          )}
                        >
                          <span className="flex-1 truncate text-foreground">
                            {item.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.agency}
                          </span>
                          <span className="font-mono text-xs text-foreground tabular-nums">
                            {formatMoney(item.value)}
                          </span>
                          {item.pwin != null ? (
                            <ScoreDisplay
                              score={item.pwin}
                              className="text-xs"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {item.days_in_stage}d
                          </span>
                          {item.stalled && (
                            <span className="text-[11px] text-gda-amber">
                              stalled
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </CollapseSection>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
