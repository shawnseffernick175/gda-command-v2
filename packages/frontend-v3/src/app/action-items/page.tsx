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
import type { ActionItem, ActionItemDraft, ActionItemPriority } from "@/lib/types";
import Link from "next/link";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Overdue", value: "overdue" },
  { label: "Done", value: "done" },
] as const;

const DRAFT_KINDS = ["reply", "research", "milestone"] as const;

const PRIORITY_COLORS: Record<ActionItemPriority, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const SOURCE_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  risk: "Risk",
  award: "Award",
  capture: "Capture",
};

const SOURCE_ROUTES: Record<string, string> = {
  opportunity: "/opportunities",
  risk: "/risks",
  award: "/awards",
  capture: "/capture",
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

export default function ActionItemsPage() {
  return (
    <Suspense fallback={<div />}>
      <ActionItemsContent />
    </Suspense>
  );
}

function ActionItemsContent() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const { sortBy, sortDir, handleSort, sortParams } = useTableSort();

  const filterKey = `${statusFilter ?? "__all__"}|${sortParams.sort_by ?? ""}|${sortParams.sort_dir ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, isLoading, error, refetch } = useActionItems({
    status: statusFilter,
    page,
    ...sortParams,
  });

  const items = data?.items ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;
  const updateItem = useUpdateActionItem();

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Action Items
        </h1>

        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-mono transition-colors",
                statusFilter === f.value
                  ? "bg-gda-green/20 text-gda-green border border-gda-green/30"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
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
          description="Action items are created from pursuits, captures, and reviews."
        />
      ) : (
        <>
          {/* Sort header row */}
          <div className="rounded-t border border-b-0 border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gda-bg-base text-muted-foreground">
                  <SortableHeader label="Priority" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="80px" />
                  <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                  <SortableHeader label="Due" field="due_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                  <SortableHeader label="Source" field="source_type" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} width="100px" />
                </tr>
              </thead>
            </table>
          </div>
          <Card className="border-border bg-gda-panel overflow-hidden rounded-t-none">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
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
  const sourceType = item.linked_record_type ?? item.source_type;
  const sourceId = item.linked_record_id;

  return (
    <div
      ref={rowRef}
      className={cn(
        "transition-colors",
        highlighted && "bg-gda-green/5 ring-1 ring-gda-green/30",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gda-bg-base transition-colors">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() =>
            onToggle(item.id, item.status === "done" ? "open" : "done")
          }
          className={cn(
            "h-4 w-4 rounded border transition-colors shrink-0",
            item.status === "done"
              ? "bg-gda-green border-gda-green"
              : "border-border hover:border-gda-green",
          )}
        />

        {/* Priority badge */}
        <Badge
          variant="outline"
          className={cn("text-[11px] font-mono shrink-0", PRIORITY_COLORS[priority])}
        >
          {priority}
        </Badge>

        {/* Title */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex-1 text-left text-foreground hover:text-gda-green transition-colors truncate",
            item.status === "done" && "line-through text-muted-foreground",
          )}
        >
          {item.title}
        </button>

        {/* Due date */}
        {item.due_date && (
          <span
            className={cn(
              "font-mono text-[11px] shrink-0",
              overdue ? "text-red-400" : "text-muted-foreground",
            )}
          >
            {formatDate(item.due_date)}
          </span>
        )}

        {/* Source link chip */}
        {sourceType && sourceId && (
          <Link
            href={`${SOURCE_ROUTES[sourceType] ?? "/"}?id=${sourceId}`}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-mono bg-gda-cyan/10 text-gda-cyan border border-gda-cyan/20 hover:bg-gda-cyan/20 transition-colors"
          >
            {SOURCE_LABELS[sourceType] ?? sourceType} →
          </Link>
        )}

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
            "text-[11px] shrink-0",
            overdue
              ? "border-gda-red/30 text-gda-red"
              : item.status === "done"
                ? "border-gda-green/30 text-gda-green"
                : "border-border text-muted-foreground",
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
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors max-w-[100px] truncate"
      >
        {currentAssigneeName ?? "Unassigned"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-gda-panel shadow-lg py-1">
          <button
            type="button"
            onClick={() => {
              onAssign(null);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gda-bg-base transition-colors text-muted-foreground"
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
                "w-full text-left px-3 py-1.5 text-xs hover:bg-gda-bg-base transition-colors",
                u.id === currentAssigneeId
                  ? "text-gda-green"
                  : "text-foreground",
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
    <div className="ml-9 mr-2 mb-2 rounded bg-gda-bg-base p-2 space-y-2">
      <div className="flex gap-1.5">
        {DRAFT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={createDraft.isPending}
            onClick={() => createDraft.mutate({ id: itemId, kind })}
            className="text-xs font-mono px-2 py-0.5 rounded border border-border hover:border-gda-green transition-colors disabled:opacity-50"
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
    <div className="rounded border border-border/50 px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Badge variant="outline" className="text-[11px] shrink-0">
          {draft.kind}
        </Badge>
        <DraftStatusChip status={draft.status} />
        <span className="text-xs text-muted-foreground line-clamp-2 flex-1">
          {draft.status === "generating"
            ? "Generating…"
            : draft.content.slice(0, 120)}
        </span>
      </button>

      {open && draft.status === "done" && (
        <pre className="text-xs whitespace-pre-wrap bg-gda-bg-base rounded p-2 mt-1">
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
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        generating
      </span>
    );
  }
  if (status === "failed") {
    return <span className="text-[11px] text-gda-red">failed</span>;
  }
  return <span className="text-[11px] text-gda-green">done</span>;
}
