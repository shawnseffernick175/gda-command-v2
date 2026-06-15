"use client";

import { Suspense, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCapture } from "@/hooks/use-captures";
import { usePipeline } from "@/hooks/use-pipeline";
import {
  useCaptureStages,
  useUpdateStage,
  useAddAnnotation,
  useDeleteAnnotation,
  useTakeSnapshot,
  useUploadRfp,
} from "@/hooks/use-capture-workflow";
import { apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScoreDisplay } from "@/components/score-display";
import { StageDropdown } from "@/components/shared/stage-dropdown";
import { SourceChip } from "@/components/shared/source-chip";
import { PendingState } from "@/components/shared/pending-state";
import { CollapseSection } from "@/components/shared/collapse-section";
import { AskAiPanel } from "@/components/shared/ask-ai-panel";
import { useVaultDocuments } from "@/hooks/use-vault";
import { formatMoney } from "@/lib/format-money";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import type {
  CaptureColorStage,
  CaptureStageAnnotation,
  StageAnalysis,
} from "@/lib/types";

const WORKFLOW_STAGES = ["blue", "pink", "red", "green", "white"] as const;
type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

const STAGE_LABELS: Record<WorkflowStage, string> = {
  blue: "Blue",
  pink: "Pink",
  red: "Red",
  green: "Green",
  white: "White",
};

const STAGE_FULL_LABELS: Record<WorkflowStage, string> = {
  blue: "Draft Strategy",
  pink: "Initial Review",
  red: "Mid-Term Review",
  green: "Final Review",
  white: "Compliance & Submit Gate",
};

function nextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = WORKFLOW_STAGES.indexOf(current);
  return idx < WORKFLOW_STAGES.length - 1 ? WORKFLOW_STAGES[idx + 1] : null;
}

export default function CapturePage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64 bg-gda-panel" />}>
      <CaptureContent />
    </Suspense>
  );
}

function CaptureContent() {
  const searchParams = useSearchParams();
  const oppId = searchParams.get("opp");

  if (oppId) return <CaptureDetail oppId={oppId} />;
  return <CaptureList />;
}

const CAPTURE_SORT_COLS: ColumnSortConfig[] = [
  { field: "program", type: "string", accessor: (r) => r.title },
  { field: "stage", type: "enum", enumOrder: ["interest", "qualify", "pursue", "solicitation", "post_submittal", "won"], accessor: (r) => r.stage },
  { field: "value", type: "number", accessor: (r) => (r.value_max as number) ?? (r.value_min as number) ?? (r.value as number) ?? 0 },
  { field: "pwin", type: "number", accessor: (r) => (r.pwin as number) ?? null },
];

