"use client";

import { useState, useCallback } from "react";
import { useUpdateDoctrineRule } from "@/hooks/use-scoring-doctrine";
import type { DoctrineConfigRow } from "@/hooks/use-doctrine";

interface RuleDef {
  key: string;
  label: string;
  description: string;
  type: "number" | "chips" | "multiselect" | "thresholds";
}

const RULE_DEFS: RuleDef[] = [
  { key: "margin_floor", label: "Margin floor (%)", description: "Pursuits below this gross margin trigger the margin penalty.", type: "number" },
  { key: "must_win_pursuits", label: "Must-win pursuits", description: "Pursuits designated as must-win by CEO.", type: "chips" },
  { key: "evidence_required_for_must_win", label: "Evidence required for must-win", description: "Must-win decisions require evidence at this grade or better. [C] hypothesis cannot drive a must-win without an explicit override.", type: "multiselect" },
  { key: "alignment_thresholds", label: "Alignment score thresholds", description: "Score boundaries out of 40: weak / moderate / strong.", type: "thresholds" },
];

const EVIDENCE_OPTIONS = ["A", "B", "C"];

function NumberEditor({ value, onSave, saving }: { value: number; onSave: (v: number) => void; saving: boolean }) {
  const [draft, setDraft] = useState<number>(value);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={draft}
        onChange={(e) => { setDraft(parseFloat(e.target.value)); setDirty(true); }}
        className="w-20 rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-gda-green/50"
      />
      <span className="text-xs text-muted-foreground">%</span>
      {dirty && (
        <button
          type="button"
          onClick={() => { onSave(draft); setDirty(false); }}
          disabled={saving}
          className="rounded border border-gda-green bg-gda-green/10 px-2 py-0.5 text-[11px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}

function ChipEditor({ value, onSave, saving }: { value: string[]; onSave: (v: string[]) => void; saving: boolean }) {
  const [items, setItems] = useState<string[]>(Array.isArray(value) ? value : []);
  const [newItem, setNewItem] = useState("");
  const [dirty, setDirty] = useState(false);

  const addItem = useCallback(() => {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    const next = [...items, trimmed];
    setItems(next);
    setNewItem("");
    setDirty(true);
  }, [newItem, items]);

  const removeItem = useCallback((item: string) => {
    const next = items.filter((i) => i !== item);
    setItems(next);
    setDirty(true);
  }, [items]);

  return (
    <div className="space-y-2">
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
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="Add item..."
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
      {dirty && (
        <button
          type="button"
          onClick={() => { onSave(items); setDirty(false); }}
          disabled={saving}
          className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[11px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}

function MultiSelectEditor({ value, onSave, saving }: { value: string[]; onSave: (v: string[]) => void; saving: boolean }) {
  const [selected, setSelected] = useState<string[]>(Array.isArray(value) ? value : []);
  const [dirty, setDirty] = useState(false);

  function toggle(opt: string) {
    setSelected((prev) => {
      const next = prev.includes(opt) ? prev.filter((s) => s !== opt) : [...prev, opt];
      setDirty(true);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {EVIDENCE_OPTIONS.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="rounded border-border"
            />
            <span className="text-xs text-foreground font-mono">{opt}</span>
          </label>
        ))}
      </div>
      {dirty && (
        <button
          type="button"
          onClick={() => { onSave(selected); setDirty(false); }}
          disabled={saving}
          className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[11px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}

function ThresholdsEditor({
  value,
  onSave,
  saving,
}: {
  value: { weak: number; moderate: number; strong: number };
  onSave: (v: { weak: number; moderate: number; strong: number }) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);

  function handleChange(field: "weak" | "moderate" | "strong", v: number) {
    setDraft((prev) => ({ ...prev, [field]: v }));
    setDirty(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        {(["weak", "moderate", "strong"] as const).map((field) => (
          <div key={field} className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground capitalize">{field}</span>
            <input
              type="number"
              min={0}
              max={40}
              value={draft[field]}
              onChange={(e) => handleChange(field, parseInt(e.target.value) || 0)}
              className="w-14 rounded border border-border bg-gda-panel px-2 py-1 text-xs font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
        ))}
        <span className="text-[11px] text-muted-foreground">/ 40</span>
      </div>
      {dirty && (
        <button
          type="button"
          onClick={() => { onSave(draft); setDirty(false); }}
          disabled={saving}
          className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[11px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}

export function RulesSection({ rules }: { rules: DoctrineConfigRow[] }) {
  const updateRule = useUpdateDoctrineRule();

  function findRule(key: string): DoctrineConfigRow | undefined {
    return rules.find((r) => r.key === key);
  }

  function renderEditor(def: RuleDef) {
    const row = findRule(def.key);
    const val = row?.value;

    switch (def.type) {
      case "number":
        return (
          <NumberEditor
            value={typeof val === "number" ? val : 8}
            onSave={(v) => updateRule.mutate({ key: def.key, value: v })}
            saving={updateRule.isPending}
          />
        );
      case "chips":
        return (
          <ChipEditor
            value={Array.isArray(val) ? (val as string[]) : []}
            onSave={(v) => updateRule.mutate({ key: def.key, value: v })}
            saving={updateRule.isPending}
          />
        );
      case "multiselect":
        return (
          <MultiSelectEditor
            value={Array.isArray(val) ? (val as string[]) : ["C"]}
            onSave={(v) => updateRule.mutate({ key: def.key, value: v })}
            saving={updateRule.isPending}
          />
        );
      case "thresholds": {
        const defaults = { weak: 16, moderate: 24, strong: 32 };
        const thresholds = (typeof val === "object" && val !== null && !Array.isArray(val))
          ? (val as { weak: number; moderate: number; strong: number })
          : defaults;
        return (
          <ThresholdsEditor
            value={thresholds}
            onSave={(v) => updateRule.mutate({ key: def.key, value: v })}
            saving={updateRule.isPending}
          />
        );
      }
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Business rules that control how doctrine scoring and routing decisions are made.
        All values are in plain English — no JSON editing required.
      </p>
      <div className="space-y-3">
        {RULE_DEFS.map((def) => (
          <div key={def.key} className="rounded border border-border bg-gda-bg-base px-4 py-3 space-y-2">
            <div>
              <p className="text-xs font-medium text-foreground">{def.label}</p>
              <p className="text-[11px] text-muted-foreground">{def.description}</p>
            </div>
            {renderEditor(def)}
          </div>
        ))}
      </div>

      {/* Advanced: raw JSON view */}
      <details className="pt-2">
        <summary className="text-[11px] font-mono text-muted-foreground cursor-pointer hover:text-foreground">
          Advanced — raw JSON
        </summary>
        <div className="mt-2 space-y-2">
          {rules.map((row) => (
            <div key={row.key} className="rounded border border-border bg-gda-bg-base px-3 py-2">
              <p className="font-mono text-[11px] text-foreground">{row.key}</p>
              <pre className="font-mono text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                {JSON.stringify(row.value, null, 2)}
              </pre>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Updated {new Date(row.updated_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
