"use client";
/**
 * F-305: 10-section auto-analysis brief — progressive rendering with SSE.
 *
 * Each section renders as its own card. Sections stream in progressively
 * from the analysis pipeline. Stale sections show a badge. Each section
 * has a "Show trace" link scoped to that node's trace_id.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format-money";
import type {
  AnalysisSectionBase,
  AnalysisSectionId,
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
  AnalysisCitation,
} from "@/lib/types";
import { useAnalysisStream } from "@/hooks/use-analysis-stream";

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionSkeleton({ label }: { label: string }) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-ink flex items-center gap-2">
          {label}
          <span className="text-xs text-muted font-normal">Analyzing...</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  );
}

function SectionError({
  label,
  message,
}: {
  label: string;
  message: string | null | undefined;
}) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-ink">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted">
          {message ?? "Section analysis failed"}
        </p>
      </CardContent>
    </Card>
  );
}

function StaleBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[11px] font-normal border-gda-amber/40 text-gda-amber px-1.5 py-0"
    >
      Stale
    </Badge>
  );
}

function TraceLink({ traceId }: { traceId: string | null }) {
  if (!traceId) return null;
  return (
    <a
      href={`/agent/traces/${traceId}`}
      className="text-[11px] text-accent hover:underline"
    >
      Show trace
    </a>
  );
}

function CitationLink({ citation }: { citation: AnalysisCitation }) {
  const isExternal =
    citation.url.startsWith("http://") || citation.url.startsWith("https://");
  return (
    <a
      href={citation.url}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="text-[11px] text-accent hover:underline"
    >
      {citation.title}
    </a>
  );
}

function SectionWrapper({
  section,
  children,
}: {
  section: AnalysisSectionBase;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-ink flex items-center gap-2">
            {section.section_label}
            {section.stale && <StaleBadge />}
            {section.cached && (
              <span className="text-[11px] text-muted font-normal">
                cached
              </span>
            )}
          </CardTitle>
          <TraceLink traceId={section.trace_id} />
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ── Section renderers ─────────────────────────────────────────────────────────

function PwinCard({
  section,
}: {
  section: AnalysisSectionBase & { data: PwinSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  const gradeColor =
    d.grade === "Go"
      ? "text-gda-green"
      : d.grade === "Reconsider"
        ? "text-gda-amber"
        : "text-gda-red";

  return (
    <SectionWrapper section={section}>
      <div className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              gradeColor,
            )}
          >
            {d.score}%
          </span>
          <Badge
            variant="outline"
            className={cn("text-xs font-medium border-current", gradeColor)}
          >
            {d.grade}
          </Badge>
          <span className="text-[11px] text-muted ml-auto">
            {d.model_version}
          </span>
        </div>
        {d.top_factors.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted uppercase tracking-wide">
              Top Contributing Factors
            </p>
            <ul className="text-xs text-ink space-y-0.5">
              {d.top_factors.map((f, i) => (
                <li key={i}>• {f}</li>
              ))}
            </ul>
          </div>
        )}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function DoctrineCard({
  section,
}: {
  section: AnalysisSectionBase & { data: DoctrineSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-[11px] text-muted uppercase tracking-wide">
            8 Principles
          </p>
          <div className="grid gap-1">
            {d.principles.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-ink">{p.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] px-1.5 py-0 border-current",
                    p.result === "pass"
                      ? "text-gda-green"
                      : p.result === "fail"
                        ? "text-gda-red"
                        : "text-muted",
                  )}
                >
                  {p.result}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {d.exclusions.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted uppercase tracking-wide">
              6 Exclusions
            </p>
            <div className="grid gap-1">
              {d.exclusions.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-ink truncate mr-2">{e.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px] px-1.5 py-0 border-current whitespace-nowrap",
                      e.result === "pass"
                        ? "text-gda-green"
                        : e.result === "fail"
                          ? "text-gda-red"
                          : "text-muted",
                    )}
                  >
                    {e.result}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Margin floor ({d.margin_floor.threshold}%):</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] px-1.5 py-0 border-current",
              d.margin_floor.passed ? "text-gda-green" : "text-gda-red",
            )}
          >
            {d.margin_floor.passed ? "pass" : "fail"}
          </Badge>
          {d.margin_floor.margin_pct != null && (
            <span className="text-muted tabular-nums">
              ({d.margin_floor.margin_pct}%)
            </span>
          )}
        </div>

        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function IncumbentCard({
  section,
}: {
  section: AnalysisSectionBase & { data: IncumbentSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        <div className="text-sm text-ink font-medium">
          {d.company_name ?? (
            <span className="text-muted italic">Pending enrichment</span>
          )}
        </div>
        {d.contract_number && (
          <p className="text-xs text-muted">Contract: {d.contract_number}</p>
        )}
        {d.ceiling != null && (
          <p className="text-xs text-muted">
            Ceiling: {formatMoney(d.ceiling)}
          </p>
        )}
        {d.end_date && (
          <p className="text-xs text-muted">End date: {d.end_date}</p>
        )}
        {d.performance_signals.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[11px] text-muted uppercase tracking-wide">
              Performance Signals
            </p>
            {d.performance_signals.map((s, i) => (
              <p key={i} className="text-xs text-ink">
                • {s}
              </p>
            ))}
          </div>
        )}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function SimilarAwardsCard({
  section,
}: {
  section: AnalysisSectionBase & { data: SimilarAwardsSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        {d.awards.length === 0 ? (
          <p className="text-xs text-muted italic">
            No similar awards found for this agency/NAICS combination
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.awards.map((a, i) => (
              <div key={i} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-ink truncate">
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                  </span>
                  {a.value != null && (
                    <span className="text-xs text-muted tabular-nums whitespace-nowrap">
                      {formatMoney(a.value)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted">
                  {[a.agency, a.awardee, a.date].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function CompetitorsCard({
  section,
}: {
  section: AnalysisSectionBase & { data: CompetitorsSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  const threatColor = (level: string) =>
    level === "high"
      ? "text-gda-red"
      : level === "medium"
        ? "text-gda-amber"
        : "text-gda-green";

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        {d.competitors.length === 0 ? (
          <p className="text-xs text-muted italic">
            Insufficient data to identify competitors
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.competitors.map((c, i) => (
              <div
                key={i}
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-medium text-ink">{c.name}</span>
                  {c.cleared != null && (
                    <span className="text-[11px] text-muted ml-2">
                      {c.cleared ? "Cleared" : "Uncleared"}
                    </span>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] px-1.5 py-0 border-current",
                    threatColor(c.threat_level),
                  )}
                >
                  {c.threat_level}
                </Badge>
              </div>
            ))}
          </div>
        )}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function DecisionFactorsCard({
  section,
}: {
  section: AnalysisSectionBase & { data: DecisionFactorsSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        {d.evaluation_method && (
          <div className="text-xs">
            <span className="text-muted">Evaluation: </span>
            <span className="text-ink">{d.evaluation_method}</span>
          </div>
        )}
        {d.past_performance_weight && (
          <div className="text-xs">
            <span className="text-muted">Past performance: </span>
            <span className="text-ink">{d.past_performance_weight}</span>
          </div>
        )}
        {d.key_personnel_requirements && (
          <div className="text-xs">
            <span className="text-muted">Key personnel: </span>
            <span className="text-ink">{d.key_personnel_requirements}</span>
          </div>
        )}
        {!d.evaluation_method &&
          !d.past_performance_weight &&
          !d.key_personnel_requirements &&
          d.other_factors.length === 0 && (
            <p className="text-xs text-muted italic">
              Decision factors not yet identified from available data
            </p>
          )}
        {d.other_factors.map((f, i) => (
          <p key={i} className="text-xs text-ink">
            • {f}
          </p>
        ))}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function TeamingCard({
  section,
}: {
  section: AnalysisSectionBase & { data: TeamingSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        {d.opportunities.length === 0 ? (
          <p className="text-xs text-muted italic">
            No teaming opportunities identified — Envision can pursue solo
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.opportunities.map((o, i) => (
              <div key={i} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-ink">
                    {o.partner}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[11px] px-1.5 py-0 text-muted border-border"
                  >
                    {o.ou}
                  </Badge>
                  {o.cert_leverage && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-1.5 py-0 text-accent border-accent/30"
                    >
                      {o.cert_leverage}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted mt-0.5">{o.rationale}</p>
              </div>
            ))}
          </div>
        )}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function WinThemesCard({
  section,
}: {
  section: AnalysisSectionBase & { data: WinThemesSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        {d.themes.map((t, i) => (
          <div key={i} className="space-y-0.5">
            <p className="text-xs text-ink">{t.theme}</p>
            {t.doctrine_anchor && (
              <p className="text-[11px] text-muted italic">
                {t.doctrine_anchor}
              </p>
            )}
          </div>
        ))}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function RisksCard({
  section,
}: {
  section: AnalysisSectionBase & { data: RisksSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  const severityColor = (s: string) =>
    s === "HIGH"
      ? "bg-gda-red"
      : s === "MED"
        ? "bg-gda-amber"
        : "bg-gda-green";

  return (
    <SectionWrapper section={section}>
      <div className="space-y-2">
        {d.risks.map((r, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  severityColor(r.severity),
                )}
              />
              <span className="text-xs font-medium text-ink">{r.title}</span>
              <span className="text-[11px] text-muted">{r.severity}</span>
            </div>
            <p className="text-[11px] text-muted pl-4">{r.description}</p>
            {r.mitigation && (
              <p className="text-[11px] text-ink pl-4">
                Mitigation: {r.mitigation}
              </p>
            )}
          </div>
        ))}
        {d.citations.map((c, i) => (
          <CitationLink key={i} citation={c} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function CitationsCard({
  section,
}: {
  section: AnalysisSectionBase & { data: CitationsSectionData | null };
}) {
  const d = section.data;
  if (!d) return <SectionSkeleton label={section.section_label} />;

  return (
    <SectionWrapper section={section}>
      <div className="space-y-1">
        {d.all_citations.length === 0 ? (
          <p className="text-xs text-muted italic">No citations collected</p>
        ) : (
          d.all_citations.map((c, i) => (
            <div key={i}>
              <CitationLink citation={c} />
            </div>
          ))
        )}
      </div>
    </SectionWrapper>
  );
}

// ── Section router ────────────────────────────────────────────────────────────

function AnalysisSectionCard({
  sectionId,
  section,
}: {
  sectionId: AnalysisSectionId;
  section: AnalysisSectionBase & { data: unknown };
}) {
  if (section.status === "pending" || section.status === "running") {
    return <SectionSkeleton label={section.section_label} />;
  }
  if (section.status === "error") {
    return (
      <SectionError
        label={section.section_label}
        message={section.error_message}
      />
    );
  }

  switch (sectionId) {
    case "pwin":
      return (
        <PwinCard
          section={
            section as AnalysisSectionBase & { data: PwinSectionData | null }
          }
        />
      );
    case "doctrine":
      return (
        <DoctrineCard
          section={
            section as AnalysisSectionBase & {
              data: DoctrineSectionData | null;
            }
          }
        />
      );
    case "incumbent":
      return (
        <IncumbentCard
          section={
            section as AnalysisSectionBase & {
              data: IncumbentSectionData | null;
            }
          }
        />
      );
    case "similar_awards":
      return (
        <SimilarAwardsCard
          section={
            section as AnalysisSectionBase & {
              data: SimilarAwardsSectionData | null;
            }
          }
        />
      );
    case "competitors":
      return (
        <CompetitorsCard
          section={
            section as AnalysisSectionBase & {
              data: CompetitorsSectionData | null;
            }
          }
        />
      );
    case "decision_factors":
      return (
        <DecisionFactorsCard
          section={
            section as AnalysisSectionBase & {
              data: DecisionFactorsSectionData | null;
            }
          }
        />
      );
    case "teaming":
      return (
        <TeamingCard
          section={
            section as AnalysisSectionBase & {
              data: TeamingSectionData | null;
            }
          }
        />
      );
    case "win_themes":
      return (
        <WinThemesCard
          section={
            section as AnalysisSectionBase & {
              data: WinThemesSectionData | null;
            }
          }
        />
      );
    case "risks":
      return (
        <RisksCard
          section={
            section as AnalysisSectionBase & { data: RisksSectionData | null }
          }
        />
      );
    case "citations":
      return (
        <CitationsCard
          section={
            section as AnalysisSectionBase & {
              data: CitationsSectionData | null;
            }
          }
        />
      );
    default:
      return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnalysisBrief({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const stream = useAnalysisStream(opportunityId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">
          Decision Brief
        </h3>
        {stream.status === "streaming" && (
          <span className="text-[11px] text-muted">Analyzing...</span>
        )}
        {stream.status === "done" && stream.cached && (
          <span className="text-[11px] text-muted">From cache</span>
        )}
        {stream.status === "error" && (
          <span className="text-[11px] text-gda-red">
            {stream.error ?? "Analysis failed"}
          </span>
        )}
      </div>

      {stream.sectionOrder.map((sid) => {
        const section = stream.sections[sid];
        if (!section) {
          return (
            <SectionSkeleton
              key={sid}
              label={stream.sectionLabels[sid]}
            />
          );
        }
        return (
          <AnalysisSectionCard
            key={sid}
            sectionId={sid}
            section={section}
          />
        );
      })}
    </div>
  );
}
