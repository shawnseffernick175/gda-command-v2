"use client";

import {
  useLaunchpadSummary,
  useLaunchpadFlags,
  useFunnelReport,
  useLaunchpadSignals,
  useTopPrograms,
} from "@/hooks/use-launchpad";
import { useActionItems, useTopActionItems } from "@/hooks/use-action-items";
import { useGenerateBriefing } from "@/hooks/use-briefing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { SourceChip } from "@/components/shared/source-chip";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { ActionItemPriority, Band } from "@/lib/types";
import Link from "next/link";

const VALID_BANDS: Set<string> = new Set(["forecast", "signal", "discovery", "pass"]);

const PRIORITY_COLORS: Record<ActionItemPriority, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const URGENCY_COLORS: Record<string, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function LaunchpadPage() {
  const { data: summary, isLoading: sLoad, error: sErr, refetch: sRefetch } = useLaunchpadSummary();
  const { data: flags } = useLaunchpadFlags();
  const { data: todayItems } = useActionItems({ due: "today" });
  const { data: topPrograms, isLoading: tpLoad } = useTopPrograms();

  const pipelineValue = (topPrograms?.items ?? []).reduce(
    (sum, o) => sum + (o.value ?? 0),
    0,
  );

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

      {/* 1. KPI Row — clickable stat cards */}
      {sLoad ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-gda-panel" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/action-items">
            <StatCard
              label="Flags"
              value={flags?.flags?.length ?? 0}
              color="text-gda-amber"
            />
          </Link>
          <Link href="/action-items">
            <StatCard
              label="Action Items Due Today"
              value={todayItems?.items?.length ?? 0}
              color="text-gda-red"
            />
          </Link>
          <Link href="/opportunities">
            <StatCard
              label="Pipeline Value"
              value={formatMoney(pipelineValue)}
              color="text-gda-green"
            />
          </Link>
        </div>
      ) : null}

      {/* 2. Top 5 Programs — FULL WIDTH table */}
      <TopProgramsTable items={topPrograms?.items ?? []} isLoading={tpLoad} />

      {/* 3. Side-by-side: What Needs Me Today | Recent Signals */}
      <div className="grid gap-4 md:grid-cols-2">
        <WhatNeedsMeTodayWidget />
        <RecentSignalsWidget />
      </div>

      {/* 4. Lifecycle Funnel */}
      <FunnelSection />
    </div>
  );
}

/* ─── Top 5 Programs Table (full-width, pwin-ranked) ─── */

function TopProgramsTable({
  items,
  isLoading,
}: {
  items: Array<{
    internal_id: string;
    title: string | null;
    agency: string | null;
    value: number | null;
    pwin: number | null;
    band: string;
    source_url: string | null;
  }>;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 bg-gda-panel" />;

  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="bg-gda-panel px-4 py-2 border-b border-border">
        <h2 className="font-mono text-sm text-muted-foreground">
          Top 5 Programs (Pwin-Ranked)
        </h2>
      </div>
      {items.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-mono">#</th>
              <th className="px-4 py-2 text-left">Program</th>
              <th className="px-4 py-2 text-left">Agency</th>
              <th className="px-4 py-2 text-left font-mono">Value</th>
              <th className="px-4 py-2 text-left font-mono">Pwin</th>
              <th className="px-4 py-2 text-left">Band</th>
              <th className="px-4 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {items.map((opp, i) => (
              <tr
                key={opp.internal_id}
                className="border-b border-border last:border-b-0 hover:bg-gda-bg-base transition-colors"
              >
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/opportunities?id=${opp.internal_id}`}
                    className="text-foreground hover:text-gda-green transition-colors"
                  >
                    {opp.title ?? "Untitled"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {opp.agency ?? "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-foreground">
                  {opp.value != null ? formatMoney(opp.value) : "—"}
                </td>
                <td className="px-4 py-2">
                  {opp.pwin != null ? (
                    <ScoreDisplay score={opp.pwin} className="text-sm" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {VALID_BANDS.has(opp.band) ? (
                    <BandBadge band={opp.band as Band} />
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {opp.band}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  {opp.source_url ? (
                    <SourceChip label="SAM.gov" url={opp.source_url} kind="real" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          No pwin-scored opportunities yet.
        </div>
      )}
    </div>
  );
}

/* ─── Recent Signals Widget (live market intel) ─── */

function RecentSignalsWidget() {
  const { data: signals, isLoading } = useLaunchpadSignals();
  const generateBriefing = useGenerateBriefing();

  if (isLoading) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardContent className="py-4">
          <Skeleton className="h-32 bg-gda-bg-base" />
        </CardContent>
      </Card>
    );
  }

  const hasBriefing = signals?.market_intel != null;

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-mono text-sm text-muted-foreground">
          Recent Signals
        </CardTitle>
        <div className="flex items-center gap-2">
          {signals?.briefing_date && (
            <Badge variant="outline" className="text-[11px] font-mono">
              {new Date(signals.briefing_date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </Badge>
          )}
          {!hasBriefing && (
            <button
              type="button"
              onClick={() => generateBriefing.mutate()}
              disabled={generateBriefing.isPending}
              className="rounded border border-border bg-gda-bg-base px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors disabled:opacity-50"
            >
              {generateBriefing.isPending ? "Generating…" : "Generate"}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasBriefing ? (
          <>
            <div className="text-xs text-foreground leading-relaxed whitespace-pre-line">
              {signals.market_intel}
            </div>
            {signals.ft_signals && signals.ft_signals.length > 0 && (
              <div className="space-y-1 border-t border-border pt-2">
                {signals.ft_signals.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex items-center gap-2 rounded p-1.5 text-xs hover:bg-gda-bg-base transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className="text-[11px] font-mono shrink-0 border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan"
                    >
                      {sig.source}
                    </Badge>
                    {sig.source_url ? (
                      <a
                        href={sig.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate text-foreground hover:text-gda-green transition-colors"
                      >
                        {sig.title}
                      </a>
                    ) : (
                      <span className="flex-1 truncate text-foreground">
                        {sig.title}
                      </span>
                    )}
                    {sig.urgency && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] font-mono shrink-0",
                          URGENCY_COLORS[sig.urgency] ?? URGENCY_COLORS.low,
                        )}
                      >
                        {sig.urgency}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No daily briefing generated yet.
            </p>
            <button
              type="button"
              onClick={() => generateBriefing.mutate()}
              disabled={generateBriefing.isPending}
              className="rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs text-gda-green hover:bg-gda-green/20 transition-colors disabled:opacity-50"
            >
              {generateBriefing.isPending
                ? "Generating…"
                : "Generate Today's Briefing"}
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <SourceChip label="Defense Market Intel" kind="real" />
          <span className="text-[11px] text-muted-foreground">
            Sourced from daily briefing + Fast Track signals
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Funnel Section ─── */

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

/* ─── What Needs Me Today Widget ─── */

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

/* ─── Stat Card ─── */

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
    <Card className="border-border bg-gda-panel cursor-pointer hover:border-gda-green/40 transition-colors">
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-2xl font-bold tabular-nums ${color}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