function CaptureList() {
  const { data: pipeline, isLoading } = usePipeline({ stage: "Pursue" });
  const [showModal, setShowModal] = useState(false);
  const [modalEntryPoint, setModalEntryPoint] = useState<"full_pipeline" | "white_only">("full_pipeline");
  const { sortBy, sortDir, handleSort } = useTableSort();

  const sorted = useMemo(() => {
    const raw = pipeline?.items ?? [];
    if (!sortBy) return raw;
    return sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, CAPTURE_SORT_COLS) as unknown as typeof raw;
  }, [pipeline, sortBy, sortDir]);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-3 sticky-page-header">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-lg font-bold text-foreground">
            Capture
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setModalEntryPoint("full_pipeline"); setShowModal(true); }}
              className="rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs font-medium text-gda-green hover:bg-gda-green/20"
            >
              Start Full Capture
            </button>
            <button
              type="button"
              onClick={() => { setModalEntryPoint("white_only"); setShowModal(true); }}
              className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gda-panel/80"
            >
              White Review Only
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Pursuits in Capture (Pursue stage and beyond). pwin set here via Shipley
          drivers — pursuit without a capture plan shows {"\u201C"}—{"\u201D"} and is
          unforecastable.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 bg-gda-panel" />
          ))}
        </div>
      ) : pipeline?.items && pipeline.items.length > 0 ? (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <SortableHeader label="Program" field="program" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Stage" field="stage" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Value" field="value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="pwin" field="pwin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-left font-medium bg-gda-bg-base">Next Milestone</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr
                  key={item.internal_id}
                  className="border-b border-border hover:bg-gda-panel/50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/capture?opp=${item.internal_id}`}
                      className="text-foreground hover:text-gda-green"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StageDropdown value={item.stage} />
                  </td>
                  <td className="px-3 py-2 text-left font-mono text-xs tabular-nums">
                    {formatMoney(item.value)}
                  </td>
                  <td className="px-3 py-2 text-left">
                    {item.pwin != null ? (
                      <ScoreDisplay score={item.pwin} className="text-sm" />
                    ) : (
                      <span className="text-xs text-muted-foreground" title="No capture plan — unforecastable">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {item.next_milestone ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PendingState
          surface="Capture Plans"
          reason="No pursuits are currently in capture stage. Move an opportunity to Pursue stage to begin capture."
        />
      )}

      {showModal && (
        <CreateCaptureModal
          entryPoint={modalEntryPoint}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function CreateCaptureModal({
  entryPoint,
  onClose,
}: {
  entryPoint: "full_pipeline" | "white_only";
  onClose: () => void;
}) {
  const { data: pipeline } = usePipeline({ stage: "Pursue" });
  const [selectedOpp, setSelectedOpp] = useState("");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (oppId: string) =>
      apiPost<{ id: number }>(`/v3/captures/${oppId}/generate-plan`, { entry_point: entryPoint }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-gda-bg-base p-6 shadow-xl">
        <h2 className="font-mono text-sm font-bold text-foreground">
          {entryPoint === "full_pipeline" ? "Start Full Capture" : "White Review Only"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {entryPoint === "full_pipeline"
            ? "Blue → Pink → Red → Green → White pipeline"
            : "Standalone White (compliance/submit) review"}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Select Opportunity
          </label>
          <select
            value={selectedOpp}
            onChange={(e) => setSelectedOpp(e.target.value)}
            className="w-full rounded border border-border bg-gda-panel px-3 py-2 text-xs text-foreground"
          >
            <option value="">— Select —</option>
            {pipeline?.items?.map((item) => (
              <option key={item.internal_id} value={item.internal_id}>
                {item.title}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 pt-2">
            <Badge variant="outline" className="text-xs">
              {entryPoint === "full_pipeline" ? "Full Pipeline" : "White Only"}
            </Badge>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedOpp || create.isPending}
            onClick={() => selectedOpp && create.mutate(selectedOpp)}
            className="rounded bg-gda-green/10 border border-gda-green/30 px-3 py-1.5 text-xs text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : "Create Capture"}
          </button>
        </div>
        {create.isError && (
          <p className="mt-2 text-xs text-gda-red">{(create.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

function CaptureDetail({ oppId }: { oppId: string }) {
  const { data: capture, isLoading, error } = useCapture(oppId);
  const qc = useQueryClient();
  const generatePlan = useMutation({
    mutationFn: () => apiPost(`/v3/captures/${oppId}/generate-plan`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['capture', oppId] }); },
  });

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
      <div className="rounded-md border border-gda-red/30 bg-gda-red/10 p-4 text-gda-red text-sm">
        Failed to load capture: {(error as Error).message}
      </div>
    );
  }

  if (!capture) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/capture"
          className="text-xs text-muted-foreground hover:text-gda-green"
        >
          ← Capture
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold text-foreground">
          {capture.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StageDropdown value={capture.stage} />
          {capture.entry_point && (
            <Badge variant="outline" className="text-xs">
              {capture.entry_point === "full_pipeline" ? "Full Pipeline" : "White Only"}
            </Badge>
          )}
        </div>
      </div>

      <RfpUploadSection captureId={oppId} rfpFilename={capture.rfp_filename} rfpUploadedAt={capture.rfp_uploaded_at} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Capture Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Value:</span>
              <span className="font-mono text-foreground">{formatMoney(capture.value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">pwin (Capture):</span>
              {capture.pwin != null ? (
                <ScoreDisplay score={capture.pwin} className="text-sm" />
              ) : (
                <span className="text-muted-foreground" title="No capture plan — unforecastable">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Compliance:</span>
              <span className="font-mono text-foreground">
                {capture.compliance_pct != null ? `${capture.compliance_pct}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next Milestone:</span>
              <span className="text-foreground">{capture.next_milestone ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Win Strategy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {capture.win_strategy ? (
              <p className="text-xs text-foreground whitespace-pre-wrap">
                {capture.win_strategy}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No win strategy documented yet.
              </p>
            )}
            {capture.capture_plan && Object.keys(capture.capture_plan).length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Generated Plan</p>
                {(capture.capture_plan as Record<string, string>).customer_profile && (
                  <p className="text-xs text-foreground">{(capture.capture_plan as Record<string, string>).customer_profile}</p>
                )}
                {(capture.capture_plan as Record<string, string>).solution_strategy && (
                  <p className="text-xs text-muted-foreground">{(capture.capture_plan as Record<string, string>).solution_strategy}</p>
                )}
              </div>
            )}
            {capture.discriminators && capture.discriminators.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Discriminators:</p>
                <div className="flex flex-wrap gap-1">
                  {capture.discriminators.map((d, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => generatePlan.mutate()}
                disabled={generatePlan.isPending}
                className="rounded bg-gda-green/10 border border-gda-green/30 px-3 py-1 text-xs text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
              >
                {generatePlan.isPending ? 'Generating...' : 'Generate Plan'}
              </button>
              {generatePlan.isError && (
                <span className="text-xs text-gda-red">{(generatePlan.error as Error).message}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ColorTeamWorkflow captureId={oppId} />

      <AskAiPanel objectType="capture" objectId={oppId} />

      {/* Vault Documents (F-614) */}
      <CaptureVaultDocs captureId={Number(oppId)} />
    </div>
  );
}

function RfpUploadSection({
  captureId,
  rfpFilename,
  rfpUploadedAt,
}: {
  captureId: string;
  rfpFilename?: string | null;
  rfpUploadedAt?: string | null;
}) {
  const upload = useUploadRfp(captureId);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload.mutate(file);
    },
    [upload],
  );

  if (rfpFilename) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-foreground">{rfpFilename}</span>
            {rfpUploadedAt && (
              <span className="text-xs text-muted-foreground">
                uploaded {new Date(rfpUploadedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-gda-green hover:underline"
          >
            Replace
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={handleFile} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border border-dashed bg-gda-bg-base">
      <CardContent className="flex flex-col items-center justify-center py-6">
        <p className="text-xs text-muted-foreground">Upload RFP (PDF or DOCX)</p>
        <label className="mt-2 cursor-pointer rounded border border-gda-green/30 bg-gda-green/10 px-4 py-2 text-xs text-gda-green hover:bg-gda-green/20">
          Choose File
          <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleFile} />
        </label>
        {upload.isPending && <p className="mt-2 text-xs text-muted-foreground">Uploading...</p>}
        {upload.isError && <p className="mt-2 text-xs text-gda-red">{(upload.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

function ColorTeamWorkflow({ captureId }: { captureId: string }) {
  const { data, isLoading } = useCaptureStages(captureId);
  const [activeStage, setActiveStage] = useState<WorkflowStage>("blue");

  const stages = data?.stages ?? [];

  // Auto-select the first in_progress stage
  const inProgressStage = stages.find((s) => s.status === "in_progress");
  const displayStage = inProgressStage ? (inProgressStage.stage as WorkflowStage) : activeStage;

  if (isLoading) {
    return <Skeleton className="h-48 bg-gda-panel" />;
  }

  if (stages.length === 0) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          No workflow stages initialized yet.
        </CardContent>
      </Card>
    );
  }

  const currentStageData = stages.find((s) => s.stage === (activeStage === displayStage ? activeStage : displayStage));

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-sm text-muted-foreground">
          Color Team Workflow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Rail */}
        <div className="flex gap-1">
          {WORKFLOW_STAGES.map((stage) => {
            const stageData = stages.find((s) => s.stage === stage);
            const isActive = stage === activeStage;
            const statusColor = stageData?.status === "complete"
              ? "border-gda-green text-gda-green bg-gda-green/10"
              : stageData?.status === "in_progress"
              ? "border-gda-green text-gda-green bg-gda-green/5"
              : stageData?.status === "skipped"
              ? "border-border text-muted-foreground/50 bg-gda-bg-base line-through"
              : "border-border text-muted-foreground bg-gda-bg-base";

            return (
              <button
                key={stage}
                type="button"
                onClick={() => setActiveStage(stage)}
                className={`flex-1 rounded border px-2 py-2 text-center transition-colors ${statusColor} ${
                  isActive ? "ring-1 ring-gda-green" : ""
                } hover:bg-gda-panel`}
              >
                <p className="font-mono text-xs font-medium">{STAGE_LABELS[stage]}</p>
                <p className="mt-0.5 text-[11px]">
                  {stageData?.status === "in_progress"
                    ? "In Progress"
                    : stageData?.status === "complete"
                    ? "Complete"
                    : stageData?.status === "skipped"
                    ? "Skipped"
                    : "Pending"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Active Stage Panel */}
        {currentStageData && (
          <StagePanel key={currentStageData.stage} captureId={captureId} stageData={currentStageData} />
        )}
      </CardContent>
    </Card>
  );
}

function StagePanel({
  captureId,
  stageData,
}: {
  captureId: string;
  stageData: CaptureColorStage & { annotations: CaptureStageAnnotation[] };
}) {
  const stage = stageData.stage;
  const updateStage = useUpdateStage(captureId);
  const addAnnotation = useAddAnnotation(captureId);
  const deleteAnnotation = useDeleteAnnotation(captureId);
  const takeSnapshot = useTakeSnapshot(captureId);

  const [reviewer, setReviewer] = useState(stageData.reviewer ?? "");
  const [annotationText, setAnnotationText] = useState("");
  const [gateNote, setGateNote] = useState(stageData.gate_note ?? "");

  const next = nextStage(stage);

  const handleAdvance = () => {
    if (!next) return;
    updateStage.mutate({ stage, status: "complete" });
    updateStage.mutate({ stage: next, status: "in_progress" });
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Left column (2/3) */}
      <div className="md:col-span-2 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">Stage:</span>
          <span className="font-mono text-xs font-bold text-foreground">
            {STAGE_FULL_LABELS[stage]}
          </span>
          <Badge variant="outline" className="text-[11px]">
            {stageData.status}
          </Badge>
        </div>

        {/* Reviewer */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Reviewer</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Name or email"
              className="flex-1 rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => updateStage.mutate({ stage, reviewer })}
              disabled={updateStage.isPending}
              className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Save
            </button>
          </div>
        </div>

        {/* Annotations */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Annotations</p>
          {stageData.annotations.length > 0 ? (
            <div className="space-y-1.5">
              {stageData.annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="flex items-start justify-between rounded border border-border bg-gda-bg-base px-2 py-1.5"
                >
                  <div>
                    <span className="text-[11px] text-muted-foreground">{ann.author}</span>
                    <p className="text-xs text-foreground whitespace-pre-wrap">{ann.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAnnotation.mutate({ stage, annotationId: ann.id })}
                    className="ml-2 text-[11px] text-gda-red hover:underline"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No annotations yet.</p>
          )}
          <div className="flex gap-2">
            <textarea
              value={annotationText}
              onChange={(e) => setAnnotationText(e.target.value)}
              placeholder="Add annotation..."
              className="flex-1 rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground resize-none"
              rows={2}
            />
            <button
              type="button"
              disabled={!annotationText.trim() || addAnnotation.isPending}
              onClick={() => {
                addAnnotation.mutate({ stage, body: annotationText.trim() });
                setAnnotationText("");
              }}
              className="self-end rounded border border-gda-green/30 bg-gda-green/10 px-2 py-1 text-xs text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Version Snapshot */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => takeSnapshot.mutate(stage)}
            disabled={takeSnapshot.isPending}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {takeSnapshot.isPending ? "Saving..." : "Take Snapshot"}
          </button>
          {stageData.snapshot_at && (
            <span className="text-[11px] text-muted-foreground">
              Last snapshot: {new Date(stageData.snapshot_at).toLocaleString()}
            </span>
          )}
        </div>

        {/* Advance */}
        {next && (
          <button
            type="button"
            disabled={!stageData.gate_decision || updateStage.isPending}
            onClick={handleAdvance}
            className="rounded bg-gda-green/10 border border-gda-green/30 px-3 py-1.5 text-xs text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
            title={!stageData.gate_decision ? "Set gate decision before advancing" : undefined}
          >
            Advance to {STAGE_LABELS[next]}
          </button>
        )}
      </div>

      {/* Right column (1/3) */}
      <div className="space-y-4">
        {/* AI Analysis */}
        <div className="rounded border border-border bg-gda-bg-base p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-medium text-muted-foreground">AI Analysis</p>
            <SourceChip label="AI Analysis" kind="heuristic" />
          </div>
          {stageData.ai_analysis ? (
            <StageAnalysisDisplay analysis={stageData.ai_analysis} />
          ) : (
            <p className="text-xs text-muted-foreground italic">Analysis will run automatically when this stage is activated.</p>
          )}
          {stageData.ai_ran_at && (
            <p className="text-[11px] text-muted-foreground">
              Ran: {new Date(stageData.ai_ran_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Gate Decision */}
        <div className="rounded border border-border bg-gda-bg-base p-3 space-y-2">
          <p className="font-mono text-xs font-medium text-muted-foreground">Gate Decision</p>
          <div className="flex gap-1">
            {(["go", "no_go", "conditional"] as const).map((decision) => (
              <button
                key={decision}
                type="button"
                onClick={() => updateStage.mutate({ stage, gate_decision: decision })}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  stageData.gate_decision === decision
                    ? decision === "go"
                      ? "bg-gda-green/20 text-gda-green border border-gda-green/40"
                      : decision === "no_go"
                      ? "bg-gda-red/20 text-gda-red border border-gda-red/40"
                      : "bg-gda-amber/20 text-gda-amber border border-gda-amber/40"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {decision === "go" ? "Go" : decision === "no_go" ? "No-Go" : "Conditional"}
              </button>
            ))}
          </div>
          <textarea
            value={gateNote}
            onChange={(e) => setGateNote(e.target.value)}
            onBlur={() => updateStage.mutate({ stage, gate_note: gateNote })}
            placeholder="Gate note..."
            className="w-full rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground resize-none"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

function StageAnalysisDisplay({ analysis }: { analysis: StageAnalysis }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="text-foreground">{analysis.summary}</p>

      {analysis.strengths.length > 0 && (
        <div>
          <p className="font-medium text-gda-green">Strengths</p>
          <ul className="mt-0.5 space-y-0.5 text-foreground">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="pl-2 border-l border-gda-green/30">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.weaknesses.length > 0 && (
        <div>
          <p className="font-medium text-gda-red">Weaknesses</p>
          <ul className="mt-0.5 space-y-0.5 text-foreground">
            {analysis.weaknesses.map((w, i) => (
              <li key={i} className="pl-2 border-l border-gda-red/30">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.action_items.length > 0 && (
        <div>
          <p className="font-medium text-gda-cyan">Action Items</p>
          <ul className="mt-0.5 space-y-0.5 text-foreground">
            {analysis.action_items.map((a, i) => (
              <li key={i} className="pl-2 border-l border-gda-cyan/30">{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <span className="text-muted-foreground">Gate:</span>
        <Badge
          variant="outline"
          className={`text-[11px] ${
            analysis.gate_recommendation === "go"
              ? "border-gda-green/40 text-gda-green"
              : analysis.gate_recommendation === "no_go"
              ? "border-gda-red/40 text-gda-red"
              : "border-gda-amber/40 text-gda-amber"
          }`}
        >
          {analysis.gate_recommendation === "go"
            ? "Go"
            : analysis.gate_recommendation === "no_go"
            ? "No-Go"
            : "Conditional"}
        </Badge>
        <span className="text-muted-foreground">{analysis.gate_rationale}</span>
      </div>
    </div>
  );
}

function CaptureVaultDocs({ captureId }: { captureId: number }) {
  const { data } = useVaultDocuments({ limit: 100 });
  const linkedDocs = (data?.items ?? []).filter(
    (d) => d.linked_capture_id === captureId,
  );

  if (linkedDocs.length === 0) return null;

  return (
    <CollapseSection
      id={`vault-cap-${captureId}`}
      title="Vault Documents"
      count={linkedDocs.length}
      defaultOpen={false}
    >
      <div className="space-y-1">
        {linkedDocs.map((doc) => (
          <Link
            key={doc.id}
            href={`/vault?doc=${doc.id}`}
            className="flex items-center gap-3 rounded border border-border bg-gda-panel/50 px-3 py-2 text-xs hover:border-gda-cyan/40 transition-colors"
          >
            <span className="font-mono text-foreground">{doc.filename}</span>
            <span className="text-muted-foreground">
              {doc.doc_type}
            </span>
            {doc.ai_summary && (
              <span className="text-muted-foreground truncate max-w-[300px]">
                {doc.ai_summary}
              </span>
            )}
          </Link>
        ))}
      </div>
    </CollapseSection>
  );
}
