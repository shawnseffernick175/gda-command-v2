"use client";

import { useState } from "react";
import { useAddMilestone, useUpdateMilestone } from "@/hooks/use-capture-reviews";
import type { CaptureMilestone } from "@/lib/types";

interface MilestonesTabProps {
  captureId: number | string;
  milestones: CaptureMilestone[];
}

export function MilestonesTab({ captureId, milestones }: MilestonesTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const addMilestone = useAddMilestone(captureId);
  const updateMilestone = useUpdateMilestone(captureId);

  function handleAdd() {
    if (!newName || !newDate) return;
    addMilestone.mutate(
      { milestone_name: newName, due_date: newDate },
      { onSuccess: () => { setShowAdd(false); setNewName(""); setNewDate(""); } }
    );
  }

  function handleStatusChange(id: number, status: string) {
    updateMilestone.mutate({ id, status } as { id: number } & Partial<CaptureMilestone>);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">Milestones</h3>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded border border-gda-green/30 bg-gda-green/10 px-2 py-1 text-[12px] font-medium text-gda-green hover:bg-gda-green/20"
        >
          + Add
        </button>
      </div>

      {milestones.length === 0 ? (
        <p className="text-xs text-muted-foreground">No milestones. Add one to track 90-day capture increments.</p>
      ) : (
        <div className="space-y-2">
          {milestones.map((m) => {
            const isOverdue = m.status !== "complete" && m.due_date < today;
            return (
              <div key={m.id} className="flex items-center justify-between rounded border border-border bg-gda-panel px-3 py-2">
                <div className="flex items-center gap-2">
                  <select
                    value={m.status}
                    onChange={(e) => handleStatusChange(m.id, e.target.value)}
                    className="rounded border border-border bg-gda-bg-deep px-1 py-0.5 text-[12px] text-foreground"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                    <option value="slipped">Slipped</option>
                  </select>
                  <span className="text-xs text-foreground">{m.milestone_name}</span>
                </div>
                <span className={`text-[12px] tabular-nums ${isOverdue ? "text-gda-red font-medium" : "text-muted-foreground"}`}>
                  {m.due_date}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="rounded border border-border bg-gda-bg-deep p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Milestone name"
            className="w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={addMilestone.isPending}
              className="rounded border border-gda-green/30 bg-gda-green/10 px-2 py-1 text-[12px] font-medium text-gda-green hover:bg-gda-green/20"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded border border-border px-2 py-1 text-[12px] text-muted-foreground hover:bg-gda-panel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
