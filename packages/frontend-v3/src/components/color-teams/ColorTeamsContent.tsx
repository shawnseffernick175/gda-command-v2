"use client";

import { useState, useMemo } from "react";
import {
  useColorTeamDocuments,
  useColorTeamDocumentRuns,
  useColorTeamRun,
  useColorTeamFindings,
  useColorTeamDiff,
  useExportColorTeamPdf,
} from "@/hooks/use-color-teams";
import { RunModal } from "./RunModal";
import { StatusPills } from "./StatusPills";
import { FindingCard } from "./FindingCard";
import { DoctrineScorecardPanel } from "./DoctrineScorecardPanel";
import type {
  ColorTeamFinding,
  ColorTeamRun,
} from "@/lib/types";

const COLOR_LABELS: Record<string, string> = {
  pink: "Pink - Storyboard Review",
  red: "Red - Proposal Evaluation",
  black: "Black Hat - Competitor Simulation",
  blue: "Blue - Customer Perspective",
  white: "White - Compliance Sweep",
  green: "Green - Executive / Final Pass",
};

const COLOR_BAR_CLASSES: Record<string, string> = {
  pink: "border-l-pink-400",
  red: "border-l-gda-red",
  black: "border-l-zinc-400",
  blue: "border-l-blue-400",
  white: "border-l-gray-300",
  green: "border-l-gda-green",
};

