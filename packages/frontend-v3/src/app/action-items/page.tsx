"use client";

import { useState } from "react";
import {
  useActionItems,
  useUpdateActionItem,
  useCreateDraft,
} from "@/hooks/use-action-items";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";
import type { ActionItem, ActionItemDraft } from "@/lib/types";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Overdue", value: "overdue" },
  { label: "Done", value: "done" },
] as const;

const DRAFT_KINDS = ["reply", "research", "milestone"] as const;

export default function ActionItemsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data, isLoading, error, refetch } = useActionItems({
    status: statusFilter,
  });

  const items = data?.items ?? [];

  const updateItem = useUpdateActionItem();

  const overdue = items.filter((i) => i.status === "overdue");
  const open = items.filter((i) => i.status === "open");
  const inProgress = items.filter((i) => i.status === "in_progress");
  const done = items.filter((i) => i.status === "done");

  return (
    <div className="space-y-4">
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
        <Card className="border-border bg-gda-panel overflow-hidden">
          <CardContent className="p-0">
            {overdue.length > 0 && (
              <CollapseSection
                id="ai-overdue"
                title="Overdue"
                count={overdue.length}
                defaultOpen={true}
              >
                <ActionItemGroup
                  items={overdue}
                  onToggle={(id, status) =>
                    updateItem.mutate({ id, status })
                  }
                />
              </CollapseSection>
            )}
            <CollapseSection
              id="ai-open"
              title="Open"
              count={open.length}
              defaultOpen={false}
            >
              <ActionItemGroup
                items={open}
                onToggle={(id, status) =>
                  updateItem.mutate({ id, status })
                }
              />
            </CollapseSection>
            <CollapseSection
              id="ai-progress"
              title="In Progress"
              count={inProgress.length}
              defaultOpen={false}
            >
              <ActionItemGroup
                items={inProgress}
                onToggle={(id, status) =>
                  updateItem.mutate({ id, status })
                }
              />
            </CollapseSection>
            <CollapseSection
              id="ai-done"
              title="Done"
              count={done.length}
              defaultOpen={false}
            >
              <ActionItemGroup
                items={done}
                onToggle={(id, status) =>
                  updateItem.mutate({ id, status })
                }
              />
            </CollapseSection>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionItemGroup({
  items,
  onToggle,
}: {
  items: ActionItem[];
  onToggle: (id: number, status: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id}>
          <div className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-gda-bg-base transition-colors">
            <button
              type="button"
              onClick={() =>
                onToggle(
                  item.id,
                  item.status === "done" ? "open" : "done",
                )
              }
              className={cn(
                "h-4 w-4 rounded border transition-colors shrink-0",
                item.status === "done"
                  ? "bg-gda-green border-gda-green"
                  : "border-border hover:border-gda-green",
              )}
            />
            <button
              type="button"
              onClick={() =>
                setExpandedId(expandedId === item.id ? null : item.id)
              }
              className={cn(
                "flex-1 text-left text-foreground hover:text-gda-green transition-colors",
                item.status === "done" && "line-through text-muted-foreground",
              )}
            >
              {item.title}
            </button>
            {item.owner && (
              <span className="text-xs text-muted-foreground">
                {item.owner}
              </span>
            )}
            {item.due_date && (
              <span
                className={cn(
                  "font-mono text-[11px]",
                  item.status === "overdue"
                    ? "text-gda-red"
                    : "text-muted-foreground",
                )}
              >
                {new Date(item.due_date).toLocaleDateString()}
              </span>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[11px]",
                item.status === "overdue"
                  ? "border-gda-red/30 text-gda-red"
                  : item.status === "done"
                    ? "border-gda-green/30 text-gda-green"
                    : "border-border text-muted-foreground",
              )}
            >
              {item.status}
            </Badge>
          </div>

          {expandedId === item.id && (
            <DraftPanel itemId={item.id} drafts={item.drafts ?? []} />
          )}
        </div>
      ))}
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
