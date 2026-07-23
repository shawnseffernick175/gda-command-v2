"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  useUpdatePwinWeights,
  useResetPwinWeights,
  usePreviewPwinWeights,
  type PwinWeights,
  type PwinPreviewRow,
} from "@/hooks/use-scoring-doctrine";

interface WeightDef {
  key: keyof PwinWeights;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  group: "bonus" | "penalty" | "multiplier";
}

const WEIGHT_DEFS: WeightDef[] = [
  { key: "base", label: "Base Pwin", description: "Starting Pwin before any modifiers", min: 0, max: 50, step: 1, group: "bonus" },
  { key: "incumbency_bonus", label: "Incumbency bonus", description: "We hold the current contract", min: 0, max: 50, step: 1, group: "bonus" },
  { key: "naics_small_setaside", label: "Small business set-aside (NAICS match)", description: "NAICS aligns + we qualify", min: 0, max: 30, step: 1, group: "bonus" },
  { key: "vehicle_access", label: "Vehicle access", description: "We hold the required IDIQ/MAC", min: 0, max: 25, step: 1, group: "bonus" },
  { key: "naics_small_fullopen", label: "NAICS small full-and-open", description: "NAICS aligns on full-and-open", min: 0, max: 20, step: 1, group: "bonus" },
  { key: "doctrine_bonus_max", label: "Doctrine bonus max", description: "Max boost from doctrine alignment score", min: 0, max: 20, step: 1, group: "bonus" },
  { key: "recompete_bonus", label: "Recompete bonus", description: "Opportunity is a recompete (we know the work)", min: 0, max: 20, step: 1, group: "bonus" },
  { key: "teaming_bonus", label: "Teaming bonus", description: "Strong teaming arrangement in place", min: 0, max: 20, step: 1, group: "bonus" },
  { key: "clearance_fit", label: "Clearance fit", description: "Required clearances match our staff", min: 0, max: 15, step: 1, group: "bonus" },
  { key: "existing_customer", label: "Existing customer", description: "We have prior contract history with the customer", min: 0, max: 15, step: 1, group: "bonus" },
  { key: "teaming_penalty", label: "Teaming penalty", description: "Teaming gap (we lack required partners)", min: -30, max: 0, step: 1, group: "penalty" },
  { key: "margin_penalty", label: "Margin penalty", description: "Forecasted margin below floor", min: -40, max: 0, step: 1, group: "penalty" },
  { key: "capability_match_multiplier", label: "Capability match multiplier", description: "Scales capability-match contribution", min: 0, max: 1, step: 0.05, group: "multiplier" },
];

function groupColor(group: WeightDef["group"]): string {
  switch (group) {
    case "bonus": return "text-gda-green";
    case "penalty": return "text-gda-red";
    case "multiplier": return "text-gda-cyan";
    default: return "text-muted-foreground";
  }
}

function sliderTrackColor(group: WeightDef["group"]): string {
  switch (group) {
    case "bonus": return "accent-[#22c55e]";
    case "penalty": return "accent-[#ef4444]";
    case "multiplier": return "accent-[#06b6d4]";
    default: return "accent-gray-400";
  }
}

export function PwinWeightsSection({ weights }: { weights: PwinWeights }) {
  const [draft, setDraft] = useState<PwinWeights>(weights);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<PwinPreviewRow[] | null>(null);

  const updateWeights = useUpdatePwinWeights();
  const resetWeights = useResetPwinWeights();
  const previewWeights = usePreviewPwinWeights();

  const handleChange = useCallback((key: keyof PwinWeights, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setPreview(null);
  }, []);

  function handleSave() {
    updateWeights.mutate(draft, {
      onSuccess: () => {
        setDirty(false);
        setPreview(null);
      },
    });
  }

  function handleReset() {
    resetWeights.mutate(undefined, {
      onSuccess: (data) => {
        setDraft(data);
        setDirty(false);
        setPreview(null);
      },
    });
  }

  function handlePreview() {
    previewWeights.mutate(draft, {
      onSuccess: (data) => setPreview(data),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Adjust how Pwin is computed for each pursuit. Changes apply globally.
        </p>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetWeights.isPending}
          className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-gda-bg-base transition-colors"
        >
          Reset to default
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {WEIGHT_DEFS.map((def) => (
          <div
            key={def.key}
            className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-xs font-medium", groupColor(def.group))}>
                  {def.label}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground truncate">{def.description}</p>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={draft[def.key]}
                onChange={(e) => handleChange(def.key, parseFloat(e.target.value))}
                className={cn("w-full h-1.5 rounded-full cursor-pointer", sliderTrackColor(def.group))}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={def.min}
                max={def.max}
                step={def.step}
                value={draft[def.key]}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) handleChange(def.key, Math.max(def.min, Math.min(def.max, val)));
                }}
                className="w-16 rounded border border-border bg-gda-panel px-2 py-1 text-right font-mono text-xs text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || updateWeights.isPending}
          className={cn(
            "rounded border px-4 py-1.5 text-xs font-medium transition-colors",
            dirty
              ? "border-gda-green bg-gda-green/10 text-gda-green hover:bg-gda-green/20"
              : "border-border text-muted-foreground cursor-not-allowed",
          )}
        >
          {updateWeights.isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewWeights.isPending}
          className="rounded border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-gda-bg-base transition-colors"
        >
          {previewWeights.isPending ? "Computing..." : "Preview impact"}
        </button>
        {updateWeights.isSuccess && !dirty && (
          <span className="text-xs text-gda-green">Saved</span>
        )}
      </div>

      {preview && preview.length > 0 && (
        <div className="rounded border border-border bg-gda-bg-base overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-mono text-[12px] uppercase tracking-wider text-muted-foreground">Pursuit</th>
                <th className="px-3 py-2 text-right font-mono text-[12px] uppercase tracking-wider text-muted-foreground">Old Pwin</th>
                <th className="px-3 py-2 text-right font-mono text-[12px] uppercase tracking-wider text-muted-foreground">New Pwin</th>
                <th className="px-3 py-2 text-right font-mono text-[12px] uppercase tracking-wider text-muted-foreground">Delta</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.pursuit_id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{row.name}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{row.old_pwin}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">{row.new_pwin}</td>
                  <td className={cn(
                    "px-3 py-2 text-right font-mono tabular-nums",
                    row.delta > 0 ? "text-gda-green" : row.delta < 0 ? "text-gda-red" : "text-muted-foreground",
                  )}>
                    {row.delta > 0 ? "+" : ""}{row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && preview.length === 0 && (
        <p className="text-xs text-muted-foreground">No active pursuits found to preview.</p>
      )}
    </div>
  );
}