export function ColorTeamsContent() {
  const [showModal, setShowModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState(false);
  const [diffRunId, setDiffRunId] = useState<number | null>(null);

  const { data: docsData, isLoading: docsLoading } = useColorTeamDocuments({ limit: 100 });
  const { data: runsData } = useColorTeamDocumentRuns(selectedDocId ?? undefined);
  const { data: runDetail, isLoading: runLoading } = useColorTeamRun(selectedRunId ?? undefined);
  const { data: findingsData } = useColorTeamFindings(
    selectedRunId ?? undefined,
    activeColor ?? undefined,
  );
  const { data: diffData } = useColorTeamDiff(
    diffMode && selectedRunId ? selectedRunId : undefined,
    diffMode && diffRunId ? diffRunId : undefined,
  );
  const exportPdf = useExportColorTeamPdf();

  const findings = useMemo(() => findingsData?.findings ?? [], [findingsData]);
  const runs = useMemo(() => runsData?.runs ?? [], [runsData]);

  const priorRuns = useMemo(
    () => runs.filter((r: ColorTeamRun) => r.id !== selectedRunId),
    [runs, selectedRunId],
  );

  const findingsByColor = useMemo(() => {
    const map = new Map<string, ColorTeamFinding[]>();
    for (const f of findings) {
      const arr = map.get(f.color) ?? [];
      arr.push(f);
      map.set(f.color, arr);
    }
    return map;
  }, [findings]);

  const greenDoctrineData = useMemo(() => {
    const greenFindings = findingsByColor.get("green") ?? [];
    const f = greenFindings.find(
      (gf) =>
        gf.margin_check ||
        gf.pricing_strategy ||
        (gf.doctrine_score && gf.doctrine_score.length > 0),
    );
    if (!f) return null;
    return {
      doctrineScores: f.doctrine_score ?? [],
      marginCheck: f.margin_check,
      exclusionHits: f.exclusion_hits,
      pricingStrategy: f.pricing_strategy,
    };
  }, [findingsByColor]);

  function handleRunCreated(runId: number) {
    setSelectedRunId(runId);
    setShowModal(false);
    setActiveColor(null);
    setDiffMode(false);
  }

  function handleSelectDoc(docId: number) {
    setSelectedDocId(docId);
    setSelectedRunId(null);
    setActiveColor(null);
    setDiffMode(false);
  }

  function handleSelectRun(runId: number) {
    setSelectedRunId(runId);
    setActiveColor(null);
    setDiffMode(false);
  }

  const colorsInRun = runDetail?.colors ?? [];

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold text-foreground">
            Color Team Reviews
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a document, run a multi-color Shipley review, and track findings
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded bg-gda-green px-4 py-1.5 text-sm font-medium text-gda-bg-deep hover:bg-gda-green/90"
        >
          Run Color Team
        </button>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar: documents + runs */}
        <div className="w-64 shrink-0 space-y-4">
          {/* Documents list */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Documents
            </h3>
            {docsLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {docsData?.items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No documents uploaded yet. Use Run Color Team to upload.
              </p>
            )}
            <div className="space-y-0.5">
              {docsData?.items.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleSelectDoc(d.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    selectedDocId === d.id
                      ? "bg-gda-panel text-gda-green"
                      : "text-muted-foreground hover:bg-gda-panel hover:text-foreground"
                  }`}
                >
                  <span className="block truncate font-medium">{d.filename}</span>
                  <span className="text-[11px] text-muted-foreground">{d.doc_type}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Runs list */}
          {selectedDocId && runs.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Runs
              </h3>
              <div className="space-y-0.5">
                {runs.map((r: ColorTeamRun) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRun(r.id)}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      selectedRunId === r.id
                        ? "bg-gda-panel text-gda-green"
                        : "text-muted-foreground hover:bg-gda-panel hover:text-foreground"
                    }`}
                  >
                    <span className="block font-mono">Run #{r.id}</span>
                    <span className="text-[11px]">
                      {r.status} {"\u00B7"} {r.colors.length} colors
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="min-w-0 flex-1">
          {!selectedRunId && (
            <div className="flex h-64 items-center justify-center rounded border border-border bg-gda-panel">
              <p className="text-sm text-muted-foreground">
                {selectedDocId
                  ? "Select a run or start a new Color Team review"
                  : "Select a document to view its runs, or start a new review"}
              </p>
            </div>
          )}

          {selectedRunId && runDetail && (
            <div className="space-y-4">
              {/* Run header */}
              <div className="rounded border border-border bg-gda-panel p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Run #{runDetail.id}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Started {new Date(runDetail.started_at).toLocaleString()}
                      {runDetail.completed_at &&
                        ` \u2014 Completed ${new Date(runDetail.completed_at).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {priorRuns.length > 0 && (
                      <button
                        onClick={() => {
                          setDiffMode(!diffMode);
                          if (!diffMode && priorRuns.length > 0) {
                            setDiffRunId(priorRuns[0].id);
                          }
                        }}
                        className={`rounded border px-2 py-0.5 text-xs ${
                          diffMode
                            ? "border-gda-green/40 bg-gda-green/10 text-gda-green"
                            : "border-border text-muted-foreground hover:bg-gda-panel-alt"
                        }`}
                      >
                        Diff Mode
                      </button>
                    )}
                    <button
                      onClick={() => exportPdf.mutate(runDetail.id)}
                      disabled={exportPdf.isPending}
                      className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-gda-panel-alt hover:text-foreground"
                    >
                      {exportPdf.isPending ? "Exporting..." : "Export PDF"}
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <StatusPills run={runDetail} />
                </div>
                {runDetail.error_message && (
                  <p className="mt-2 text-xs text-gda-red">
                    {runDetail.error_message}
                  </p>
                )}
              </div>

              {/* Diff selector */}
              {diffMode && priorRuns.length > 0 && (
                <div className="flex items-center gap-2 rounded border border-border bg-gda-panel p-2">
                  <span className="text-xs text-muted-foreground">
                    Compare against:
                  </span>
                  <select
                    value={diffRunId ?? ""}
                    onChange={(e) => setDiffRunId(Number(e.target.value))}
                    className="rounded border border-border bg-gda-bg-raised px-2 py-0.5 text-xs text-foreground"
                  >
                    {priorRuns.map((r: ColorTeamRun) => (
                      <option key={r.id} value={r.id}>
                        Run #{r.id} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Loading state */}
              {runLoading && (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Loading run details...</p>
                </div>
              )}

              {/* Color tabs */}
              {colorsInRun.length > 0 && (
                <div className="flex gap-0.5 border-b border-border">
                  <button
                    onClick={() => setActiveColor(null)}
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      activeColor === null
                        ? "border-b-2 border-gda-green text-gda-green"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  {colorsInRun.map((c: string) => (
                    <button
                      key={c}
                      onClick={() => setActiveColor(c)}
                      className={`px-3 py-1.5 text-xs transition-colors ${
                        activeColor === c
                          ? "border-b-2 border-gda-green text-gda-green"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {COLOR_LABELS[c]?.split(" - ")[0] ?? c}
                    </button>
                  ))}
                </div>
              )}

              {/* Diff results */}
              {diffMode && diffData && (
                <div className="space-y-3">
                  {diffData.new_findings.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gda-green">
                        New Findings ({diffData.new_findings.length})
                      </h3>
                      <div className="space-y-2">
                        {diffData.new_findings.map((f) => (
                          <FindingCard key={f.id} finding={f} diffTag="new" />
                        ))}
                      </div>
                    </div>
                  )}
                  {diffData.regressed_findings.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gda-red">
                        Regressed ({diffData.regressed_findings.length})
                      </h3>
                      <div className="space-y-2">
                        {diffData.regressed_findings.map((f) => (
                          <FindingCard key={f.id} finding={f} diffTag="regressed" />
                        ))}
                      </div>
                    </div>
                  )}
                  {diffData.resolved_findings.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Resolved ({diffData.resolved_findings.length})
                      </h3>
                      <div className="space-y-2">
                        {diffData.resolved_findings.map((f) => (
                          <FindingCard key={f.id} finding={f} diffTag="resolved" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Normal findings view (non-diff) */}
              {!diffMode && (
                <>
                  {activeColor === null ? (
                    /* All colors view: collapsible sections */
                    <div className="space-y-3">
                      {colorsInRun.map((color: string) => {
                        const colorFindings = findingsByColor.get(color) ?? [];
                        return (
                          <ColorSection
                            key={color}
                            color={color}
                            findings={colorFindings}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    /* Single color view */
                    <div className="space-y-2">
                      {findings.map((f) => (
                        <FindingCard key={f.id} finding={f} />
                      ))}
                      {findings.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          No findings for this color yet.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Green doctrine scorecard (shown when green tab active or All view) */}
              {(activeColor === "green" || activeColor === null) &&
                greenDoctrineData && (
                  <DoctrineScorecardPanel
                    doctrineScores={greenDoctrineData.doctrineScores}
                    marginCheck={greenDoctrineData.marginCheck}
                    exclusionHits={greenDoctrineData.exclusionHits}
                    pricingStrategy={greenDoctrineData.pricingStrategy}
                  />
                )}
            </div>
          )}
        </div>
      </div>

      {/* Run Modal */}
      {showModal && (
        <RunModal
          documentId={selectedDocId ?? undefined}
          onClose={() => setShowModal(false)}
          onCreated={handleRunCreated}
        />
      )}
    </div>
  );
}

function ColorSection({
  color,
  findings,
}: {
  color: string;
  findings: ColorTeamFinding[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={`rounded border border-border border-l-[3px] bg-gda-bg-raised ${COLOR_BAR_CLASSES[color] ?? ""}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <span className="text-sm font-medium text-foreground">
          {COLOR_LABELS[color] ?? color}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
          <span className="ml-2">{expanded ? "\u25B2" : "\u25BC"}</span>
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 px-4 pb-3">
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
          {findings.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              No findings for this color.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
