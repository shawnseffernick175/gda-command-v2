"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  useSitreps,
  useSitrep,
  useCreateSitrep,
  useUpdateSitrep,
  useDeleteSitrep,
} from "@/hooks/use-sitrep";
import type { SitrepItem } from "@/hooks/use-sitrep";
import { Skeleton } from "@/components/ui/skeleton";

function formatWeekEnding(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getNextFriday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day <= 5 ? 5 - day : 5 + (7 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const WEEK_AGO_ISO = new Date(Date.now() - 7 * 86_400_000)
  .toISOString()
  .slice(0, 10);

export default function WeeklySitrep() {
  const { data: sitreps, isLoading } = useSitreps();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 bg-gda-panel-alt" />
        <Skeleton className="h-40 bg-gda-panel-alt" />
      </div>
    );
  }

  if (creating) {
    return (
      <SitrepForm
        onClose={() => setCreating(false)}
        nextNumber={(sitreps?.length ?? 0) + 1}
      />
    );
  }

  if (selectedId !== null) {
    return (
      <SitrepDetail
        id={selectedId}
        editing={editing}
        onBack={() => {
          setSelectedId(null);
          setEditing(false);
        }}
        onEdit={() => setEditing(true)}
        onStopEdit={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">
          Saved weekly situation reports
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded border border-border bg-gda-panel px-2.5 py-1 font-mono text-xs text-foreground hover:bg-gda-panel-alt transition-colors"
        >
          + New SITREP
        </button>
      </div>
      {!sitreps || sitreps.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No SITREPs yet. Click + New SITREP to create the first one.
        </p>
      ) : (
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                #
              </th>
              <th className="py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Week Ending
              </th>
              <th className="py-1.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {sitreps.map((s) => (
              <tr
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="border-b border-border cursor-pointer hover:bg-gda-panel-alt transition-colors"
              >
                <td className="py-1.5 text-foreground tabular-nums">{s.sitrep_number}</td>
                <td className="py-1.5 text-foreground">{formatWeekEnding(s.week_ending)}</td>
                <td className="py-1.5 text-right text-muted-foreground">
                  {formatWeekEnding(s.created_at.slice(0, 10))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SitrepDetail({
  id,
  editing,
  onBack,
  onEdit,
  onStopEdit,
}: {
  id: number;
  editing: boolean;
  onBack: () => void;
  onEdit: () => void;
  onStopEdit: () => void;
}) {
  const { data: sitrep, isLoading } = useSitrep(id);
  const updateMutation = useUpdateSitrep();
  const deleteMutation = useDeleteSitrep();

  const [editItems, setEditItems] = useState<SitrepItem[]>([]);

  const startEdit = useCallback(() => {
    if (sitrep?.items) {
      setEditItems(sitrep.items.map((it) => ({ ...it })));
    }
    onEdit();
  }, [sitrep, onEdit]);

  function saveEdit() {
    if (!sitrep) return;
    updateMutation.mutate(
      {
        id: sitrep.id,
        payload: {
          items: editItems.map((it, idx) => ({
            topic: it.topic,
            discussion: it.discussion,
            action_items: it.action_items,
            sort_order: idx,
          })),
        },
      },
      {
        onSuccess: () => onStopEdit(),
      },
    );
  }

  function handleDelete() {
    if (!confirm("Delete this SITREP? This cannot be undone.")) return;
    deleteMutation.mutate(id, {
      onSuccess: () => onBack(),
    });
  }

  if (isLoading || !sitrep) {
    return <Skeleton className="h-40 bg-gda-panel-alt" />;
  }

  const isCurrentWeek = sitrep.week_ending >= WEEK_AGO_ISO;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-xs text-gda-cyan hover:underline"
        >
          &#x2190; All SITREPs
        </button>
        <div className="flex items-center gap-2">
          {isCurrentWeek && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="rounded border border-border bg-gda-panel px-2.5 py-1 font-mono text-xs text-foreground hover:bg-gda-panel-alt transition-colors"
            >
              Edit
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={updateMutation.isPending}
                className="rounded border border-gda-green bg-gda-green/15 px-2.5 py-1 font-mono text-xs text-gda-green hover:bg-gda-green/25 transition-colors"
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={onStopEdit}
                className="rounded border border-border bg-gda-panel px-2.5 py-1 font-mono text-xs text-foreground hover:bg-gda-panel-alt transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded border border-border bg-gda-panel px-2.5 py-1 font-mono text-xs text-gda-red hover:bg-gda-panel-alt transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs font-semibold text-foreground">
          SITREP #{sitrep.sitrep_number}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          Week ending {formatWeekEnding(sitrep.week_ending)}
        </span>
      </div>

      {editing ? (
        <SitrepItemsEditor items={editItems} setItems={setEditItems} />
      ) : (
        <SitrepItemsTable items={sitrep.items ?? []} />
      )}
    </div>
  );
}

function SitrepItemsTable({ items }: { items: SitrepItem[] }) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No items in this SITREP.
      </p>
    );
  }

  return (
    <table className="w-full font-mono text-xs">
      <thead>
        <tr className="border-b border-border">
          <th className="py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium w-8">
            #
          </th>
          <th className="py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Topic
          </th>
          <th className="py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Discussion
          </th>
          <th className="py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Action Items / Follow-Up
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={item.id ?? idx} className="border-b border-border align-top">
            <td className="py-1.5 text-muted-foreground tabular-nums">{idx + 1}</td>
            <td className="py-1.5 text-foreground font-medium">
              {item.topic}
              {item.source_document_id && (
                <Link
                  href={`/vault?id=${item.source_document_id}`}
                  className="ml-2 text-[11px] text-accent hover:underline font-normal"
                >
                  [doc]
                </Link>
              )}
            </td>
            <td className="py-1.5 text-foreground whitespace-pre-wrap">{item.discussion}</td>
            <td className="py-1.5 text-foreground whitespace-pre-wrap">{item.action_items}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SitrepItemsEditor({
  items,
  setItems,
}: {
  items: SitrepItem[];
  setItems: (items: SitrepItem[]) => void;
}) {
  function updateField(
    index: number,
    field: "topic" | "discussion" | "action_items",
    value: string,
  ) {
    const updated = [...items];
    updated[index] = { ...updated[index]!, [field]: value };
    setItems(updated);
  }

  function addRow() {
    setItems([
      ...items,
      { topic: "", discussion: "", action_items: "", sort_order: items.length },
    ]);
  }

  function removeRow(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-border pb-2"
        >
          <input
            value={item.topic}
            onChange={(e) => updateField(idx, "topic", e.target.value)}
            placeholder="Topic"
            className="rounded border border-border bg-gda-bg-base px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground"
          />
          <textarea
            value={item.discussion}
            onChange={(e) => updateField(idx, "discussion", e.target.value)}
            placeholder="Discussion"
            rows={2}
            className="rounded border border-border bg-gda-bg-base px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground resize-y"
          />
          <textarea
            value={item.action_items}
            onChange={(e) => updateField(idx, "action_items", e.target.value)}
            placeholder="Action Items / Follow-Up"
            rows={2}
            className="rounded border border-border bg-gda-bg-base px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground resize-y"
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="self-start rounded border border-border bg-gda-panel px-1.5 py-1 font-mono text-xs text-gda-red hover:bg-gda-panel-alt transition-colors"
          >
            &#x00D7;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="rounded border border-border bg-gda-panel px-2.5 py-1 font-mono text-xs text-foreground hover:bg-gda-panel-alt transition-colors"
      >
        + Add Row
      </button>
    </div>
  );
}

function SitrepForm({
  onClose,
  nextNumber,
}: {
  onClose: () => void;
  nextNumber: number;
}) {
  const createMutation = useCreateSitrep();
  const [sitrepNumber, setSitrepNumber] = useState(nextNumber);
  const [weekEnding, setWeekEnding] = useState(getNextFriday());
  const [items, setItems] = useState<SitrepItem[]>([
    { topic: "", discussion: "", action_items: "", sort_order: 0 },
  ]);

  function handleCreate() {
    createMutation.mutate(
      {
        sitrep_number: sitrepNumber,
        week_ending: weekEnding,
        items: items.map((it, idx) => ({
          topic: it.topic,
          discussion: it.discussion,
          action_items: it.action_items,
          sort_order: idx,
        })),
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-xs text-gda-cyan hover:underline"
        >
          &#x2190; Back
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="rounded border border-gda-green bg-gda-green/15 px-2.5 py-1 font-mono text-xs text-gda-green hover:bg-gda-green/25 transition-colors"
        >
          {createMutation.isPending ? "Creating..." : "Create SITREP"}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          SITREP #
          <input
            type="number"
            value={sitrepNumber}
            onChange={(e) => setSitrepNumber(Number(e.target.value))}
            className="w-16 rounded border border-border bg-gda-bg-base px-2 py-1 font-mono text-xs text-foreground tabular-nums"
          />
        </label>
        <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          Week Ending
          <input
            type="date"
            value={weekEnding}
            onChange={(e) => setWeekEnding(e.target.value)}
            className="rounded border border-border bg-gda-bg-base px-2 py-1 font-mono text-xs text-foreground"
          />
        </label>
      </div>

      <SitrepItemsEditor items={items} setItems={setItems} />
    </div>
  );
}
