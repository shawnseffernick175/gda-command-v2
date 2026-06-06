"use client";

import { Suspense, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useOpportunitiesPaged, useOpportunity, useAnalyzeOpportunity, useUpdateStage } from "@/hooks/use-opportunities";
import { useAskAi } from "@/hooks/use-llm";
import { Pagination } from "@/components/shared/Pagination";
import { BandBadge } from "@/components/band-badge";
import { ScoreDisplay } from "@/components/score-display";
import { SourceChip } from "@/components/shared/source-chip";
import { StageDropdown } from "@/components/shared/stage-dropdown";
import { ErrorState } from "@/components/shared/error-state";
import { OpportunityCard } from "@/components/OpportunityCard";
import { useVaultDocuments } from "@/hooks/use-vault";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type {
  DoctrineFitLabel,
  LlmAnalysis,
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

type ViewMode = "cards" | "table";

function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "cards";
  const saved = localStorage.getItem("opp_view_mode");
  return saved === "table" ? "table" : "cards";
}

function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(getInitialViewMode);
  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
    localStorage.setItem("opp_view_mode", m);
  }, []);
  return [mode, setMode];
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded border border-border overflow-hidden text-xs font-mono">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "px-2.5 py-1 transition-colors",
          mode === "table" ? "bg-gda-green/15 text-gda-green" : "text-muted-foreground hover:bg-gda-panel"
        )}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "px-2.5 py-1 transition-colors",
          mode === "cards" ? "bg-gda-green/15 text-gda-green" : "text-muted-foreground hover:bg-gda-panel"
        )}
      >
        Cards
      </button>
    </div>
  );
}

