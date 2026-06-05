"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { useOpportunities } from "@/hooks/use-opportunities";
import { cn } from "@/lib/utils";
import type { OpportunitySummary } from "@/lib/types";

/* ── Types ────────────────────────────────────────────────────── */

type PwinWeights = Record<string, number>;

/* ── Dimension labels (match backend pwin-weights.ts) ─────────── */

const DIMENSION_ORDER = [
  "base",
  "incumbency_bonus",
  "recompete_bonus",
  "capability_match_multiplier",
  "vehicle_access",
  "clearance_fit",
  "doctrine_bonus_max",
  "margin_penalty",
  "teaming_bonus",
  "teaming_penalty",
  "naics_small_setaside",
  "naics_small_fullopen",
  "existing_customer",
] as const;

function formatLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ── Sim scoring ──────────────────────────────────────────────── */

/**
 * Approximate new pwin by scaling the opportunity's current score
 * proportionally to how the weights changed.
 *
 * Since the frontend does not have per-opportunity raw features,
 * we use a ratio-based estimate: newPwin ≈ currentPwin × (newWeightSum / savedWeightSum).
 * This gives a directional signal — the full re-score happens server-side on save.
 */
function computeSimPwin(
  currentPwin: number,
  savedWeights: PwinWeights,
  draftWeights: PwinWeights,
): number {
  const savedSum = Object.values(savedWeights).reduce((s, v) => s + v, 0);
  const draftSum = Object.values(draftWeights).reduce((s, v) => s + v, 0);
  if (savedSum === 0) return currentPwin;
  const ratio = draftSum / savedSum;
  return Math.max(0, Math.min(100, Math.round(currentPwin * ratio)));
}

/* ── Component ────────────────────────────────────────────────── */

