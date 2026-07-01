"use client";

import { Suspense, useState } from "react";
import {
  useActionItems,
  useUpdateActionItem,
  useCreateDraft,
  useUsers,
  useApproveDraft,
  useRejectDraft,
  useEditDraft,
} from "@/hooks/use-action-items";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/Pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import type { SortDirection } from "@/lib/sort-utils";
import { cn } from "@/lib/utils";
import type {
  ActionItem,
  ActionItemDraft,
  ActionItemPriority,
  ActionItemDraftStatus,
  DoctrineSource,
} from "@/lib/types";
import Link from "next/link";

/** Inline sortable header label for the flex-based Action Items header row. */
function SortSpan({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: string;
  sortBy: string | null;
  sortDir: SortDirection;
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = sortBy === field;
  const indicator = active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "";
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      title={`Sort by ${label}`}
      className={cn(
        "flex items-center gap-1 uppercase tracking-[0.04em] transition-colors hover:text-foreground",
        active ? "text-gda-green" : "text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {indicator && (
        <span className="font-mono text-[11px] leading-none">{indicator}</span>
      )}
    </button>
  );
}

/* ── Constants ───────────────────────────────────────────────── */

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Overdue", value: "overdue" },
  { label: "Done", value: "done" },
] as const;

const SOURCE_FILTERS: { label: string; value: DoctrineSource | undefined }[] = [
  { label: "All Sources", value: undefined },
  { label: "Review Kill-Items", value: "capture_review_killitem" },
  { label: "Stale Captures", value: "capture_stale" },
  { label: "Deadlines", value: "capture_deadline" },
  { label: "Recompete", value: "recompete_expiring" },
  { label: "Manual", value: "manual" },
];

const SEVERITY_FILTERS: { label: string; value: ActionItemPriority | undefined }[] = [
  { label: "All Severity", value: undefined },
  { label: "Critical", value: "CRITICAL" },
  { label: "High", value: "HIGH" },
  { label: "Medium", value: "MEDIUM" },
  { label: "Low", value: "LOW" },
];

const DRAFT_KINDS = ["reply", "research", "milestone"] as const;

const PRIORITY_COLORS: Record<ActionItemPriority, string> = {
  CRITICAL: "bg-[#A12C7B]/15 text-[#A12C7B] border-[#A12C7B]/30",
  HIGH: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  LOW: "bg-[#7A7974]/15 text-[#7A7974] border-[#7A7974]/30",
};

const DOCTRINE_SOURCE_LABELS: Record<DoctrineSource, string> = {
  capture_review_killitem: "Review",
  capture_stale: "Stale",
  capture_deadline: "Deadline",
  recompete_expiring: "Recompete",
  manual: "Manual",
};

