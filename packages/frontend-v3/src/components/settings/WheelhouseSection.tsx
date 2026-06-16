"use client";

import { useState, useCallback } from "react";
import {
  useUpdateWheelhouse,
  useResetWheelhouse,
  type WheelhouseConfig,
} from "@/hooks/use-scoring-doctrine";

const SET_ASIDE_OPTIONS = ["8(a)", "SDVOSB", "WOSB", "HUBZone", "Small Business"];

function ChipListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = useCallback(() => {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setNewItem("");
  }, [newItem, items, onChange]);

  const removeItem = useCallback((item: string) => {
    onChange(items.filter((i) => i !== item));
  }, [items, onChange]);

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded border border-border bg-gda-panel px-2 py-0.5 text-xs text-foreground"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="text-muted-foreground hover:text-gda-red text-[10px]"
            >
              x
            </button>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-[11px] text-muted-foreground">None</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder={placeholder ?? "Add..."}
          className="rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 w-48"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!newItem.trim()}
          className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-gda-bg-base disabled:opacity-50"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

export function WheelhouseSection({ wheelhouse }: { wheelhouse: WheelhouseConfig }) {
  const [draft, setDraft] = useState<WheelhouseConfig>(wheelhouse);
  const [dirty, setDirty] = useState(false);

  const updateWheelhouse = useUpdateWheelhouse();
  const resetWheelhouse = useResetWheelhouse();

  function markDirty<K extends keyof WheelhouseConfig>(key: K, value: WheelhouseConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    updateWheelhouse.mutate(
      {
        naics_allowlist: draft.naics_allowlist,
        agency_allowlist: draft.agency_allowlist,
        dollar_min: draft.dollar_min,
        dollar_max: draft.dollar_max,
        setasides_pursued: draft.setasides_pursued,
      },
      { onSuccess: () => setDirty(false) },
    );
  }

  function handleReset() {
    resetWheelhouse.mutate(undefined, {
      onSuccess: (data) => {
        setDraft(data);
        setDirty(false);
      },
    });
  }

  function toggleSetAside(sa: string) {
    const next = draft.setasides_pursued.includes(sa)
      ? draft.setasides_pursued.filter((s) => s !== sa)
      : [...draft.setasides_pursued, sa];
    markDirty("setasides_pursued", next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Shared wheelhouse filter used by Awards & Intel, Pipeline, and Fast Track.
          One save updates all downstream views.
        </p>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetWheelhouse.isPending}
          className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-gda-bg-base transition-colors"
        >
          Reset to default
        </button>
      </div>

      {/* NAICS allowlist */}
      <div className="rounded border border-border bg-gda-bg-base px-4 py-3">
        <ChipListEditor
          label="NAICS allowlist"
          items={draft.naics_allowlist}
          onChange={(items) => markDirty("naics_allowlist", items)}
          placeholder="541330"
        />
      </div>

      {/* Agency allowlist */}
      <div className="rounded border border-border bg-gda-bg-base px-4 py-3">
        <ChipListEditor
          label="Agency allowlist"
          items={draft.agency_allowlist}
          onChange={(items) => markDirty("agency_allowlist", items)}
          placeholder="DoD-Army"
        />
      </div>

      {/* Dollar band */}
      <div className="rounded border border-border bg-gda-bg-base px-4 py-3 space-y-2">
        <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Dollar band</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Min $</span>
            <input
              type="number"
              value={draft.dollar_min}
              onChange={(e) => markDirty("dollar_min", parseInt(e.target.value) || 0)}
              className="w-32 rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
          <span className="text-[11px] text-muted-foreground">to</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Max $</span>
            <input
              type="number"
              value={draft.dollar_max}
              onChange={(e) => markDirty("dollar_max", parseInt(e.target.value) || 0)}
              className="w-32 rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
        </div>
      </div>

      {/* Set-asides */}
      <div className="rounded border border-border bg-gda-bg-base px-4 py-3 space-y-2">
        <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Set-asides we pursue</span>
        <div className="flex flex-wrap gap-3">
          {SET_ASIDE_OPTIONS.map((sa) => (
            <label key={sa} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.setasides_pursued.includes(sa)}
                onChange={() => toggleSetAside(sa)}
                className="rounded border-border"
              />
              <span className="text-xs text-foreground">{sa}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || updateWheelhouse.isPending}
          className={
            dirty
              ? "rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-medium text-gda-green hover:bg-gda-green/20 transition-colors"
              : "rounded border border-border px-4 py-1.5 text-xs text-muted-foreground cursor-not-allowed"
          }
        >
          {updateWheelhouse.isPending ? "Saving..." : "Save"}
        </button>
        {updateWheelhouse.isSuccess && !dirty && (
          <span className="text-xs text-gda-green">Saved</span>
        )}
      </div>
    </div>
  );
}
