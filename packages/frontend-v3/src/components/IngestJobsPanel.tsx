"use client";

import { useState } from "react";
import {
  useIngestJobs,
  useReclassifyIngest,
} from "@/hooks/use-ingest-jobs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  extracting: "Extracting",
  classifying: "Classifying",
  routing: "Routing",
  routed: "Routed",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted",
  extracting: "text-accent",
  classifying: "text-accent",
  routing: "text-accent",
  routed: "text-ink",
  failed: "text-critical",
};

const SURFACE_LABELS: Record<string, string> = {
  opportunities: "Opportunities",
  pipeline: "Pipeline",
  capture: "Capture",
  partner_intel: "Partner Intel",
  action_items: "Action Items",
  daily_news: "Daily News",
  sentinel: "Sentinel",
  vault: "Vault",
  financials: "Financial Bible",
  regulatory: "Regulatory",
  fastrac: "FasTrac",
  vehicles: "Vehicles",
  digest: "Digest",
  inbox: "Inbox / Needs Triage",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  capture_doc: "Capture Document",
  partner_doc: "Partner Document",
  action_item: "Action Item",
  regulatory_notice: "Regulatory Notice",
  news_item: "News Item",
  financial_doc: "Financial Document",
  cpar: "CPAR / Past Performance",
  doctrine_doc: "Doctrine Document",
  vehicle_doc: "Vehicle / Contract",
  other: "Other",
};

const SURFACES = [
  "opportunities", "pipeline", "capture", "partner_intel", "action_items",
  "vault", "financials", "regulatory", "fastrac", "vehicles", "digest", "inbox",
] as const;

const ENTITY_TYPES = [
  "opportunity", "capture_doc", "partner_doc", "action_item",
  "regulatory_notice", "news_item", "financial_doc", "cpar",
  "doctrine_doc", "vehicle_doc", "other",
] as const;

interface IngestJobsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IngestJobsPanel({ isOpen, onClose }: IngestJobsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading } = useIngestJobs({ status: statusFilter || undefined, limit: 50 });
  const reclassify = useReclassifyIngest();
  const { toast } = useToast();
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [reclassifySurface, setReclassifySurface] = useState("");
  const [reclassifyEntity, setReclassifyEntity] = useState("");

  if (!isOpen) return null;

  const jobs = data?.jobs ?? [];

  const handleReclassify = async (jobId: string) => {
    if (!reclassifySurface || !reclassifyEntity) {
      toast("Select both surface and entity type", "error");
      return;
    }

    try {
      await reclassify.mutateAsync({
        ingest_job_id: jobId,
        corrected_surface: reclassifySurface,
        corrected_entity_type: reclassifyEntity,
      });
      toast(
        `Reclassified to ${SURFACE_LABELS[reclassifySurface] ?? reclassifySurface}`,
        "success",
      );
      setReclassifyingId(null);
      setReclassifySurface("");
      setReclassifyEntity("");
    } catch {
      toast("Reclassification failed", "error");
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Ingest Jobs</h2>
        <button
          onClick={onClose}
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-bg"
        >
          Close
        </button>
      </div>

      {/* Filter */}
      <div className="border-b border-border px-4 py-2">
        <div className="flex gap-2">
          {["", "pending", "extracting", "classifying", "routing", "routed", "failed"].map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  statusFilter === s
                    ? "border border-accent bg-accent/5 text-accent"
                    : "text-muted hover:text-ink",
                )}
              >
                {s === "" ? "All" : STATUS_LABELS[s] ?? s}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-xs text-muted">Loading...</div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div className="p-8 text-center text-xs text-muted">
            No ingest jobs found
          </div>
        )}

        {jobs.map((job) => (
          <div key={job.id} className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {job.filename}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      STATUS_COLORS[job.status] ?? "text-muted",
                    )}
                  >
                    {STATUS_LABELS[job.status] ?? job.status}
                  </span>
                  {job.target_surface && (
                    <span className="text-xs text-muted">
                      → {SURFACE_LABELS[job.target_surface] ?? job.target_surface}
                    </span>
                  )}
                  {job.entity_type && (
                    <span className="text-xs text-muted">
                      ({ENTITY_TYPE_LABELS[job.entity_type] ?? job.entity_type})
                    </span>
                  )}
                </div>
                {job.classification_confidence != null && (
                  <p className="mt-1 text-xs text-muted">
                    Confidence: {Math.round(job.classification_confidence * 100)}%
                    {job.evidence_grade && ` · Grade ${job.evidence_grade}`}
                    {job.doctrine_flag && ` · ${job.doctrine_flag}`}
                  </p>
                )}
                {job.error_message && (
                  <p className="mt-1 text-xs text-critical">
                    Error: {job.error_message}
                  </p>
                )}
                {job.pii_detected && (
                  <p className="mt-1 text-xs text-muted">
                    PII detected {job.pii_redacted && "and redacted"}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {job.source === "email_webhook" && job.email_from
                    ? `Email from ${job.email_from}`
                    : `Source: ${job.source}`}
                  {" · "}
                  {formatTimeAgo(job.created_at)}
                </p>
              </div>

              {/* Reclassify action */}
              {job.status === "routed" && (
                <button
                  onClick={() =>
                    setReclassifyingId(
                      reclassifyingId === job.id ? null : job.id,
                    )
                  }
                  className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted hover:bg-bg hover:text-ink"
                >
                  Reclassify
                </button>
              )}
            </div>

            {/* Reclassify form */}
            {reclassifyingId === job.id && (
              <div className="mt-2 rounded border border-border bg-bg p-3">
                <div className="flex flex-col gap-2">
                  <select
                    value={reclassifySurface}
                    onChange={(e) => setReclassifySurface(e.target.value)}
                    className="rounded border border-border bg-white px-2 py-1 text-xs"
                  >
                    <option value="">Select surface...</option>
                    {SURFACES.map((s) => (
                      <option key={s} value={s}>
                        {SURFACE_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                  <select
                    value={reclassifyEntity}
                    onChange={(e) => setReclassifyEntity(e.target.value)}
                    className="rounded border border-border bg-white px-2 py-1 text-xs"
                  >
                    <option value="">Select entity type...</option>
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ENTITY_TYPE_LABELS[t] ?? t}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReclassify(job.id)}
                      disabled={reclassify.isPending}
                      className="rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-[#015C61]"
                    >
                      {reclassify.isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setReclassifyingId(null);
                        setReclassifySurface("");
                        setReclassifyEntity("");
                      }}
                      className="rounded border border-border px-3 py-1 text-xs text-muted hover:bg-bg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer with total */}
      {data?.pagination && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted">
          {data.pagination.total} total job{data.pagination.total !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
