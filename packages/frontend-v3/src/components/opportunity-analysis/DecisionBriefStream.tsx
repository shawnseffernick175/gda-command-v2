"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AnalysisSections,
  SourceRef,
  PwinSectionData,
  DoctrineSectionData,
  IncumbentSectionData,
  SimilarAwardsSectionData,
  CompetitorsSectionData,
  DecisionFactorsSectionData,
  TeamingSectionData,
  WinThemesSectionData,
  RisksSectionData,
  CitationsSectionData,
} from "@/hooks/use-opportunity-analysis";

/**
 * F-305: Canonical 10-section Decision Brief with progressive rendering.
 * Each section renders independently as SSE data arrives.
 * R1: Every value has a clickable source citation.
 */

// ─── Source Citation Chip (R1 compliance) ────────────────────────────────────

function SourceChip({ source }: { source: SourceRef }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${source.title}\nRetrieved: ${new Date(source.retrieved_at).toLocaleString()}`}
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[12px] font-mono text-gda-cyan hover:border-gda-cyan/40 hover:bg-gda-cyan/5 transition-colors"
    >
      <span className="opacity-60">[{source.kind}]</span>
      <span className="max-w-[180px] truncate">{source.title.slice(0, 50)}</span>
    </a>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-gda-cyan animate-pulse" />
          <p className="text-xs text-gda-cyan font-mono">Analyzing...</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StaleIndicator() {
  return (
    <Badge variant="outline" className="text-[12px] font-mono text-gda-amber border-gda-amber/30 ml-2">
      STALE — re-running
    </Badge>
  );
}

// ─── Section 1: PWin ─────────────────────────────────────────────────────────

function PwinSection({ data, sources, stale }: { data: PwinSectionData; sources: SourceRef[]; stale?: boolean }) {
  const grade = data.grade;
  const gradeColor = grade === "Go"
    ? "bg-gda-green/20 border-gda-green text-gda-green"
    : grade === "Reconsider"
      ? "bg-gda-amber/10 border-gda-amber text-gda-amber"
      : "bg-gda-red/10 border-gda-red text-gda-red";
  const scoreColor = (data.score ?? 0) >= 65 ? "text-gda-green" : (data.score ?? 0) >= 40 ? "text-gda-amber" : "text-gda-red";

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            PWin Score
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className={cn("font-mono text-4xl font-bold", scoreColor)}>
            {data.score != null ? `${data.score}%` : "—"}
          </span>
          {grade && (
            <Badge className={cn("text-sm font-mono font-bold px-3 py-1 border", gradeColor)}>
              {grade}
            </Badge>
          )}
        </div>
        {data.top_drivers.length > 0 && (
          <div>
            <p className="text-[12px] font-mono text-muted-foreground uppercase mb-1">Top Drivers</p>
            <ul className="space-y-0.5">
              {data.top_drivers.map((d, i) => (
                <li key={i} className="text-xs text-foreground">• {d}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 2: Doctrine ─────────────────────────────────────────────────────

function DoctrineSection({ data, sources, stale }: { data: DoctrineSectionData; sources: SourceRef[]; stale?: boolean }) {
  if (data.error) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Doctrine Alignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gda-red">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const pct = data.alignment_total != null && data.max_score > 0
    ? Math.round((data.alignment_total / data.max_score) * 100)
    : null;
  const hasBlocks = data.exclusions_triggered.length > 0 || (data.margin_check && !data.margin_check.passed);

  return (
    <Card className={cn("border-border bg-gda-panel", hasBlocks && "border-gda-red/30")}>
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Doctrine Alignment
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold text-foreground">
            {data.alignment_total ?? "—"}/{data.max_score}
          </span>
          {pct != null && (
            <span className={cn("text-sm font-mono", pct >= 75 ? "text-gda-green" : pct >= 50 ? "text-gda-amber" : "text-gda-red")}>
              ({pct}%)
            </span>
          )}
        </div>

        {data.exclusions_triggered.length > 0 && (
          <div className="rounded border border-gda-red/30 bg-gda-red/5 px-3 py-2 space-y-1">
            <p className="text-[12px] font-semibold text-gda-red uppercase">Hard Block — Exclusions Triggered</p>
            {data.exclusions_triggered.map((excl) => (
              <p key={excl.id} className="text-[12px] text-muted-foreground">
                {excl.name}: {excl.evidence.join("; ")}
              </p>
            ))}
          </div>
        )}

        {data.margin_check && !data.margin_check.passed && (
          <div className="rounded border border-gda-red/30 bg-gda-red/5 px-3 py-2">
            <p className="text-[12px] font-semibold text-gda-red">
              Margin below {data.margin_check.threshold}% floor
            </p>
          </div>
        )}

        {data.recommendations.length > 0 && (
          <div>
            <p className="text-[12px] font-mono text-muted-foreground uppercase mb-1">Recommendations</p>
            <ul className="space-y-0.5">
              {data.recommendations.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs text-foreground">• {r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 3: Incumbent ────────────────────────────────────────────────────

function IncumbentSection({ data, sources, stale }: { data: IncumbentSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Incumbent
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.name ? (
          <div>
            <span className="text-sm font-mono text-foreground font-medium">{data.name}</span>
            {data.confidence && (
              <span className="ml-2 text-[12px] text-muted-foreground">
                (confidence: {data.confidence})
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No incumbent identified — enrichment pipeline pending
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 4: Similar Awards ───────────────────────────────────────────────

function SimilarAwardsSection({ data, sources, stale }: { data: SimilarAwardsSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Similar Awards
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.awards.length > 0 ? (
          <div className="space-y-1.5">
            {data.awards.map((award, i) => (
              <a
                key={i}
                href={award.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded border border-border px-3 py-2 hover:border-gda-cyan/40 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs text-foreground font-medium truncate max-w-[70%]">
                    {award.title}
                  </span>
                  <Badge variant="outline" className="text-[12px] font-mono text-gda-cyan">
                    {award.score}% match
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {award.awardee} • {award.agency}
                </p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No similar awards found in knowledge base
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 5: Competitors ──────────────────────────────────────────────────

function CompetitorsSection({ data, sources, stale }: { data: CompetitorsSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Competitive Landscape
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.competitors.length > 0 ? (
          <div className="space-y-1">
            {data.competitors.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-foreground font-medium">{c.name}</span>
                <Badge variant="outline" className={cn(
                  "text-[12px]",
                  c.threat_level === "high" && "text-gda-red border-gda-red/30",
                  c.threat_level === "medium" && "text-gda-amber border-gda-amber/30",
                  c.threat_level === "low" && "text-gda-cyan border-gda-cyan/30",
                )}>
                  {c.threat_level}
                </Badge>
                {c.our_differentiator && (
                  <span className="text-muted-foreground">{c.our_differentiator}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No competitors identified yet
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 6: Decision Factors ─────────────────────────────────────────────

function DecisionFactorsSection({ data, sources, stale }: { data: DecisionFactorsSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Decision Factors
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[12px] font-mono text-muted-foreground uppercase">Evaluation Type</p>
            <p className="text-foreground">{data.evaluation_type}</p>
          </div>
          <div>
            <p className="text-[12px] font-mono text-muted-foreground uppercase">Past Performance</p>
            <p className="text-foreground">{data.past_performance_weight}</p>
          </div>
          <div>
            <p className="text-[12px] font-mono text-muted-foreground uppercase">Key Personnel</p>
            <p className="text-foreground">{data.key_personnel_required ? "Required" : "Not specified"}</p>
          </div>
          <div>
            <p className="text-[12px] font-mono text-muted-foreground uppercase">Set-Aside</p>
            <p className="text-foreground">{data.set_aside_type ?? "Full & open"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 7: Teaming ──────────────────────────────────────────────────────

function TeamingSection({ data, sources, stale }: { data: TeamingSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Teaming Opportunities
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.opportunities.length > 0 ? (
          <div className="space-y-1">
            {data.opportunities.map((t, i) => (
              <div key={i} className="text-xs">
                <span className="font-mono text-foreground font-medium">{t.partner}</span>
                <span className="text-muted-foreground ml-2">— {t.rationale}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No cross-OU teaming signals detected
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 8: Win Themes ───────────────────────────────────────────────────

function WinThemesSection({ data, sources, stale }: { data: WinThemesSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Win Themes & Strategy
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.strategy && (
          <p className="text-xs text-foreground font-medium">{data.strategy}</p>
        )}
        {data.themes.length > 0 && (
          <ul className="space-y-0.5">
            {data.themes.map((t, i) => (
              <li key={i} className="text-xs text-foreground">• {t}</li>
            ))}
          </ul>
        )}
        {!data.strategy && data.themes.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Win theme analysis pending</p>
        )}
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 9: Risks ────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  HIGH: "bg-gda-red/10 text-gda-red border-gda-red/30",
  MED: "bg-gda-amber/10 text-gda-amber border-gda-amber/30",
  LOW: "bg-gda-cyan/10 text-gda-cyan border-gda-cyan/30",
};

function RisksSection({ data, sources, stale }: { data: RisksSectionData; sources: SourceRef[]; stale?: boolean }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Risks
          </CardTitle>
          {stale && <StaleIndicator />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.risks.length > 0 ? (
          data.risks.map((risk, i) => (
            <div key={i} className="text-xs space-y-0.5">
              <div className="flex items-start gap-2">
                <Badge className={cn("text-[12px] font-mono border shrink-0", RISK_COLORS[risk.level] ?? "text-muted-foreground")}>
                  {risk.level}
                </Badge>
                <span className="text-foreground">{risk.description}</span>
              </div>
              {risk.mitigation && (
                <p className="ml-12 text-muted-foreground">Mitigation: {risk.mitigation}</p>
              )}
              {risk.regulatory_citation && (
                <a
                  href={`https://www.acquisition.gov/far/${risk.regulatory_citation.replace(/\s/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-12 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[12px] font-mono text-gda-cyan hover:border-gda-cyan/40 transition-colors"
                >
                  {risk.regulatory_citation}
                </a>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground italic">No risks identified</p>
        )}
        <div className="flex flex-wrap gap-1">
          {sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section 10: Citations Footer ────────────────────────────────────────────

function CitationsSection({ data }: { data: CitationsSectionData }) {
  return (
    <Card className="border-border bg-gda-panel/50">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Sources & Citations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {data.all_sources.map((s, i) => <SourceChip key={i} source={s} />)}
        </div>
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground font-mono pt-1 border-t border-border">
          <span>v{data.analysis_version}</span>
          <span>Generated: {new Date(data.generated_at).toLocaleString()}</span>
          {!data.cache_fresh && (
            <span className="text-gda-amber">Re-analysis in progress</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface DecisionBriefStreamProps {
  sections: AnalysisSections;
  isStreaming: boolean;
  isDone: boolean;
  error: string | null;
  traceId: string | null;
}

const SECTION_LABELS: Record<string, string> = {
  pwin: "PWin Score",
  doctrine: "Doctrine Alignment",
  incumbent: "Incumbent",
  similar_awards: "Similar Awards",
  competitors: "Competitive Landscape",
  decision_factors: "Decision Factors",
  teaming: "Teaming Opportunities",
  win_themes: "Win Themes & Strategy",
  risks: "Risks",
  citations: "Sources & Citations",
};

export function DecisionBriefStream({ sections, isStreaming, isDone, error, traceId }: DecisionBriefStreamProps) {
  if (error) {
    return (
      <Card className="border-gda-red/30 bg-gda-panel">
        <CardContent className="py-4">
          <p className="text-xs text-gda-red font-mono">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const sectionOrder: (keyof AnalysisSections)[] = [
    "pwin", "doctrine", "incumbent", "similar_awards", "competitors",
    "decision_factors", "teaming", "win_themes", "risks", "citations",
  ];

  return (
    <div className="space-y-3">
      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 px-2">
          <span className="inline-block h-2 w-2 rounded-full bg-gda-cyan animate-pulse" />
          <span className="text-[12px] font-mono text-gda-cyan">Streaming decision brief...</span>
          {traceId && (
            <span className="text-[12px] font-mono text-muted-foreground ml-auto">
              trace: {traceId.slice(0, 8)}
            </span>
          )}
        </div>
      )}

      {sectionOrder.map((key) => {
        const section = sections[key];
        if (!section) {
          // Show skeleton only if still streaming
          if (isStreaming || !isDone) {
            return <SectionSkeleton key={key} label={SECTION_LABELS[key] ?? key} />;
          }
          return null;
        }

        switch (key) {
          case "pwin":
            return <PwinSection key={key} data={section.data as PwinSectionData} sources={section.sources} stale={section.stale} />;
          case "doctrine":
            return <DoctrineSection key={key} data={section.data as DoctrineSectionData} sources={section.sources} stale={section.stale} />;
          case "incumbent":
            return <IncumbentSection key={key} data={section.data as IncumbentSectionData} sources={section.sources} stale={section.stale} />;
          case "similar_awards":
            return <SimilarAwardsSection key={key} data={section.data as SimilarAwardsSectionData} sources={section.sources} stale={section.stale} />;
          case "competitors":
            return <CompetitorsSection key={key} data={section.data as CompetitorsSectionData} sources={section.sources} stale={section.stale} />;
          case "decision_factors":
            return <DecisionFactorsSection key={key} data={section.data as DecisionFactorsSectionData} sources={section.sources} stale={section.stale} />;
          case "teaming":
            return <TeamingSection key={key} data={section.data as TeamingSectionData} sources={section.sources} stale={section.stale} />;
          case "win_themes":
            return <WinThemesSection key={key} data={section.data as WinThemesSectionData} sources={section.sources} stale={section.stale} />;
          case "risks":
            return <RisksSection key={key} data={section.data as RisksSectionData} sources={section.sources} stale={section.stale} />;
          case "citations":
            return <CitationsSection key={key} data={section.data as CitationsSectionData} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
