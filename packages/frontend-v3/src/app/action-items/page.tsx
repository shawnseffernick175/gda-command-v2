"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  useActionItems,
  useUpdateActionItem,
  useCreateDraft,
  useUsers,
} from "@/hooks/use-action-items";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/Pagination";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";
import type {
  ActionItem,
  ActionItemDraft,
  ActionItemPriority,
  DoctrineSource,
} from "@/lib/types";
import Link from "next/link";

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
      return { href: `/capture?id=${captureId}`, label: "Capture" };
    }
  }
  if (ds === "recompete_expiring") {
    const awardId = item.award_id ?? item.linked_record_id;
    if (awardId) {
      return { href: `/awards?id=${awardId}`, label: "Award" };
    }
  }
  if (item.linked_record_type && item.linked_record_id) {
    const routes: Record<string, string> = {
      capture: "/capture",
      award: "/awards",
    };
    const route = routes[item.linked_record_type] ?? "/";
    return { href: `${route}?id=${item.linked_record_id}`, label: item.linked_record_type };
  }
  return null;
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
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
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
        <h1 className="text-section font-semibold text-foreground">
          Action Items
        </h1>

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
          {/* Source filter */}
          <div className="flex gap-1">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setSourceFilter(f.value)}
                className={cn(
                  "rounded px-2 py-0.5 text-caption transition-colors border",
                  sourceFilter === f.value
                    ? "bg-[#01696F]/15 text-[#01696F] border-[#01696F]/30"
                    : "text-[#7A7974] border-transparent hover:text-[#28251D] hover:border-[#D4D1CA]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Severity filter */}
          <div className="flex gap-1">
            {SEVERITY_FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setSeverityFilter(f.value)}
                className={cn(
                  "rounded px-2 py-0.5 text-caption transition-colors border",
                  severityFilter === f.value
                    ? "bg-[#01696F]/15 text-[#01696F] border-[#01696F]/30"
                    : "text-[#7A7974] border-transparent hover:text-[#28251D] hover:border-[#D4D1CA]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Owner filter */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setOwnerFilter(undefined)}
              className={cn(
                "rounded px-2 py-0.5 text-caption transition-colors border",
                !ownerFilter
                  ? "bg-[#01696F]/15 text-[#01696F] border-[#01696F]/30"
                  : "text-[#7A7974] border-transparent hover:text-[#28251D] hover:border-[#D4D1CA]",
              )}
            >
              All Owners
            </button>
            {(users ?? []).slice(0, 5).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setOwnerFilter(u.display_name)}
                className={cn(
                  "rounded px-2 py-0.5 text-caption transition-colors border truncate max-w-[120px]",
                  ownerFilter === u.display_name
                    ? "bg-[#01696F]/15 text-[#01696F] border-[#01696F]/30"
                    : "text-[#7A7974] border-transparent hover:text-[#28251D] hover:border-[#D4D1CA]",
                )}
              >
                {u.display_name}
              </button>
            ))}
          </div>
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
          {/* Sort header row */}
          <div className="rounded-t border border-b-0 border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gda-bg-base text-muted-foreground">
                  <SortableHeader label="Priority" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                  <SortableHeader label="Source" field="doctrine_source" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                  <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Due" field="due_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                </tr>
              </thead>
            </table>
          </div>
          <Card className="border-border bg-gda-panel overflow-hidden rounded-t-none">
            <CardContent className="p-0">
              {/* Table header */}
              <div className="flex items-center gap-3 px-3 py-2 border-b border-[#D4D1CA] text-caption text-[#7A7974] uppercase tracking-[0.04em]">
                <span className="w-4" />
                <span className="w-[72px] shrink-0">Severity</span>
                <span className="w-[72px] shrink-0">Source</span>
                <span className="flex-1">Title</span>
                <span className="w-[80px] shrink-0 text-right tabular-nums">Due</span>
                <span className="w-[72px] shrink-0">Link</span>
                <span className="w-[100px] shrink-0">Owner</span>
                <span className="w-[72px] shrink-0">Status</span>
              </div>
              <div className="divide-y divide-[#D4D1CA]">
                {items.map((item) => (
                  <ActionItemRow
                    key={item.id}
                    item={item}
                    highlighted={String(item.id) === highlightId}
                    onToggle={(id, status) =>
                      updateItem.mutate({ id, status })
                    }
                    onAssign={(id, assignee_id) =>
                      updateItem.mutate({ id, assignee_id })
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
  onAssign,
}: {
  item: ActionItem;
  highlighted: boolean;
  onToggle: (id: number, status: string) => void;
  onAssign: (id: number, assignee_id: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const overdue = isOverdue(item);
  const priority = item.priority ?? "MEDIUM";
  const doctrineSource = item.doctrine_source ?? "manual";
  const link = getLinkForItem(item);

  return (
    <div
      ref={rowRef}
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
        <AssigneePicker
          currentAssigneeId={item.assignee_id}
          currentAssigneeName={item.assignee?.name ?? null}
          onAssign={(assigneeId) => onAssign(item.id, assigneeId)}
        />

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
        <DraftPanel itemId={item.id} drafts={item.drafts ?? []} />
      )}
    </div>
  );
}

/* ── Assignee picker ─────────────────────────────────────────── */

function AssigneePicker({
  currentAssigneeId,
  currentAssigneeName,
  onAssign,
}: {
  currentAssigneeId: number | null;
  currentAssigneeName: string | null;
  onAssign: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: users } = useUsers();

  return (
    <div className="relative shrink-0 w-[100px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-caption text-[#7A7974] hover:text-[#28251D] transition-colors max-w-[100px] truncate"
      >
        {currentAssigneeName ?? "Unassigned"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded border border-[#D4D1CA] bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={() => {
              onAssign(null);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-caption hover:bg-[#F7F6F2] transition-colors text-[#7A7974]"
          >
            Unassigned
          </button>
          {(users ?? []).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onAssign(u.id);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-caption hover:bg-[#F7F6F2] transition-colors",
                u.id === currentAssigneeId
                  ? "text-[#01696F]"
                  : "text-[#28251D]",
              )}
            >
              {u.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Draft panel (shown when an item row is expanded) ────────── */

function DraftPanel({
  itemId,
  drafts,
}: {
  itemId: number;
  drafts: ActionItemDraft[];
}) {
  const createDraft = useCreateDraft();

  return (
    <div className="ml-9 mr-2 mb-2 rounded bg-[#F7F6F2] p-2 space-y-2">
      <div className="flex gap-1.5">
        {DRAFT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={createDraft.isPending}
            onClick={() => createDraft.mutate({ id: itemId, kind })}
            className="text-caption px-2 py-0.5 rounded border border-[#D4D1CA] hover:border-[#01696F] transition-colors disabled:opacity-50"
          >
            {kind === "reply"
              ? "Reply Draft"
              : kind === "research"
                ? "Research"
                : "Milestone"}
          </button>
        ))}
      </div>

      {drafts.length > 0 && (
        <div className="space-y-1">
          {drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Single draft row (expandable) ───────────────────────────── */

function DraftRow({ draft }: { draft: ActionItemDraft }) {
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
            ? "Generating…"
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
