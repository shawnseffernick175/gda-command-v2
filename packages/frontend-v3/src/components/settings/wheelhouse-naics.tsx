"use client";

import { useState } from "react";
import {
  useWheelhouseNaics,
  useAddWheelhouseNaics,
  useRemoveWheelhouseNaics,
} from "@/hooks/use-awards";

export function WheelhouseNaicsPanel() {
  const { data, isLoading } = useWheelhouseNaics();
  const addNaics = useAddWheelhouseNaics();
  const removeNaics = useRemoveWheelhouseNaics();

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newReason, setNewReason] = useState("");

  const items = data?.items ?? [];
  const activeItems = items.filter((n) => n.active);
  const inactiveItems = items.filter((n) => !n.active);

  function handleAdd() {
    if (!newCode.trim()) return;
    addNaics.mutate(
      { naics: newCode.trim(), label: newLabel.trim() || undefined, reason: newReason.trim() || undefined },
      {
        onSuccess: () => {
          setNewCode("");
          setNewLabel("");
          setNewReason("");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        NAICS codes in this list define the Envision wheelhouse filter for Awards & Intel.
        Awards outside these codes are excluded from the default view.
      </p>

      {/* Add form */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[12px] font-mono text-muted-foreground mb-1">NAICS Code</label>
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="541330"
            className="rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-24"
          />
        </div>
        <div>
          <label className="block text-[12px] font-mono text-muted-foreground mb-1">Label</label>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Engineering Services"
            className="rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-48"
          />
        </div>
        <div>
          <label className="block text-[12px] font-mono text-muted-foreground mb-1">Reason</label>
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="RS3 + OASIS+"
            className="rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-40"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!newCode.trim() || addNaics.isPending}
          className="rounded border border-gda-cyan/40 bg-gda-cyan/10 px-3 py-1.5 text-xs font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
        >
          {addNaics.isPending ? "Adding…" : "+ Add"}
        </button>
      </div>

      {/* Active codes */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gda-bg-base" />
          ))}
        </div>
      ) : activeItems.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
            Active ({activeItems.length})
          </p>
          {activeItems.map((n) => (
            <div
              key={n.naics}
              className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2"
            >
              <span className="font-mono text-xs text-foreground w-16 shrink-0 tabular-nums">
                {n.naics}
              </span>
              <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                {n.label ?? "—"}
              </span>
              <span className="text-[12px] text-muted-foreground italic shrink-0">
                {n.reason ?? ""}
              </span>
              <button
                onClick={() => removeNaics.mutate(n.naics)}
                disabled={removeNaics.isPending}
                className="text-[12px] font-mono text-muted-foreground hover:text-gda-red transition-colors shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No active NAICS codes configured.</p>
      )}

      {/* Inactive codes */}
      {inactiveItems.length > 0 && (
        <div className="space-y-1 pt-2">
          <p className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
            Inactive ({inactiveItems.length})
          </p>
          {inactiveItems.map((n) => (
            <div
              key={n.naics}
              className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2 opacity-60"
            >
              <span className="font-mono text-xs text-foreground w-16 shrink-0 tabular-nums">
                {n.naics}
              </span>
              <span className="text-xs text-foreground flex-1 min-w-0 truncate">
                {n.label ?? "—"}
              </span>
              <button
                onClick={() => addNaics.mutate({ naics: n.naics, label: n.label ?? undefined, reason: n.reason ?? undefined })}
                disabled={addNaics.isPending}
                className="text-[12px] font-mono text-gda-cyan hover:underline shrink-0"
              >
                Re-activate
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
