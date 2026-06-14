"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useMatchSuggestions,
  useDecideMatch,
  useBulkDecide,
} from "@/hooks/use-approvals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import type { MatchSuggestion, BulkDecisionItem } from "@/lib/types";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const { data, isLoading, error, refetch } = useMatchSuggestions({ limit: 100 });
  const decide = useDecideMatch();
  const bulkDecide = useBulkDecide();

  const items = data?.items ?? [];
  const pending = items.filter((s) => s.status === "pending");

  function toggleSelect(linkId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function handleBulk(action: "confirm" | "reject") {
    if (selected.size === 0) return;
    const bulkItems: BulkDecisionItem[] = Array.from(selected).map((id) => ({
      link_id: id,
      action,
    }));
    bulkDecide.mutate(
      { items: bulkItems, decidedBy: user?.email ?? "unknown" },
      { onSuccess: () => setSelected(new Set()) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-3 sticky-page-header">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-lg font-bold text-foreground">
            Approvals
          </h1>
          <span className="text-xs text-muted-foreground">
            {pending.length} pending
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          Review match suggestions. Confirm merges real source links; reject
          separates them. Both actions are audited.
        </p>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded border border-border bg-gda-bg-base px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            className="h-7 bg-gda-green text-gda-bg-deep hover:bg-gda-green/80 text-xs"
            onClick={() => handleBulk("confirm")}
            disabled={bulkDecide.isPending}
          >
            Confirm All
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-gda-red hover:text-gda-red"
            onClick={() => handleBulk("reject")}
            disabled={bulkDecide.isPending}
          >
            Reject All
          </Button>
        </div>
      )}

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-gda-panel" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <Card className="border-dashed border-border bg-gda-panel/30">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No pending match suggestions. Check back after the next ingestion
            cycle.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pending.map((s) => (
            <SuggestionCard
              key={s.link_id}
              suggestion={s}
              isSelected={selected.has(s.link_id)}
              onToggle={() => toggleSelect(s.link_id)}
              onDecide={(action) =>
                decide.mutate({ linkId: s.link_id, action })
              }
              isPending={decide.isPending}
            />
          ))}
        </div>
      )}

      {items.filter((s) => s.status !== "pending").length > 0 && (
        <div className="mt-6">
          <h2 className="font-mono text-sm font-medium text-muted-foreground mb-2">
            Recent Decisions
          </h2>
          <div className="space-y-1">
            {items
              .filter((s) => s.status !== "pending")
              .slice(0, 10)
              .map((s) => (
                <div
                  key={s.link_id}
                  className="flex items-center gap-2 rounded px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <Badge
                    variant="outline"
                    className={
                      s.status === "confirmed"
                        ? "border-gda-green/30 text-gda-green"
                        : "border-gda-red/30 text-gda-red"
                    }
                  >
                    {s.status}
                  </Badge>
                  <span className="truncate">
                    {s.title_a} ↔ {s.title_b}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  isSelected,
  onToggle,
  onDecide,
  isPending,
}: {
  suggestion: MatchSuggestion;
  isSelected: boolean;
  onToggle: () => void;
  onDecide: (action: "confirm" | "reject") => void;
  isPending: boolean;
}) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardContent className="flex items-start gap-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="mt-1 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {s.title_a}
            </span>
            <span className="text-xs text-muted-foreground">↔</span>
            <span className="text-sm font-medium text-foreground truncate">
              {s.title_b}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[11px]">
              {s.confidence}
            </Badge>
            <span>
              {s.source_a} / {s.source_b}
            </span>
            <span className="font-mono tabular-nums">
              sim: {(s.similarity_score * 100).toFixed(0)}%
            </span>
          </div>
          {s.reason && (
            <p className="mt-1 text-xs text-muted-foreground italic">
              {s.reason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            className="h-7 bg-gda-green text-gda-bg-deep hover:bg-gda-green/80 text-xs"
            onClick={() => onDecide("confirm")}
            disabled={isPending}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-gda-red hover:text-gda-red"
            onClick={() => onDecide("reject")}
            disabled={isPending}
          >
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
