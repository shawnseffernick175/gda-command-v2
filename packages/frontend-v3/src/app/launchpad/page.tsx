"use client";

import {
  useLaunchpadSummary,
  useLaunchpadFlags,
  useFunnelReport,
} from "@/hooks/use-launchpad";
import { useOpportunities } from "@/hooks/use-opportunities";
import { useActionItems, useTopActionItems } from "@/hooks/use-action-items";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { ActionItemPriority } from "@/lib/types";
import Link from "next/link";

const PRIORITY_COLORS: Record<ActionItemPriority, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function LaunchpadPage() {
  const { data: summary, isLoading: sLoad, error: sErr, refetch: sRefetch } = useLaunchpadSummary();
  const { data: flags } = useLaunchpadFlags();
  const { data: topOpps } = useOpportunities({ limit: 5, status: "forecast" });
  const { data: todayItems } = useActionItems({ due: "today" });

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Launchpad
      </h1>

      {/* Flags / Alerts */}
      {flags?.flags && flags.flags.length > 0 && (
        <div className="space-y-2">
          {flags.flags.map((flag, i) => (
            <div
              key={i}
              className={`rounded-md border p-3 text-sm ${
                flag.severity === "critical"
                  ? "border-gda-red/30 bg-gda-red/10 text-gda-red"
                  : flag.severity === "warning"
                    ? "border-gda-amber/30 bg-gda-amber/10 text-gda-amber"
                    : "border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan"
              }`}
            >
              {flag.message}
            </div>
          ))}
        </div>
      )}

      {sErr && (
        <ErrorState
          message={(sErr as Error).message}
          onRetry={() => void sRefetch()}
        />
      )}

      {/* 3 Stat Cards */}
      {sLoad ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-gda-panel" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Flags"
            value={flags?.flags?.length ?? 0}
            color="text-gda-amber"
          />
          <StatCard
            label="Action Items Due Today"
            value={todayItems?.items?.length ?? 0}
            color="text-gda-red"
          />
          <StatCard
            label="Pipeline Value"
            value={formatMoney(
              (topOpps?.items ?? []).reduce((sum, o) => sum + (o.value ?? 0), 0),
            )}
            color="text-gda-green"
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top 5 Programs */}
        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Top 5 Programs (by capture pwin)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topOpps?.items && topOpps.items.length > 0 ? (
              <div className="space-y-2">
                {topOpps.items.slice(0, 5).map((opp, i) => (
                  <Link
                    key={opp.internal_id}
                    href={`/opportunities?id=${opp.internal_id}`}
                    className="flex items-center gap-3 rounded p-2 text-sm hover:bg-gda-bg-base transition-colors"
                  >
                    <span className="font-mono text-xs text-muted-foreground w-4">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-foreground">
                      {opp.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {opp.agency}
                    </span>
                    <span className="font-mono text-xs text-foreground">
                      {formatMoney(opp.value)}
                    </span>
                    {opp.pwin && (
                      <ScoreDisplay score={opp.pwin.score} className="text-sm" />
                    )}
                    {opp.pwin?.band && <BandBadge band={opp.pwin.band} />}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No forecast-band opportunities yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* What Needs Me Today */}
        <WhatNeedsMeTodayWidget />
      </div>

      {/* Lifecycle Funnel */}
      <FunnelSection />

      {/* Recent Signals */}
      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.recent_scores && summary.recent_scores.length > 0 ? (
            <div className="space-y-2">
              {summary.recent_scores.slice(0, 5).map((s) => (
                <Link
                  key={s.internal_id}
                  href={`/opportunities?id=${s.internal_id}`}
                  className="flex items-center gap-3 rounded p-2 text-sm hover:bg-gda-bg-base transition-colors"
                >
                  <span className="flex-1 truncate text-foreground">
                    {s.title}
                  </span>
                  <ScoreDisplay score={s.score} className="text-sm" />
                  <BandBadge band={s.band} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recent signals.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelSection() {
  const { data: funnel, isLoading } = useFunnelReport();

  if (isLoading) return <Skeleton className="h-32 bg-gda-panel" />;
  if (!funnel?.stages?.length) return null;

  const maxCount = Math.max(...funnel.stages.map((s) => s.count), 1);

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader>
        <CardTitle className="font-mono text-sm text-muted-foreground">
          Lifecycle Funnel
          <span className="ml-2 font-normal text-[11px]">
            {funnel.window_days}d window
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {funnel.stages.map((s) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-28 text-xs text-muted-foreground truncate">
                {s.stage}
              </span>
              <div className="flex-1 h-5 bg-gda-bg-base rounded overflow-hidden">
                <div
                  className="h-full rounded bg-gda-green/40"
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="font-mono text-xs text-foreground tabular-nums w-8 text-right">
                {s.count}
              </span>
              {s.conversion_rate != null && (
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-12 text-right">
                  {(s.conversion_rate * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WhatNeedsMeTodayWidget() {
  const { data: items, isLoading } = useTopActionItems(5);

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader>
        <CardTitle className="font-mono text-sm text-muted-foreground">
          What Needs Me Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 bg-gda-bg-base" />
            ))}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item) => {
              const priority = (item.priority ?? "MEDIUM") as ActionItemPriority;
              return (
                <Link
                  key={item.id}
                  href={`/action-items?highlight=${item.id}`}
                  className="flex items-center gap-2 rounded p-1.5 text-xs hover:bg-gda-bg-base transition-colors"
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px] font-mono shrink-0",
                      PRIORITY_COLORS[priority],
                    )}
                  >
                    {priority}
                  </Badge>
                  <span className="flex-1 truncate text-foreground">
                    {item.title}
                  </span>
                  {item.due_date && (
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {new Date(item.due_date).toLocaleDateString("en-US", {
                        month: "2-digit",
                        day: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            All clear — no actions required today.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-2xl font-bold tabular-nums ${color}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
