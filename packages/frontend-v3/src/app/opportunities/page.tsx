"use client";

import { Suspense, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useOpportunities, useOpportunity } from "@/hooks/use-opportunities";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { SourceChip } from "@/components/shared/source-chip";
import { AskAiPanel } from "@/components/shared/ask-ai-panel";
import { StageDropdown } from "@/components/shared/stage-dropdown";
import { ErrorState } from "@/components/shared/error-state";
import { PendingState } from "@/components/shared/pending-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format-money";
import type {
  DoctrineFitLabel,
  LlmAnalysis,
  OpportunitySummary,
  ShipleyDimension,
} from "@/lib/types";

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64 bg-gda-panel" />}>
      <OpportunitiesContent />
    </Suspense>
  );
}

function OpportunitiesContent() {
  const searchParams = useSearchParams();
  const detailId = searchParams.get("id");

  if (detailId) return <OpportunityDetail id={detailId} />;
  return <OpportunityList />;
}

function OpportunityList() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [dueSoonFilter, setDueSoonFilter] = useState(false);
  const [dueBefore, setDueBefore] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [previousItems, setPreviousItems] = useState<OpportunitySummary[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error, refetch } = useOpportunities({
    q: debouncedQ || undefined,
    grade: gradeFilter || undefined,
    due_before: dueBefore,
    limit: 100,
    cursor,
  });

  const allItems = useMemo(() => {
    const combined = [...previousItems, ...(data?.items ?? [])];
    const seen = new Set<string>();
    return combined.filter((item) => {
      const key = item.internal_id ?? String(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [previousItems, data?.items]);

  const hasMore = data?.pagination?.hasMore ?? false;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQ(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCursor(undefined);
        setPreviousItems([]);
        setDebouncedQ(val);
      }, 350);
    },
    [],
  );

  const handleGradeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCursor(undefined);
      setPreviousItems([]);
      setGradeFilter(e.target.value);
    },
    [],
  );

  const handleDueSoonChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setCursor(undefined);
      setPreviousItems([]);
      setDueSoonFilter(checked);
      setDueBefore(
        checked
          ? new Date(Date.now() + 14 * 86400 * 1000).toISOString()
          : undefined,
      );
    },
    [],
  );

  const handleClearFilters = useCallback(() => {
    setQ("");
    setDebouncedQ("");
    setGradeFilter("");
    setDueSoonFilter(false);
    setDueBefore(undefined);
    setCursor(undefined);
    setPreviousItems([]);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (data?.pagination?.cursor) {
      setPreviousItems((prev) => [...prev, ...(data?.items ?? [])]);
      setCursor(data.pagination.cursor);
    }
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Opportunities
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Search title or agency…"
          value={q}
          onChange={handleSearchChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 w-64"
        />
        <select
          value={gradeFilter}
          onChange={handleGradeChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          <option value="">All Grades</option>
          <option value="A">Grade A</option>
          <option value="B">Grade B</option>
          <option value="C">Grade C</option>
          <option value="D">Grade D</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={dueSoonFilter}
            onChange={handleDueSoonChange}
            className="rounded border-border"
          />
          Due in 14 days
        </label>
        {(debouncedQ || gradeFilter || dueSoonFilter) && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {hasMore ? `${allItems.length}+ results` : `${allItems.length} results`}
        </span>
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && !allItems.length ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 bg-gda-panel" />
          ))}
        </div>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Agency</th>
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Grade/Band</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((opp) => (
                <tr
                  key={opp.internal_id}
                  className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/opportunities?id=${opp.id}`}
                      className="text-foreground hover:text-gda-green truncate block max-w-xs"
                    >
                      {opp.title}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
                    {opp.agency ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-left font-mono text-xs text-foreground tabular-nums">
                    {formatMoney(opp.value)}
                  </td>
                  <td className="px-3 py-1.5 text-left">
                    {opp.pwin ? (
                      <div className="flex items-center gap-1">
                        <ScoreDisplay score={opp.pwin.score} className="text-xs" />
                        <BandBadge band={opp.pwin.band} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {opp.due_date
                      ? new Date(opp.due_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {opp.source ? (
                      <SourceChip label={opp.source} kind="real" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <StageDropdown value={opp.stage ?? "Interest"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allItems.length === 0 && !isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No opportunities match your filter.
            </div>
          )}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={isLoading}
          className="w-full rounded border border-border bg-gda-panel py-2 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-gda-green/30 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

const DOCTRINE_PRINCIPLES: Array<{ id: string; label: string }> = [
  { id: "alignment", label: "Alignment" },
  { id: "ethics_always", label: "Ethics Always" },
  { id: "teamwork", label: "Teamwork" },
  { id: "data_first", label: "Data First, Then Debate" },
  { id: "relentless_execution", label: "Relentless Execution" },
  { id: "relationships", label: "Relationships, Relationships, Relationships" },
  { id: "market_mission_brand", label: "Market, Mission, Brand Focus" },
  { id: "customer_facing", label: "Customer Facing" },
];

const FIT_COLORS: Record<DoctrineFitLabel, string> = {
  strong: "text-gda-green",
  moderate: "text-gda-cyan",
  weak: "text-gda-amber",
  none: "text-muted-foreground",
};

function OpportunityDetail({ id }: { id: string }) {
  const { data: opp, isLoading, error } = useOpportunity(id);

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
    return <ErrorState message={(error as Error).message} />;
  }

  if (!opp) return null;

  const pwin = opp.pwin;
  const band = pwin?.band ?? "discovery";
  const doctrine = opp.doctrine_badge;
  const doctrineScore = opp.doctrine_score;
  const timeline = opp.analysis?.timeline;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/opportunities"
          className="text-xs text-muted-foreground hover:text-gda-green"
        >
          ← Opportunities
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold text-foreground">
          {opp.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StageDropdown value={opp.stage ?? "Interest"} />
          <BandBadge band={band} />
          {opp.agency && (
            <Badge variant="outline" className="text-xs">{opp.agency}</Badge>
          )}
          {opp.naics && (
            <Badge variant="outline" className="text-xs">NAICS {opp.naics}</Badge>
          )}
          {pwin?.incumbent_competitor && (
            <Badge
              variant="outline"
              className="border-gda-amber/30 text-xs text-gda-amber"
              title="Named prime in title — not verified incumbency"
            >
              Named prime: {pwin.incumbent_competitor}
            </Badge>
          )}
          {opp.source && <SourceChip label={opp.source} kind="real" />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Overview */}
          <Card className="border-border bg-gda-panel">
            <CardHeader>
              <CardTitle className="font-mono text-sm text-muted-foreground">
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Value:</span>{" "}
                  <span className="font-mono text-foreground">{formatMoney(opp.value)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Due:</span>{" "}
                  <span className="text-foreground">
                    {opp.due_date ? new Date(opp.due_date).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Set-aside:</span>{" "}
                  <span className="text-foreground">{opp.set_aside ?? "None"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Solicitation:</span>{" "}
                  <span className="text-foreground">{opp.solicitation_number ?? "—"}</span>
                </div>
              </div>
              {opp.description && (
                <>
                  <Separator className="bg-border" />
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {opp.description}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Pwin Panel */}
          {pwin && (
            <Card className="border-border bg-gda-panel">
              <CardHeader>
                <CardTitle className="font-mono text-sm text-muted-foreground">
                  Probability of Win
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <ScoreDisplay score={pwin.score} className="text-3xl" />
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Model: {pwin.model_version} · Scored:{" "}
                  {new Date(pwin.scored_at).toLocaleDateString()}
                  {pwin.days_to_due != null && (
                    <> · {pwin.days_to_due}d to due</>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {pwin.top_drivers.map((d, i) => (
                    <Badge key={i} variant="outline" className="border-border text-xs">
                      {d}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Doctrine Panel */}
          <Card className="border-border bg-gda-panel">
            <CardHeader>
              <CardTitle className="font-mono text-sm text-muted-foreground">
                Doctrine Fit{" "}
                <span className="font-normal italic text-[11px]">
                  (keyword-based doctrine fit)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {doctrine ? (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className={`font-mono text-2xl font-bold ${FIT_COLORS[doctrine.label]}`}>
                      {Math.round((doctrine.score / 100) * 40)}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 40</span>
                    <Badge
                      variant="outline"
                      className={`capitalize text-xs ${FIT_COLORS[doctrine.label]}`}
                    >
                      {doctrine.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {doctrine.rationale}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DOCTRINE_PRINCIPLES.map((p) => {
                      const matched = doctrine.matchedPrinciples.includes(p.id);
                      return (
                        <span
                          key={p.id}
                          className={`text-[11px] ${
                            matched ? "text-gda-green" : "text-muted-foreground"
                          }`}
                        >
                          {matched ? "●" : "○"} {p.label}
                        </span>
                      );
                    })}
                  </div>
                  <SourceChip label="doctrine alignment" kind="heuristic" />
                </>
              ) : doctrineScore != null ? (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-2xl font-bold text-gda-cyan">
                      {doctrineScore}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 40</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {DOCTRINE_PRINCIPLES.map((p) => (
                      <span key={p.id} className="text-[11px] text-muted-foreground">
                        ○ {p.label}
                      </span>
                    ))}
                  </div>
                  <SourceChip label="keyword alignment" kind="heuristic" />
                </>
              ) : (
                <PendingState
                  surface="Doctrine Fit"
                  reason="Doctrine alignment score will appear once the opportunity has been scored by the rules engine."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Timeline */}
        <div className="space-y-4">
          <Card className="border-border bg-gda-panel">
            <CardHeader>
              <CardTitle className="font-mono text-sm text-muted-foreground">
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TimelineRow
                label="RFP Release"
                date={timeline?.rfp_release ?? opp.posted_at}
              />
              <TimelineRow
                label="Proposals Due"
                date={timeline?.proposals_due ?? opp.response_deadline}
              />
              <TimelineRow
                label="Award Estimate"
                date={timeline?.award_estimate}
              />
            </CardContent>
          </Card>

          {/* Capture Pwin — read-only from pipeline */}
          {opp.capture_pwin != null && (
            <Card className="border-border bg-gda-panel">
              <CardHeader>
                <CardTitle className="font-mono text-sm text-muted-foreground">
                  Capture Pwin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreDisplay score={opp.capture_pwin} className="text-2xl" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Shipley-driven capture probability
                </p>
              </CardContent>
            </Card>
          )}

          {/* AI Analysis (F-453) */}
          <AiAnalysisCard
            llmAnalysis={opp.llm_analysis as LlmAnalysis | null | undefined}
            qualityFlag={opp.llm_quality_flag}
          />
        </div>
      </div>

      {/* Ask AI (F-480) */}
      <AskAiPanel
        objectType="opportunity"
        objectId={id}
        context={{
          title: opp.title,
          agency: opp.agency,
          pwin: opp.pwin?.score,
        }}
      />
    </div>
  );
}

// ─── AI Analysis Card (F-453) ────────────────────────────────────────────

const SHIPLEY_DIMENSIONS: Array<{
  key: keyof import("@/lib/types").ShipleyBidNoBid;
  label: string;
}> = [
  { key: "customer_knowledge", label: "Customer Knowledge" },
  { key: "solution_match", label: "Solution Match" },
  { key: "competitive_position", label: "Competitive Position" },
  { key: "past_performance", label: "Past Performance" },
];

const BID_COLORS: Record<string, string> = {
  Bid: "text-gda-green border-gda-green/30",
  "No Bid": "text-gda-red border-gda-red/30",
  Conditional: "text-gda-amber border-gda-amber/30",
};

function AiAnalysisCard({
  llmAnalysis,
  qualityFlag,
}: {
  llmAnalysis?: LlmAnalysis | null;
  qualityFlag?: string | null;
}) {
  if (llmAnalysis === undefined) {
    return (
      <Card className="border-dashed border-border bg-gda-panel/30">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          <p className="font-mono">AI analysis running...</p>
        </CardContent>
      </Card>
    );
  }

  if (!llmAnalysis) {
    return (
      <Card className="border-dashed border-border bg-gda-panel/30">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          <p className="font-mono">AI analysis running...</p>
        </CardContent>
      </Card>
    );
  }

  const bidColor =
    BID_COLORS[llmAnalysis.shipley_bid_no_bid.overall] ?? "text-muted-foreground";

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader>
        <CardTitle className="font-mono text-sm text-muted-foreground">
          AI Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Win Probability */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-gda-green">
              {llmAnalysis.win_probability}%
            </span>
            <span className="text-xs text-muted-foreground">Win Probability</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {llmAnalysis.win_probability_reasoning}
          </p>
          {qualityFlag === "degraded" && (
            <Badge
              variant="outline"
              className="mt-1 border-gda-amber/30 text-[11px] text-gda-amber"
            >
              Degraded (fallback model used)
            </Badge>
          )}
        </div>

        <Separator className="bg-border" />

        {/* Shipley Bid/No-Bid */}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Shipley Bid/No-Bid:
            </span>
            <Badge variant="outline" className={`text-xs ${bidColor}`}>
              {llmAnalysis.shipley_bid_no_bid.overall}
            </Badge>
          </div>
          <div className="mt-2 rounded border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-muted-foreground">
                  <th className="px-2 py-1 text-left font-medium">Dimension</th>
                  <th className="px-2 py-1 text-left font-medium">Score</th>
                  <th className="px-2 py-1 text-left font-medium">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {SHIPLEY_DIMENSIONS.map((dim) => {
                  const d = llmAnalysis.shipley_bid_no_bid[
                    dim.key
                  ] as ShipleyDimension | undefined;
                  if (!d) return null;
                  return (
                    <tr key={dim.key} className="border-b border-border">
                      <td className="px-2 py-1 text-muted-foreground">
                        {dim.label}
                      </td>
                      <td className="px-2 py-1 text-left font-mono text-foreground">
                        {d.score}/10
                      </td>
                      <td className="px-2 py-1 text-muted-foreground truncate max-w-[200px]">
                        {d.reasoning}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Competitor Landscape */}
        {llmAnalysis.competitive_landscape.length > 0 && (
          <>
            <Separator className="bg-border" />
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Competitor Landscape
              </span>
              <div className="mt-1 space-y-1">
                {llmAnalysis.competitive_landscape.slice(0, 3).map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs"
                  >
                    <span className="font-mono text-foreground whitespace-nowrap">
                      {c.name}
                    </span>
                    <span className="text-muted-foreground">
                      {c.our_differentiator}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Source Chips */}
        {llmAnalysis.source_chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {llmAnalysis.source_chips.map((chip, i) => (
              <SourceChip
                key={i}
                label={chip.label}
                url={chip.url}
                kind="real"
              />
            ))}
          </div>
        )}

        {/* Model footer */}
        <p className="text-[11px] font-mono text-muted-foreground">
          Model: {llmAnalysis.model_used}
        </p>
      </CardContent>
    </Card>
  );
}

function TimelineRow({ label, date }: { label: string; date?: string | null }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">
        {date ? new Date(date).toLocaleDateString() : "—"}
      </span>
    </div>
  );
}
