"use client";

import { useState } from "react";
import { useActionItems, useUpdateActionItem } from "@/hooks/use-action-items";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Overdue", value: "overdue" },
  { label: "Done", value: "done" },
] as const;

export default function ActionItemsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const { data, isLoading, error, refetch } = useActionItems({
    status: statusFilter,
  });
  const updateItem = useUpdateActionItem();

  const overdue = (data?.items ?? []).filter((i) => i.status === "overdue");
  const open = (data?.items ?? []).filter((i) => i.status === "open");
  const inProgress = (data?.items ?? []).filter(
    (i) => i.status === "in_progress",
  );
  const done = (data?.items ?? []).filter((i) => i.status === "done");

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
      ) : (data?.items ?? []).length === 0 ? (
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
  items: Array<{
    id: number;
    title: string;
    due_date: string | null;
    owner: string | null;
    status: string;
  }>;
  onToggle: (id: number, status: string) => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-gda-bg-base transition-colors"
        >
          <button
            type="button"
            onClick={() =>
              onToggle(
                item.id,
                item.status === "done" ? "open" : "done",
              )
            }
            className={cn(
              "h-4 w-4 rounded border transition-colors",
              item.status === "done"
                ? "bg-gda-green border-gda-green"
                : "border-border hover:border-gda-green",
            )}
          />
          <span
            className={cn(
              "flex-1 text-foreground",
              item.status === "done" && "line-through text-muted-foreground",
            )}
          >
            {item.title}
          </span>
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
      ))}
    </div>
  );
}
