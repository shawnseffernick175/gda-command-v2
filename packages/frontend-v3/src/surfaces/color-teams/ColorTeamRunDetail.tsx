import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ColorStatusPill } from './components/ColorStatusPill';
import { ColorSection } from './components/ColorSection';
import { FindingCard } from './components/FindingCard';
import { fetchRun, fetchRunFindings, fetchRunDiff } from './api';
import type { ColorTeamColor, ColorTeamFinding, DiffResult } from './types';

const COLOR_ORDER: ColorTeamColor[] = ['pink', 'red', 'black', 'blue', 'white', 'green'];

export function ColorTeamRunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const [searchParams] = useSearchParams();
  const diffAgainst = searchParams.get('diff_against');

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ['color-team-run', runId],
    queryFn: () => fetchRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'queued' || data.status === 'running')) return 2000;
      return false;
    },
  });

  const { data: findingsData } = useQuery({
    queryKey: ['color-team-findings', runId],
    queryFn: () => fetchRunFindings(runId!),
    enabled: !!runId && run?.status === 'complete',
  });

  const { data: diffData } = useQuery({
    queryKey: ['color-team-diff', runId, diffAgainst],
    queryFn: () => fetchRunDiff(runId!, diffAgainst!),
    enabled: !!runId && !!diffAgainst && run?.status === 'complete',
  });

  if (runLoading) {
    return <div className="p-8 text-sm text-ink-muted">Loading run...</div>;
  }

  if (!run) {
    return <div className="p-8 text-sm text-ink-muted">Run not found.</div>;
  }

  const findings = findingsData?.findings ?? [];
  const findingsByColor = groupByColor(findings);
  const runColors = (run.colors as ColorTeamColor[]).sort(
    (a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b)
  );

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">Color Team Run #{run.id}</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Started {new Date(run.started_at).toLocaleString()}
            {run.completed_at && ` \u2014 Completed ${new Date(run.completed_at).toLocaleString()}`}
          </p>
        </div>
        <a href="/color-teams" className="text-sm text-accent hover:underline">
          &larr; Back
        </a>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 flex-wrap">
        {runColors.map((color) => {
          const count = run.finding_counts?.find((c) => c.color === color)?.count;
          return (
            <ColorStatusPill
              key={color}
              color={color}
              status={run.status}
              findingCount={count}
            />
          );
        })}
      </div>

      {run.status === 'error' && run.error_message && (
        <div className="border-l-4 border-critical bg-surface rounded-sm p-4">
          <p className="text-sm text-critical font-medium">Error</p>
          <p className="text-sm text-ink-muted mt-1">{run.error_message}</p>
        </div>
      )}

      {run.status === 'queued' || run.status === 'running' ? (
        <div className="border border-border rounded-sm p-8 bg-surface text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="animate-spin h-4 w-4 border-2 border-accent border-t-transparent rounded-full" />
            <span className="text-sm text-ink-primary font-medium">
              {run.status === 'queued' ? 'Queued...' : 'Running analysis...'}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            Results will appear here as each color completes.
          </p>
        </div>
      ) : null}

      {/* Diff mode */}
      {diffData && (
        <DiffView diff={diffData} />
      )}

      {/* Findings by color */}
      {run.status === 'complete' && !diffData && (
        <div className="flex flex-col gap-3">
          {runColors.map((color) => (
            <ColorSection
              key={color}
              color={color}
              findings={findingsByColor[color] ?? []}
              defaultExpanded={runColors.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function groupByColor(findings: ColorTeamFinding[]): Record<string, ColorTeamFinding[]> {
  const groups: Record<string, ColorTeamFinding[]> = {};
  for (const f of findings) {
    const arr = groups[f.color] ?? [];
    arr.push(f);
    groups[f.color] = arr;
  }
  return groups;
}

function DiffView({ diff }: { diff: DiffResult }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink-primary">Diff View</h2>

      {diff.new_findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">
            New Findings ({diff.new_findings.length})
          </h3>
          <div className="flex flex-col gap-2 border-l-4 border-warning pl-3">
            {diff.new_findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}

      {diff.resolved_findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">
            Resolved ({diff.resolved_findings.length})
          </h3>
          <div className="flex flex-col gap-2 border-l-4 border-success pl-3 opacity-60">
            {diff.resolved_findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}

      {diff.regressed_findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">
            Regressed ({diff.regressed_findings.length})
          </h3>
          <div className="flex flex-col gap-2 border-l-4 border-critical pl-3">
            {diff.regressed_findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}

      {diff.unchanged_findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">
            Unchanged ({diff.unchanged_findings.length})
          </h3>
          <div className="flex flex-col gap-2 opacity-40">
            {diff.unchanged_findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