export function PwinWeightsPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PwinWeights | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /* Fetch config */
  const { data: savedWeights, isLoading: configLoading } = useQuery({
    queryKey: ["pwin-config"],
    queryFn: () => apiGet<PwinWeights>("/v3/pwin/config"),
  });

  /* Fetch top 50 opportunities for simulator */
  const { data: oppData } = useOpportunities({ limit: 50 });
  const opportunities = useMemo<OpportunitySummary[]>(
    () => oppData?.items ?? [],
    [oppData],
  );

  const displayed: PwinWeights | null = draft ?? savedWeights ?? null;
  const isDirty = draft !== null;

  /* Sum of weights */
  const weightSum = useMemo(() => {
    if (!displayed) return 0;
    return Object.values(displayed).reduce((s, v) => s + v, 0);
  }, [displayed]);

  const sumValid = Math.round(weightSum * 100) / 100 === 100;

  /* Slider change */
  const handleSliderChange = useCallback(
    (key: string, value: number) => {
      setDraft((prev) => ({
        ...(prev ?? displayed ?? {}),
        [key]: value,
      }));
    },
    [displayed],
  );

  /* Sim-ranked opps (top 20 with pwin) */
  const rankedOpps = useMemo(() => {
    if (!displayed || !savedWeights) return [];
    const withPwin = opportunities.filter((o) => o.pwin && o.pwin.score > 0);
    const scored = withPwin.map((opp) => {
      const currentPwin = opp.pwin?.score ?? 0;
      const newPwin = isDirty
        ? computeSimPwin(currentPwin, savedWeights, displayed)
        : currentPwin;
      return { opp, currentPwin, newPwin, delta: newPwin - currentPwin };
    });
    scored.sort((a, b) => b.newPwin - a.newPwin);
    return scored.slice(0, 20);
  }, [opportunities, displayed, savedWeights, isDirty]);

  /* Save */
  const saveMutation = useMutation({
    mutationFn: (body: PwinWeights) =>
      apiPut<PwinWeights>("/v3/pwin/config", body),
    onSuccess: () => {
      setMessage("Saved");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["pwin-config"] });
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
    },
    onError: () => setMessage("Failed to save"),
  });

  /* Reset */
  const resetMutation = useMutation({
    mutationFn: () => apiPost<PwinWeights>("/v3/pwin/config/reset"),
    onSuccess: () => {
      setMessage("Reset to defaults");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["pwin-config"] });
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
    },
    onError: () => setMessage("Failed to reset"),
  });

  const handleSave = () => {
    if (!displayed) return;
    setMessage(null);
    saveMutation.mutate(displayed);
  };

  const handleReset = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  /* Ordered keys */
  const orderedKeys = useMemo(() => {
    if (!displayed) return [];
    const known = DIMENSION_ORDER.filter((k) => k in displayed);
    const extra = Object.keys(displayed).filter(
      (k) => !DIMENSION_ORDER.includes(k as (typeof DIMENSION_ORDER)[number]),
    );
    return [...known, ...extra];
  }, [displayed]);

  if (configLoading || !displayed) {
    return (
      <div className="space-y-4">
        <h2 className="font-mono text-lg font-bold text-foreground">
          Pwin Scoring Weights
        </h2>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded bg-gda-bg-base"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-mono text-lg font-bold text-foreground">
          Pwin Scoring Weights
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !isDirty}
            className="rounded bg-gda-cyan px-4 py-1.5 text-xs font-mono font-medium text-gda-bg-base hover:bg-gda-cyan/90 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : "Save Weights"}
          </button>
          <button
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:bg-gda-bg-base disabled:opacity-50 transition-colors"
          >
            {resetMutation.isPending ? "Resetting…" : "Reset"}
          </button>
          {message && (
            <span className="text-xs font-mono text-muted-foreground">
              {message}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Weight Sliders */}
        <div className="rounded border border-border bg-gda-panel p-4 space-y-4">
          <p className="font-mono text-xs font-semibold text-muted-foreground">
            Weight Configuration
          </p>

          <div className="space-y-3">
            {orderedKeys.map((key) => {
              const value = displayed[key] ?? 0;
              const isNegative = value < 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-muted-foreground">
                      {formatLabel(key)}
                    </label>
                    <span className="font-mono text-sm text-foreground tabular-nums w-16 text-right">
                      {value}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={isNegative ? -100 : 0}
                    max={100}
                    step={1}
                    value={value}
                    onChange={(e) =>
                      handleSliderChange(key, Number(e.target.value))
                    }
                    className="w-full accent-gda-green h-1.5 cursor-pointer"
                  />
                </div>
              );
            })}
          </div>

          {/* Sum indicator */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <span
              className={cn(
                "font-mono text-sm",
                sumValid ? "text-gda-green" : "text-gda-amber",
              )}
            >
              Total: {Math.round(weightSum * 100) / 100}
            </span>
            {!sumValid && (
              <span className="rounded bg-gda-amber/10 border border-gda-amber/30 px-2 py-0.5 text-[11px] font-mono text-gda-amber">
                Weights must sum to 100
              </span>
            )}
          </div>
        </div>

        {/* RIGHT: Live Re-ranking */}
        <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
          <p className="font-mono text-xs font-semibold text-muted-foreground">
            Top 20 Re-Ranked {isDirty && "(simulated)"}
          </p>

          {rankedOpps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No opportunities with pwin scores available.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-[11px] font-mono text-muted-foreground">
                    <th className="pb-1.5 pr-2 w-8">#</th>
                    <th className="pb-1.5 pr-2">Program</th>
                    <th className="pb-1.5 pr-2 w-16">Current</th>
                    <th className="pb-1.5 pr-2 w-16">New</th>
                    <th className="pb-1.5 w-20">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedOpps.map(({ opp, currentPwin, newPwin, delta }, i) => (
                    <tr
                      key={opp.internal_id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-1.5 pr-2 font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="py-1.5 pr-2 text-xs">
                        <Link
                          href={`/opportunities?id=${opp.internal_id}`}
                          className="text-gda-cyan hover:underline truncate block max-w-[220px]"
                        >
                          {opp.title}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-xs text-foreground tabular-nums">
                        {currentPwin}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-xs text-foreground tabular-nums">
                        {newPwin}
                      </td>
                      <td className="py-1.5 font-mono text-xs tabular-nums">
                        {delta > 0 ? (
                          <span className="text-gda-green">↑ +{delta} pts</span>
                        ) : delta < 0 ? (
                          <span className="text-gda-red">↓ {delta} pts</span>
                        ) : (
                          <span className="text-muted-foreground">=</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
