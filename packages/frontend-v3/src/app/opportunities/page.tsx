"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useOpportunities, useOpportunity } from "@/hooks/use-opportunities";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { SourceChip } from "@/components/shared/source-chip";
import { StageDropdown } from "@/components/shared/stage-dropdown";
import { OodaInspector } from "@/components/shared/ooda-inspector";
import { AskAiPanel } from "@/components/shared/ask-ai-panel";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format-money";

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
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = useOpportunities({ limit: 200 });

  const items = (data?.items ?? []).filter(
    (o) =>
      !search ||
      o.title.toLowerCase().includes(search.toLowerCase()) ||
      o.agency?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Opportunities
        </h1>
        <span className="text-xs text-muted-foreground">
          {data?.total ?? items.length} total
        </span>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by title or agency..."
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
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-center font-medium">Grade/Band</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {items.map((opp) => (
                <tr
                  key={opp.internal_id}
                  className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/opportunities?id=${opp.internal_id}`}
                      className="text-foreground hover:text-gda-green truncate block max-w-xs"
                    >
                      {opp.title}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
                    {opp.agency ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-foreground tabular-nums">
                    {formatMoney(opp.value)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {opp.pwin ? (
                      <div className="flex items-center justify-center gap-1">
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
          {items.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No opportunities match your filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
    return (
      <ErrorState message={(error as Error).message} />
    );
  }

  if (!opp) return null;

  const pwin = opp.pwin;
  const band = pwin?.band ?? "discovery";

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
          {opp.source && (
            <SourceChip label={opp.source} kind="real" />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Canvas (main content) */}
        <div className="lg:col-span-2 space-y-4">
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

          {/* Pwin */}
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

          <AskAiPanel objectType="opportunity" objectId={id} />
        </div>

        {/* Inspector (OODA) */}
        <div className="space-y-4">
          <Card className="border-border bg-gda-panel">
            <CardHeader>
              <CardTitle className="font-mono text-sm text-muted-foreground">
                OODA Inspector
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OodaInspector
                opportunityId={id}
                stage={opp.stage ?? undefined}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
