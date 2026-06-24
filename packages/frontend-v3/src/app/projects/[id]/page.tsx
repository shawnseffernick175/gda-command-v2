"use client";

import { Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useProjectSnapshot, useProjectTrend } from "@/hooks/use-projects";
import { ProjectKpiStrip } from "@/components/projects/ProjectKpiStrip";
import { ActualVsTargetChart } from "@/components/projects/ActualVsTargetChart";
import { ProfitMarginCard } from "@/components/projects/ProfitMarginCard";
import { ItdBurnChart } from "@/components/projects/ItdBurnChart";
import { MonthlyRevenueTrend } from "@/components/projects/MonthlyRevenueTrend";
import { formatMoney } from "@/lib/format-money";

function ProjectSnapshotContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const projectKey = decodeURIComponent(params.id as string);
  const period = searchParams.get("period") ?? undefined;

  const { data, isLoading, error } = useProjectSnapshot(projectKey, period);
  const { data: trendData, isLoading: trendLoading } =
    useProjectTrend(projectKey);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-gda-panel" />
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-gda-panel" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-72 animate-pulse rounded bg-gda-panel" />
          <div className="h-72 animate-pulse rounded bg-gda-panel" />
        </div>
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="rounded border border-dashed border-border bg-gda-panel/30 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Project not found or no data for this period
          </p>
        </div>
      </div>
    );
  }

  const project = data.project;
  const trendItems = trendData?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {project.project_id ?? project.project_name}
          </h1>
          {project.project_id && (
            <span className="text-sm text-muted-foreground">
              {project.project_name}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          {project.contract_number && (
            <span>Contract: {project.contract_number}</span>
          )}
          <span>Period: {project.period}</span>
          <span>Contract Value: {formatMoney(project.itd_value)}</span>
        </div>
      </div>

      {/* KPI Strip */}
      <ProjectKpiStrip project={project} />

      {/* Charts — 2-column grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ActualVsTargetChart project={project} />
        <ProfitMarginCard project={project} />
        <ItdBurnChart project={project} />
        {trendLoading ? (
          <div className="h-72 animate-pulse rounded bg-gda-panel" />
        ) : (
          <MonthlyRevenueTrend items={trendItems} />
        )}
      </div>
    </div>
  );
}

export default function ProjectSnapshotPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl p-6">
          <div className="h-10 w-64 animate-pulse rounded bg-gda-panel" />
        </div>
      }
    >
      <ProjectSnapshotContent />
    </Suspense>
  );
}