function OpportunityList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get("page") ?? "1") || 1;
  const [viewMode, setViewMode] = useViewMode();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [dueSoonFilter, setDueSoonFilter] = useState(false);
  const [dueBefore, setDueBefore] = useState<string | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useOpportunitiesPaged({
    q: debouncedQ || undefined,
    grade: gradeFilter || undefined,
    department: departmentFilter || undefined,
    due_before: dueBefore,
    limit: 100,
    page: currentPage,
  });

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const setPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(page));
      }
      router.push(`${pathname}?${params.toString()}`);
      listRef.current?.scrollIntoView({ behavior: "smooth" });
    },
    [searchParams, router, pathname],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQ(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedQ(val);
        setPage(1);
      }, 350);
    },
    [setPage],
  );

  const handleGradeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setGradeFilter(e.target.value);
      setPage(1);
    },
    [setPage],
  );

  const handleDepartmentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDepartmentFilter(e.target.value);
      setPage(1);
    },
    [setPage],
  );

  const handleDepartmentClick = useCallback(
    (dept: string) => {
      setDepartmentFilter(dept);
      setPage(1);
    },
    [setPage],
  );

  const handleDueSoonChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setDueSoonFilter(checked);
      setDueBefore(
        checked
          ? new Date(Date.now() + 14 * 86400 * 1000).toISOString()
          : undefined,
      );
      setPage(1);
    },
    [setPage],
  );

  const handleClearFilters = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ("");
    setDebouncedQ("");
    setGradeFilter("");
    setDepartmentFilter("");
    setDueSoonFilter(false);
    setDueBefore(undefined);
    setPage(1);
  }, [setPage]);

  return (
    <div className="space-y-4" ref={listRef}>
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Opportunities
        </h1>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
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
        <select
          value={departmentFilter}
          onChange={handleDepartmentChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          <option value="">All Departments</option>
          <option value="Department of Defense">Department of Defense</option>
          <option value="Department of Homeland Security">Department of Homeland Security</option>
          <option value="Department of Veterans Affairs">Department of Veterans Affairs</option>
          <option value="Department of Health and Human Services">Department of Health and Human Services</option>
          <option value="Department of Energy">Department of Energy</option>
          <option value="Department of Justice">Department of Justice</option>
          <option value="Department of State">Department of State</option>
          <option value="Department of Treasury">Department of Treasury</option>
          <option value="Department of Transportation">Department of Transportation</option>
          <option value="Department of Commerce">Department of Commerce</option>
          <option value="Department of Labor">Department of Labor</option>
          <option value="Department of Education">Department of Education</option>
          <option value="Department of Agriculture">Department of Agriculture</option>
          <option value="Independent Agency">Independent Agency</option>
        </select>
        {(debouncedQ || gradeFilter || departmentFilter || dueSoonFilter) && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {total.toLocaleString()} results
        </span>
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && !items.length ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 bg-gda-panel" />
          ))}
        </div>
      ) : viewMode === "cards" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((opp) => (
              <OpportunityCard key={opp.internal_id} opp={opp} />
            ))}
          </div>
          {items.length === 0 && !isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No opportunities match your filter.
            </div>
          )}
        </>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Department</th>
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Grade/Band</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium">Doctrine</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {items.map((opp) => {
                const deadlineWarning = opp.deadline_warning === true;
                return (
                  <tr
                    key={opp.internal_id}
                    className="border-b border-border hover:bg-gda-panel/50 transition-colors h-9"
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/opportunities?id=${opp.id}`}
                          className="text-foreground hover:text-gda-green truncate block max-w-xs"
                        >
                          {opp.title}
                        </Link>
                        {deadlineWarning && (
                          <span className="shrink-0 rounded bg-red-500/15 border border-red-500/40 px-1 py-0.5 text-[11px] font-mono font-bold uppercase text-red-400">
                            DEADLINE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDepartmentClick(opp.department ?? "Independent Agency");
                        }}
                        className="hover:text-gda-green transition-colors text-left"
                        title={`Filter by ${opp.department ?? "Independent Agency"}`}
                      >
                        {opp.department ?? "Independent Agency"}
                      </button>
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
                        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground animate-pulse">Analyzing…</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-left">
                      {opp.doctrine_badge ? (
                        <span className={`text-[11px] font-mono capitalize ${FIT_COLORS[opp.doctrine_badge.label]}`}>
                          {opp.doctrine_badge.label}
                        </span>
                      ) : opp.doctrine_score != null ? (
                        <span className="text-[11px] font-mono text-gda-cyan">
                          {opp.doctrine_score}pt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground animate-pulse">Analyzing…</span>
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
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && !isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No opportunities match your filter.
            </div>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

const FIT_COLORS: Record<DoctrineFitLabel, string> = {
  strong: "text-gda-green",
  moderate: "text-gda-cyan",
  weak: "text-gda-amber",
  none: "text-muted-foreground",
};

// ─── Stage constants ─────────────────────────────────────────────────────────
const STAGES = ["Interest", "Qualified", "Capture", "Proposal", "Won"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_ACTIONS: Record<string, Array<{ label: string; stage?: string }>> = {
  Interest: [
    { label: "Qualify", stage: "Qualified" },
    { label: "No-Bid", stage: "No-Bid" },
    { label: "Add to Watch List" },
  ],
  Qualified: [
    { label: "Start Capture", stage: "Capture" },
    { label: "Request More Info" },
    { label: "No-Bid", stage: "No-Bid" },
  ],
  Capture: [
    { label: "Start Proposal", stage: "Proposal" },
    { label: "Run Color Team" },
    { label: "No-Bid", stage: "No-Bid" },
  ],
  Proposal: [
    { label: "Submit", stage: "Won" },
    { label: "Request Extension" },
    { label: "Withdraw", stage: "Lost" },
  ],
};

const SUGGESTION_CHIPS = [
  "What's Envision's win angle?",
  "Who are the likely evaluators?",
  "What FAR clauses apply?",
  "Draft an executive summary",
];

function OpportunityDetail({ id }: { id: string }) {
  const { data: opp, isLoading, error } = useOpportunity(id);
  const analyzeOpp = useAnalyzeOpportunity();
  const updateStage = useUpdateStage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-gda-panel" />
        <div className="grid gap-4 lg:grid-cols-[55%_45%]">
          <Skeleton className="h-60 bg-gda-panel" />
          <Skeleton className="h-60 bg-gda-panel" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  if (!opp) return null;

  const llm = opp.llm_analysis as LlmAnalysis | null | undefined;
  const currentStage = opp.stage ?? "Interest";
  const timeline = opp.analysis?.timeline;
  const doctrine = opp.doctrine_badge;
  const doctrineScore = opp.doctrine_score;

  return (
    <div className="space-y-4">
      {/* ─── Header Strip ─────────────────────────────────────────────── */}
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

        {/* Stage Stepper */}
        <div className="mt-3 flex items-center gap-1">
          {STAGES.map((stage, idx) => {
            const stageIdx = STAGES.indexOf(currentStage as Stage);
            const isCurrent = stage === currentStage;
            const isCompleted = idx < stageIdx;
            return (
              <div key={stage} className="flex items-center gap-1">
                {idx > 0 && (
                  <div className={cn("h-px w-6", isCompleted || isCurrent ? "bg-gda-green" : "bg-border")} />
                )}
                <button
                  type="button"
                  onClick={() => updateStage.mutate({ id, stage })}
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-mono transition-colors",
                    isCurrent && "text-gda-green font-bold",
                    isCompleted && "text-gda-green",
                    !isCurrent && !isCompleted && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-[11px]">{isCompleted || isCurrent ? "●" : "○"}</span>
                  {stage}
                </button>
              </div>
            );
          })}
        </div>

        {/* Badge strip */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {opp.agency && (
            <Badge variant="outline" className="text-xs">{opp.agency}</Badge>
          )}
          {opp.naics && (
            <Badge variant="outline" className="text-xs font-mono">NAICS {opp.naics}</Badge>
          )}
          {opp.set_aside && (
            <Badge variant="outline" className="text-xs">{opp.set_aside}</Badge>
          )}
          {opp.source && <SourceChip label={opp.source} kind="real" />}
          <DueCountdown dueDate={opp.response_deadline ?? opp.due_date} />
        </div>
      </div>

      <Separator className="bg-border" />

      {/* ─── Two-Column Layout ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[55%_1fr]">
        {/* ═══ COLUMN A ═══ */}
        <div className="space-y-4">
          {/* Decision Brief */}
          <DecisionBriefPanel llm={llm} oppId={id} analyzing={analyzeOpp.isPending} onAnalyze={() => analyzeOpp.mutate(id)} />

          {/* Competitive Intelligence */}
          <CompetitiveIntelPanel llm={llm} incumbent={opp.pwin?.incumbent_competitor} />

          {/* Risks */}
          <RisksPanel llm={llm} />

          {/* Ask AI — inline, always open */}
          <AskAiInline id={id} title={opp.title} agency={opp.agency} pwin={opp.pwin?.score} />
        </div>

        {/* ═══ COLUMN B ═══ */}
        <div className="space-y-4">
          {/* Metadata Rail */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <MetaRow label="Value" value={formatMoney(opp.value)} mono />
              <MetaRow label="Solicitation" value={opp.solicitation_number ?? "—"} mono />
              <MetaRow label="Posted" value={opp.posted_at ? new Date(opp.posted_at).toLocaleDateString() : "—"} />
              <MetaRow label="Set-Aside" value={opp.set_aside ?? "None"} />
              <MetaRow label="Place" value={opp.place_of_performance ?? "—"} />
              <MetaRow label="NAICS" value={opp.naics ?? "—"} mono />
              <MetaRow label="Source" value={opp.source ?? "—"} />
              {/* Doctrine Fit — demoted to one line */}
              {(doctrine || doctrineScore != null) && (
                <MetaRow
                  label="Doctrine Fit"
                  value={doctrine ? `${doctrine.label} ${Math.round((doctrine.score / 100) * 40)}/40` : `${doctrineScore}/40`}
                  className={doctrine ? FIT_COLORS[doctrine.label] : "text-gda-cyan"}
                />
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <TimelineEntry label="Posted" date={opp.posted_at} filled />
              <TimelineEntry label="RFP Release" date={timeline?.rfp_release ?? opp.posted_at} filled />
              <TimelineEntry
                label="Proposals Due"
                date={timeline?.proposals_due ?? opp.response_deadline}
                filled={!!(timeline?.proposals_due ?? opp.response_deadline)}
                urgent={isUrgent(timeline?.proposals_due ?? opp.response_deadline)}
              />
              <TimelineEntry label="Award Estimate" date={timeline?.award_estimate} filled={false} />
            </CardContent>
          </Card>

          {/* Stage Actions */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Next Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Current: <span className="text-gda-green font-mono">{currentStage}</span>
              </p>
              <div className="space-y-1">
                {(STAGE_ACTIONS[currentStage] ?? []).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => action.stage && updateStage.mutate({ id, stage: action.stage })}
                    disabled={updateStage.isPending}
                    className="block w-full text-left rounded border border-border px-3 py-1.5 text-xs font-mono text-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors disabled:opacity-50"
                  >
                    → {action.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Vault Documents */}
          <VaultDocumentsSection opportunityId={Number(id)} />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DueCountdown({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return <span className="font-mono text-xs font-bold text-gda-red">PAST DUE</span>;
  }
  if (diffDays <= 7) {
    return (
      <span className="flex items-center gap-1 font-mono text-xs font-bold text-gda-red">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gda-red animate-pulse" />
        {diffDays}d remaining
      </span>
    );
  }
  if (diffDays <= 30) {
    return <span className="font-mono text-xs text-gda-amber">{diffDays}d remaining</span>;
  }
  return <span className="font-mono text-xs text-muted-foreground">{due.toLocaleDateString()}</span>;
}

function isUrgent(date?: string | null): boolean {
  if (!date) return false;
  const diff = new Date(date).getTime() - Date.now();
  return diff > 0 && diff <= 7 * 86400 * 1000;
}

const SHIPLEY_DIMENSIONS: Array<{
  key: keyof import("@/lib/types").ShipleyBidNoBid;
  label: string;
}> = [
  { key: "customer_knowledge", label: "Customer Knowledge" },
  { key: "solution_match", label: "Solution Match" },
  { key: "competitive_position", label: "Competitive Position" },
  { key: "past_performance", label: "Past Performance" },
];

const BID_BADGE_COLORS: Record<string, string> = {
  Bid: "bg-gda-green/20 border-gda-green text-gda-green",
  "No Bid": "bg-gda-red/10 border-gda-red text-gda-red",
  Conditional: "bg-gda-amber/10 border-gda-amber text-gda-amber",
};

function DecisionBriefPanel({
  llm,
  analyzing,
  onAnalyze,
}: {
  llm?: LlmAnalysis | null;
  oppId: string;
  analyzing: boolean;
  onAnalyze: () => void;
}) {
  if (!llm) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Decision Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-xs text-muted-foreground mb-3 font-mono">
            {analyzing ? "Analysis running..." : "Analysis not yet available"}
          </p>
          {!analyzing && (
            <button
              type="button"
              onClick={onAnalyze}
              className="rounded border border-gda-green/40 px-3 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/10 transition-colors"
            >
              Run Analysis
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  const bidRec = llm.bid_recommendation ?? llm.shipley_bid_no_bid.overall;
  const bidColor = BID_BADGE_COLORS[bidRec] ?? "border-border text-muted-foreground";
  const pwinScore = llm.win_probability;
  const pwinColor = pwinScore >= 70 ? "text-gda-green" : pwinScore >= 40 ? "text-gda-amber" : "text-gda-red";

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Decision Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendation badge */}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Recommendation</p>
          <Badge className={cn("text-sm font-mono font-bold px-3 py-1 border", bidColor)}>
            {bidRec}
          </Badge>
        </div>

        {/* Executive summary */}
        {llm.executive_summary && (
          <p className="text-xs text-foreground leading-relaxed">
            {llm.executive_summary}
          </p>
        )}

        {/* Win Probability */}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Win Probability</p>
          <div className="flex items-baseline gap-2">
            <span className={cn("font-mono text-4xl font-bold", pwinColor)}>
              {pwinScore}%
            </span>
          </div>
          {llm.win_probability_reasoning && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {llm.win_probability_reasoning}
            </p>
          )}
        </div>

        {/* Shipley Dimensions */}
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase mb-2">Shipley Dimensions</p>
          <div className="space-y-1.5">
            {SHIPLEY_DIMENSIONS.map((dim) => {
              const d = llm.shipley_bid_no_bid[dim.key] as ShipleyDimension | undefined;
              if (!d) return null;
              return (
                <div key={dim.key} className="flex items-center gap-2 text-xs">
                  <span className="w-40 text-muted-foreground">{dim.label}</span>
                  <span className="font-mono text-foreground w-10">{d.score}/10</span>
                  <div className="flex-1 h-1.5 rounded bg-gda-panel overflow-hidden border border-border">
                    <div
                      className="h-full rounded bg-gda-green"
                      style={{ width: `${d.score * 10}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompetitiveIntelPanel({
  llm,
  incumbent,
}: {
  llm?: LlmAnalysis | null;
  incumbent?: string | null;
}) {
  const competitors = llm?.competitive_landscape ?? [];

  if (!llm) return null;

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Competitive Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {competitors.length > 0 ? (
          <>
            <div>
              <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Likely Competitors</p>
              <div className="space-y-1">
                {competitors.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-foreground whitespace-nowrap font-medium">
                      {c.name}
                    </span>
                    {c.threat_level && (
                      <Badge variant="outline" className={cn(
                        "text-[11px]",
                        c.threat_level === "high" && "text-gda-red border-gda-red/30",
                        c.threat_level === "medium" && "text-gda-amber border-gda-amber/30",
                        c.threat_level === "low" && "text-gda-cyan border-gda-cyan/30",
                      )}>
                        {c.threat_level}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{c.our_differentiator}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Competitive landscape not yet analyzed
          </p>
        )}
        {incumbent && (
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase mb-1">Incumbent</p>
            <span className="text-xs text-foreground font-mono">{incumbent}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RISK_LEVEL_COLORS: Record<string, string> = {
  HIGH: "bg-gda-red/10 text-gda-red border-gda-red/30",
  MED: "bg-gda-amber/10 text-gda-amber border-gda-amber/30",
  LOW: "bg-gda-cyan/10 text-gda-cyan border-gda-cyan/30",
};

function RisksPanel({ llm }: { llm?: LlmAnalysis | null }) {
  const risks = llm?.risks ?? [];

  if (!llm) return null;
  if (risks.length === 0) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Risks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No risks analyzed yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Risks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {risks.map((risk, i) => (
          <div key={i} className="text-xs space-y-0.5">
            <div className="flex items-start gap-2">
              <Badge className={cn("text-[11px] font-mono border shrink-0", RISK_LEVEL_COLORS[risk.level] ?? "text-muted-foreground")}>
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
                className="ml-12 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-mono text-gda-cyan hover:border-gda-cyan/40 transition-colors"
              >
                {risk.regulatory_citation}
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetaRow({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && "font-mono", className ?? "text-foreground")}>{value}</span>
    </div>
  );
}

function TimelineEntry({ label, date, filled, urgent }: { label: string; date?: string | null; filled?: boolean; urgent?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn("text-[11px]", filled ? "text-gda-green" : "text-muted-foreground")}>
        {filled ? "●" : "○"}
      </span>
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className={cn(
        "font-mono",
        urgent ? "text-gda-red font-bold" : "text-foreground"
      )}>
        {date ? new Date(date).toLocaleDateString() : "—"}
      </span>
    </div>
  );
}

function AskAiInline({ id, title, agency, pwin }: { id: string; title: string; agency: string | null; pwin?: number | null }) {
  const [question, setQuestion] = useState("");
  const askAi = useAskAi();

  function handleAsk(q?: string) {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    askAi.mutate({
      question: text,
      object_type: "opportunity",
      object_id: id,
      context: { title, agency, pwin },
    });
  }

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Analyst Q&A
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors"
              onClick={() => { setQuestion(chip); handleAsk(chip); }}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask about this opportunity..."
            className="flex-1 rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleAsk()}
            disabled={askAi.isPending || !question.trim()}
            className="rounded bg-gda-green/20 border border-gda-green/40 px-3 py-1 text-xs font-mono text-gda-green hover:bg-gda-green/30 transition-colors disabled:opacity-50"
          >
            {askAi.isPending ? "..." : "Send"}
          </button>
        </div>
        {askAi.data && (
          <div className="rounded border border-border bg-gda-bg-base p-3 text-xs text-foreground whitespace-pre-wrap">
            {askAi.data.ok && askAi.data.output
              ? String((askAi.data.output as Record<string, unknown>).answer ?? JSON.stringify(askAi.data.output, null, 2))
              : <span className="text-muted-foreground italic">Processing...</span>}
          </div>
        )}
        {askAi.error && (
          <p className="text-[11px] text-gda-red">{(askAi.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function VaultDocumentsSection({ opportunityId }: { opportunityId: number }) {
  const { data } = useVaultDocuments({ limit: 100 });
  const linkedDocs = (data?.items ?? []).filter(
    (d) => d.linked_opportunity_id === opportunityId,
  );

  if (linkedDocs.length === 0) return null;

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {linkedDocs.map((doc) => (
          <Link
            key={doc.id}
            href={`/vault?doc=${doc.id}`}
            className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2 text-xs hover:border-gda-cyan/40 transition-colors"
          >
            <span className="font-mono text-foreground">{doc.filename}</span>
            <span className="text-muted-foreground">{doc.doc_type}</span>
            {doc.ai_summary && (
              <span className="text-muted-foreground truncate max-w-[200px]">{doc.ai_summary}</span>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