const DOCTRINE_SOURCE_COLORS: Record<DoctrineSource, string> = {
  capture_review_killitem: "bg-[#A12C7B]/10 text-[#A12C7B] border-[#A12C7B]/20",
  capture_stale: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  capture_deadline: "bg-[#01696F]/10 text-[#01696F] border-[#01696F]/20",
  recompete_expiring: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  manual: "bg-[#7A7974]/10 text-[#7A7974] border-[#7A7974]/20",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function isOverdue(item: ActionItem): boolean {
  if (!item.due_date || item.status === "done") return false;
  return new Date(item.due_date) < new Date();
}

function getLinkForItem(item: ActionItem): { href: string; label: string } | null {
  const ds = item.doctrine_source;
  if (
    ds === "capture_review_killitem" ||
    ds === "capture_stale" ||
    ds === "capture_deadline"
  ) {
    const captureId = item.capture_id ?? item.linked_record_id;
    if (captureId) {
      // Capture detail reads the `opp` query param (passed straight to
      // GET /v3/captures/:id, which resolves a capture id).
      return { href: `/capture?opp=${captureId}`, label: "Capture" };
    }
  }
  if (ds === "recompete_expiring") {
    const awardId = item.award_id ?? item.linked_record_id;
    if (awardId) {
      return { href: `/awards?id=${awardId}`, label: "Award" };
    }
  }
  if (item.linked_record_type && item.linked_record_id) {
    // Each surface reads a different detail query param: Capture uses `opp`,
    // others use `id`.
    const routes: Record<string, { path: string; param: string }> = {
      capture: { path: "/capture", param: "opp" },
      award: { path: "/awards", param: "id" },
    };
    const route = routes[item.linked_record_type] ?? { path: "/", param: "id" };
    return {
      href: `${route.path}?${route.param}=${item.linked_record_id}`,
      label: item.linked_record_type,
    };
  }
  return null;
}

function FilterChips<T>({ items, active, onSelect }: {
  items: readonly { label: string; value: T }[];
  active: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {items.map((f) => (
        <button
          key={f.label}
          type="button"
          onClick={() => onSelect(f.value)}
          className={cn(
            "rounded px-2 py-0.5 text-caption transition-colors border",
            active === f.value
              ? "bg-[#01696F]/15 text-[#01696F] border-[#01696F]/30"
              : "text-[#7A7974] border-transparent hover:text-[#28251D] hover:border-[#D4D1CA]",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function ActionItemsPage() {
  return (
    <Suspense fallback={<div />}>
      <ActionItemsContent />
    </Suspense>
  );
}

function ActionItemsContent() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [sourceFilter, setSourceFilter] = useState<DoctrineSource | undefined>();
  const [severityFilter, setSeverityFilter] = useState<ActionItemPriority | undefined>();
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const { sortBy, sortDir, handleSort, sortParams } = useTableSort();

  const filterKey = `${statusFilter ?? "_"}-${sourceFilter ?? "_"}-${severityFilter ?? "_"}-${ownerFilter ?? "_"}-${sortParams.sort_by ?? ""}-${sortParams.sort_dir ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, isLoading, error, refetch } = useActionItems({
    status: statusFilter,
    doctrine_source: sourceFilter,
    priority: severityFilter,
    owner: ownerFilter,
    page,
    ...sortParams,
  });

  const items = data?.items ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;
  const updateItem = useUpdateActionItem();
  const { data: users } = useUsers();

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-3 sticky-page-header">
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 text-section font-semibold text-foreground">
            Action Items
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Follow-ups from opportunities, captures, and reviews — filter by status, see what is due, and keep pursuits moving.
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded px-2.5 py-1 text-caption transition-colors",
                statusFilter === f.value
                  ? "bg-[#01696F]/15 text-[#01696F] border border-[#01696F]/30"
                  : "text-[#7A7974] hover:text-[#28251D]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filter chips row */}
        <div className="flex flex-wrap gap-4">
          <FilterChips items={SOURCE_FILTERS} active={sourceFilter} onSelect={setSourceFilter} />
          <FilterChips items={SEVERITY_FILTERS} active={severityFilter} onSelect={setSeverityFilter} />
          <select
            value={ownerFilter ?? ""}
            onChange={(e) => setOwnerFilter(e.target.value || undefined)}
            className="rounded px-2 py-0.5 text-caption border border-[#D4D1CA] text-[#28251D] bg-white"
          >
            <option value="">All Owners</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.display_name}>{u.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 bg-gda-panel" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No action items"
          description="No action items. You're caught up — or no captures have stale activity, deadlines, or expiring recompetes."
        />
      ) : (
        <>
          <Card className="border-border bg-gda-panel overflow-hidden">
            <CardContent className="p-0">
              {/* Single sortable header row (aligned to ActionItemRow) */}
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-caption text-muted-foreground uppercase tracking-[0.04em]">
                <span className="w-4" />
                <SortSpan label="Severity" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-[72px] shrink-0" />
                <SortSpan label="Source" field="doctrine_source" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-[72px] shrink-0" />
                <SortSpan label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="flex-1" />
                <SortSpan label="Due" field="due_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-[80px] shrink-0 justify-end text-right tabular-nums" />
                <span className="w-[72px] shrink-0">Link</span>
                <span className="w-[100px] shrink-0">Owner</span>
                <SortSpan label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-[72px] shrink-0" />
              </div>
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <ActionItemRow
                    key={item.id}
                    item={item}
                    highlighted={false}
                    onToggle={(id, status) =>
                      updateItem.mutate({ id, status })
                    }

                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

/* ── Single action item row ──────────────────────────────────── */

function ActionItemRow({
  item,
  highlighted,
  onToggle,
}: {
  item: ActionItem;
  highlighted: boolean;
  onToggle: (id: number, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const overdue = isOverdue(item);
  const priority = item.priority ?? "MEDIUM";
  const doctrineSource = item.doctrine_source ?? "manual";
  const link = getLinkForItem(item);

  return (
    <div
      className={cn(
        "transition-colors",
        highlighted && "bg-[#01696F]/5 ring-1 ring-[#01696F]/30",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2 text-body hover:bg-[#F7F6F2] transition-colors">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() =>
            onToggle(item.id, item.status === "done" ? "open" : "done")
          }
          className={cn(
            "h-4 w-4 rounded border transition-colors shrink-0",
            item.status === "done"
              ? "bg-[#01696F] border-[#01696F]"
              : "border-[#D4D1CA] hover:border-[#01696F]",
          )}
        />

        {/* Severity badge */}
        <Badge
          variant="outline"
          className={cn("text-[11px] shrink-0 w-[72px] justify-center", PRIORITY_COLORS[priority])}
        >
          {priority}
        </Badge>

        {/* Source type badge */}
        <Badge
          variant="outline"
          className={cn("text-[11px] shrink-0 w-[72px] justify-center", DOCTRINE_SOURCE_COLORS[doctrineSource])}
        >
          {DOCTRINE_SOURCE_LABELS[doctrineSource]}
        </Badge>

        {/* Title */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex-1 text-left text-[#28251D] hover:text-[#01696F] transition-colors truncate text-body",
            item.status === "done" && "line-through text-[#7A7974]",
          )}
        >
          {item.title}
        </button>

        {/* Due date */}
        <span
          className={cn(
            "text-caption shrink-0 w-[80px] text-right tabular-nums",
            overdue ? "text-[#A12C7B] font-semibold" : "text-[#7A7974]",
          )}
        >
          {item.due_date ? formatDate(item.due_date) : "—"}
        </span>

        {/* Link to capture or award */}
        <span className="w-[72px] shrink-0">
          {link ? (
            <Link
              href={link.href}
              className="rounded px-1.5 py-0.5 text-caption bg-[#01696F]/10 text-[#01696F] border border-[#01696F]/20 hover:bg-[#01696F]/20 transition-colors"
            >
              {link.label} →
            </Link>
          ) : (
            <span className="text-caption text-[#7A7974]">—</span>
          )}
        </span>

        {/* Assignee */}
        <span className="text-caption text-[#7A7974] shrink-0 w-[100px] truncate">
          {item.assignee?.name ?? item.owner ?? "Unassigned"}
        </span>

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn(
            "text-[11px] shrink-0 w-[72px] justify-center",
            overdue
              ? "border-[#A12C7B]/30 text-[#A12C7B]"
              : item.status === "done"
                ? "border-[#01696F]/30 text-[#01696F]"
                : "border-[#D4D1CA] text-[#7A7974]",
          )}
        >
          {overdue ? "overdue" : item.status}
        </Badge>
      </div>

      {expanded && (
        <AiDraftSidePanel item={item} />
      )}
    </div>
  );
}

/* ── AI Draft Side Panel (F-310) ─────────────────────────────── */

const DRAFT_STATUS_LABELS: Record<ActionItemDraftStatus, string> = {
  pending: "Generating...",
  ready: "Draft Ready",
  approved: "Approved",
  sent: "Sent",
  rejected: "Rejected",
  no_context: "No draft — needs human",
};

const DRAFT_STATUS_COLORS: Record<ActionItemDraftStatus, string> = {
  pending: "text-[#B45309]",
  ready: "text-[#01696F]",
  approved: "text-[#01696F]",
  sent: "text-[#01696F]",
  rejected: "text-[#A12C7B]",
  no_context: "text-[#7A7974]",
};

function AiDraftSidePanel({ item }: { item: ActionItem }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.draft_text ?? "");
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();
  const editMutation = useEditDraft();
  const createDraft = useCreateDraft();

  const draftStatus = item.draft_status ?? "pending";
  const hasDraft = draftStatus === "ready" || draftStatus === "approved" || draftStatus === "sent";
  const isPending = draftStatus === "pending";

  return (
    <div className="ml-9 mr-2 mb-2 rounded bg-[#F7F6F2] p-3 space-y-3">
      {/* Draft status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-caption font-semibold text-[#28251D]">AI Draft</span>
          <span className={cn("text-caption", DRAFT_STATUS_COLORS[draftStatus])}>
            {isPending && (
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#B45309] border-t-transparent" />
              </span>
            )}
            {DRAFT_STATUS_LABELS[draftStatus]}
          </span>
        </div>
        {item.draft_generated_at && (
          <span className="text-[11px] text-[#7A7974]">
            Generated {formatDate(item.draft_generated_at)}
          </span>
        )}
      </div>

      {/* Draft content */}
      {hasDraft && item.draft_text && !editing && (
        <pre className="text-body whitespace-pre-wrap bg-white rounded border border-[#D4D1CA]/50 p-3 text-[#28251D]">
          {item.draft_text}
        </pre>
      )}

      {/* No context message */}
      {draftStatus === "no_context" && item.draft_text && (
        <div className="rounded border border-[#D4D1CA]/50 bg-white p-3 text-caption text-[#7A7974]">
          {item.draft_text}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border border-[#D4D1CA] bg-white p-3 text-body text-[#28251D] min-h-[200px] resize-y focus:outline-none focus:border-[#01696F]"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editMutation.isPending || !editText.trim()}
              onClick={() => {
                editMutation.mutate(
                  { id: item.id, edited_text: editText },
                  { onSuccess: () => setEditing(false) },
                );
              }}
              className="text-caption px-3 py-1 rounded bg-[#01696F] text-white hover:bg-[#01696F]/90 transition-colors disabled:opacity-50"
            >
              {editMutation.isPending ? "Saving..." : "Save Edit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditText(item.draft_text ?? "");
              }}
              className="text-caption px-3 py-1 rounded border border-[#D4D1CA] text-[#7A7974] hover:text-[#28251D] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject mode */}
      {rejectMode && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border border-[#D4D1CA] bg-white p-3 text-body text-[#28251D] min-h-[80px] resize-y focus:outline-none focus:border-[#A12C7B]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this draft not acceptable? (captured for training)"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              onClick={() => {
                rejectMutation.mutate(
                  { id: item.id, reason: rejectReason.trim() },
                  {
                    onSuccess: () => {
                      setRejectMode(false);
                      setRejectReason("");
                    },
                  },
                );
              }}
              className="text-caption px-3 py-1 rounded bg-[#A12C7B] text-white hover:bg-[#A12C7B]/90 transition-colors disabled:opacity-50"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false);
                setRejectReason("");
              }}
              className="text-caption px-3 py-1 rounded border border-[#D4D1CA] text-[#7A7974] hover:text-[#28251D] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {draftStatus === "ready" && !editing && !rejectMode && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={approveMutation.isPending}
            onClick={() => approveMutation.mutate({ id: item.id })}
            className="text-caption px-3 py-1 rounded bg-[#01696F] text-white hover:bg-[#01696F]/90 transition-colors disabled:opacity-50"
          >
            {approveMutation.isPending ? "Approving..." : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            className="text-caption px-3 py-1 rounded border border-[#A12C7B]/30 text-[#A12C7B] hover:bg-[#A12C7B]/10 transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => {
              setEditText(item.draft_text ?? "");
              setEditing(true);
            }}
            className="text-caption px-3 py-1 rounded border border-[#D4D1CA] text-[#7A7974] hover:text-[#28251D] hover:border-[#01696F] transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {/* R1 evidence citations */}
      {item.draft_evidence_ids && item.draft_evidence_ids.length > 0 && (
        <div className="space-y-1">
          <span className="text-[11px] text-[#7A7974] uppercase tracking-wider">Sources</span>
          <div className="flex flex-wrap gap-1">
            {item.draft_evidence_ids.map((ref, idx) => (
              <Link
                key={idx}
                href={ref.url}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[#01696F]/10 text-[#01696F] border border-[#01696F]/20 hover:bg-[#01696F]/20 transition-colors"
              >
                {ref.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Legacy drafts section */}
      {item.drafts && item.drafts.length > 0 && (
        <div className="space-y-1 border-t border-[#D4D1CA]/30 pt-2">
          <span className="text-[11px] text-[#7A7974] uppercase tracking-wider">Additional Drafts</span>
          <div className="flex gap-1.5 mb-1">
            {DRAFT_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={createDraft.isPending}
                onClick={() => createDraft.mutate({ id: item.id, kind })}
                className="text-caption px-2 py-0.5 rounded border border-[#D4D1CA] hover:border-[#01696F] transition-colors disabled:opacity-50"
              >
                {kind === "reply" ? "Reply Draft" : kind === "research" ? "Research" : "Milestone"}
              </button>
            ))}
          </div>
          {item.drafts.map((draft) => (
            <LegacyDraftRow key={draft.id} draft={draft} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Legacy draft row (expandable) ───────────────────────────── */

function LegacyDraftRow({ draft }: { draft: ActionItemDraft }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-[#D4D1CA]/50 px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Badge variant="outline" className="text-[11px] shrink-0">
          {draft.kind}
        </Badge>
        <DraftStatusChip status={draft.status} />
        <span className="text-caption text-[#7A7974] line-clamp-2 flex-1">
          {draft.status === "generating"
            ? "Generating..."
            : draft.content.slice(0, 120)}
        </span>
      </button>

      {open && draft.status === "done" && (
        <pre className="text-caption whitespace-pre-wrap bg-[#F7F6F2] rounded p-2 mt-1">
          {draft.content}
        </pre>
      )}
    </div>
  );
}

function DraftStatusChip({
  status,
}: {
  status: ActionItemDraft["status"];
}) {
  if (status === "generating") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[#B45309]">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#B45309] border-t-transparent" />
        generating
      </span>
    );
  }
  if (status === "failed") {
    return <span className="text-[11px] text-[#A12C7B]">failed</span>;
  }
  return <span className="text-[11px] text-[#01696F]">done</span>;
}
