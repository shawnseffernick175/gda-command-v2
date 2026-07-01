"use client";

import { useState } from "react";
import {
  X,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  useIngestJobs,
  useReclassifyIngest,
  type IngestJob,
} from "@/hooks/use-ingest-jobs";
import { useToast } from "@/components/ui/toast";

interface IngestJobsPanelProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  extracting: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  classifying: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  routing: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  routed: <CheckCircle2 className="h-3.5 w-3.5 text-gda-green" />,
  failed: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  extracting: "Extracting text",
  classifying: "Classifying",
  routing: "Routing",
  routed: "Routed",
  failed: "Failed",
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
  inbox: "Inbox",
};

const ENTITY_TYPE_OPTIONS = [
  { value: "opportunity", label: "Opportunity" },
  { value: "capture_doc", label: "Capture Document" },
  { value: "partner_doc", label: "Partner Document" },
  { value: "action_item", label: "Action Item" },
  { value: "regulatory_notice", label: "Regulatory Notice" },
  { value: "news_item", label: "News Item" },
  { value: "financial_doc", label: "Financial Document" },
  { value: "cpar", label: "CPAR" },
  { value: "doctrine_doc", label: "Doctrine Document" },
  { value: "vehicle_doc", label: "Vehicle Document" },
  { value: "other", label: "Other" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function JobRow({ job }: { job: IngestJob }) {
  const [expanded, setExpanded] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [selectedType, setSelectedType] = useState(
    job.entity_type ?? "",
  );
  const reclassify = useReclassifyIngest();
  const { toast } = useToast();

  const handleReclassify = async () => {
    if (!selectedType) return;
    try {
      await reclassify.mutateAsync({
        ingest_job_id: job.id,
        corrected_entity_type: selectedType,
        corrected_surface: ENTITY_TYPE_TO_SURFACE[selectedType] ?? "vault",
        rationale: "User manual reclassification",
      });
      toast("Reclassified successfully", "success");
      setReclassifying(false);
    } catch {
      toast("Failed to reclassify", "error");
    }
  };

  const confidence = job.classification_confidence
    ? `${(job.classification_confidence * 100).toFixed(0)}%`
    : null;

  return (
    <div className="border-b border-foreground/5 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0">
          {STATUS_ICON[job.status] ?? (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {job.filename}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {STATUS_LABEL[job.status] ?? job.status}
            {job.entity_type && (
              <span>
                {" -- "}
                {job.entity_type.replace(/_/g, " ")}
              </span>
            )}
            {confidence && <span> ({confidence})</span>}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {formatDate(job.created_at)}
          </span>
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 bg-muted/30 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div>
              <span className="text-muted-foreground">Size: </span>
              <span className="text-foreground">
                {formatFileSize(job.file_size_bytes)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Source: </span>
              <span className="text-foreground">
                {SURFACE_LABELS[job.source_surface ?? ""] ?? job.source_surface ?? "--"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Method: </span>
              <span className="text-foreground">
                {job.source === "drag_drop" ? "Drag & Drop" : job.source === "email_webhook" ? "Email" : job.source}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Target: </span>
              <span className="text-foreground">
                {SURFACE_LABELS[job.target_surface ?? ""] ??
                  job.target_surface ??
                  "--"}
              </span>
            </div>
          </div>

          {job.classification_rationale && (
            <p className="text-[11px] italic text-muted-foreground">
              {job.classification_rationale}
            </p>
          )}

          {job.error_message && (
            <p className="text-[11px] text-destructive">
              Error: {job.error_message}
              {job.error_step && ` (step: ${job.error_step})`}
            </p>
          )}

          {job.doctrine_flag && (
            <Badge variant="outline" className="text-[11px]">
              {job.doctrine_flag === "teaming_context"
                ? "Teaming Context (read-only)"
                : job.doctrine_flag}
            </Badge>
          )}

          {job.status === "routed" && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReclassifying(!reclassifying)}
                className="rounded border border-foreground/20 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Reclassify
              </button>
            </div>
          )}

          {reclassifying && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="rounded border border-foreground/20 bg-background px-2 py-1 text-[11px] text-foreground"
              >
                <option value="">Select type...</option>
                {ENTITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReclassify}
                disabled={!selectedType || reclassify.isPending}
                className="rounded bg-foreground px-2 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {reclassify.isPending ? "..." : "Save"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ENTITY_TYPE_TO_SURFACE: Record<string, string> = {
  opportunity: "opportunities",
  capture_doc: "capture",
  partner_doc: "partner_intel",
  action_item: "action_items",
  regulatory_notice: "regulatory",
  news_item: "daily_news",
  financial_doc: "financials",
  cpar: "capture",
  doctrine_doc: "vault",
  vehicle_doc: "vehicles",
  other: "vault",
};

export function IngestJobsPanel({ open, onClose }: IngestJobsPanelProps) {
  const { data, isLoading } = useIngestJobs({ limit: 30 });
  const jobs = data?.jobs ?? [];

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-foreground/10 bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-foreground" />
          <span className="text-sm font-medium text-foreground">
            Ingestion Queue
          </span>
          {jobs.length > 0 && (
            <Badge variant="secondary" className="text-[11px]">
              {data?.pagination?.total ?? jobs.length}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Inbox className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              No ingestion jobs yet
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Drag and drop files onto any surface to begin
            </p>
          </div>
        )}

        {!isLoading &&
          jobs.map((job) => <JobRow key={job.id} job={job} />)}
      </div>
    </div>
  );
}
