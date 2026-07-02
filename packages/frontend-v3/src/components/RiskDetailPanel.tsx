"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SourceChip } from "@/components/shared/source-chip";
import { cn } from "@/lib/utils";
import { useUpdateRisk } from "@/hooks/use-risks";
import type { Risk } from "@/lib/types";
import { XIcon, ArrowRightIcon } from "lucide-react";

function scoreBg(score: number): string {
  if (score >= 15) return "bg-red-500/10 border-red-500/30 text-red-400";
  if (score >= 8) return "bg-amber-400/10 border-amber-400/30 text-amber-400";
  return "bg-gda-green/10 border-gda-green/30 text-gda-green";
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high": return "bg-amber-400/15 text-amber-400 border-amber-400/30";
    case "medium": return "bg-blue-400/15 text-blue-400 border-blue-400/30";
    case "low": return "bg-gda-green/15 text-gda-green border-gda-green/30";
    default: return "bg-border text-muted-foreground border-border";
  }
}

export function RiskDetailPanel({
  risk,
  onClose,
}: {
  risk: Risk;
  onClose: () => void;
}) {
  const updateRisk = useUpdateRisk();
  const [owner, setOwner] = useState(risk.owner ?? "");
  const [dueDate, setDueDate] = useState(risk.due_date ?? "");
  const [nextStep, setNextStep] = useState(risk.next_step ?? "");

  const score = (risk.likelihood ?? 3) * (risk.impact ?? 3);
  const isNegative = risk.risk_type !== "positive";

  function saveField(field: string, value: string) {
    updateRisk.mutate({ id: risk.id, [field]: value || null });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-border bg-gda-bg-base shadow-xl animate-in slide-in-from-right duration-200">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <XIcon className="h-4 w-4" />
        </button>

        <div className="space-y-5 p-5 pt-4">
          {/* ── Header ─────────────────────────────────── */}
          <div className="space-y-2">
            <h2 className="font-mono text-sm font-bold text-foreground pr-6">
              {risk.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  "text-[11px] font-mono font-bold uppercase tracking-wide border",
                  severityColor(risk.severity ?? "medium"),
                )}
              >
                {risk.severity ?? "medium"}
              </Badge>
              <Badge
                className={cn(
                  "text-[11px] font-mono font-bold uppercase tracking-wide",
                  isNegative
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-gda-green/15 text-gda-green border-gda-green/30",
                )}
              >
                {isNegative ? "THREAT" : "OPPORTUNITY"}
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] font-mono capitalize"
              >
                {risk.category ?? "operational"}
              </Badge>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] font-mono font-bold",
                  scoreBg(score),
                )}
              >
                L{risk.likelihood} × I{risk.impact} = {score}
              </span>
              <Badge
                variant="outline"
                className="text-[11px] font-mono capitalize"
              >
                {risk.status ?? "open"}
              </Badge>
            </div>
            {risk.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {risk.description}
              </p>
            )}
          </div>

          {/* ── If / Then ──────────────────────────────── */}
          {(risk.if_condition || risk.then_impact) && (
            <div className="rounded border border-border bg-gda-panel p-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div>
                  <p className="text-[11px] font-mono font-semibold text-muted-foreground mb-1">
                    If this happens:
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">
                    {risk.if_condition ?? "—"}
                  </p>
                </div>
                <div className="flex items-center pt-4">
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[11px] font-mono font-semibold text-muted-foreground mb-1">
                    Then this occurs:
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">
                    {risk.then_impact ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Mitigation Plan (negative only) ────────── */}
          {isNegative && (
            <div className="space-y-2">
              <h3 className="font-mono text-xs font-semibold text-foreground">
                Mitigation Plan
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {risk.mitigation_plan ?? risk.mitigation ?? "No mitigation plan specified."}
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Owner
                  </label>
                  <input
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    onBlur={() => saveField("owner", owner)}
                    placeholder="Assign owner…"
                    className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      saveField("due_date", e.target.value);
                    }}
                    className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Exploitation Plan (positive only) ──────── */}
          {!isNegative && (
            <div className="space-y-2">
              <h3 className="font-mono text-xs font-semibold text-foreground">
                Exploitation Plan
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {risk.exploitation_plan ?? "No exploitation plan specified."}
              </p>
              <div className="pt-1">
                <label className="block text-[11px] text-muted-foreground mb-1">
                  Next Step
                </label>
                <input
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  onBlur={() => saveField("next_step", nextStep)}
                  placeholder="Define next action…"
                  className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                />
              </div>
            </div>
          )}

          {/* ── Linked Record ──────────────────────────── */}
          {risk.opportunity_id && (
            <div className="space-y-1">
              <h3 className="font-mono text-xs font-semibold text-foreground">
                Linked Record
              </h3>
              <a
                href={`/opportunities?highlight=${risk.opportunity_id}`}
                className="inline-flex items-center gap-1 rounded border border-gda-cyan/30 bg-gda-cyan/10 px-2 py-1 text-[11px] font-mono text-gda-cyan hover:bg-gda-cyan/20 transition-colors"
              >
                {risk.opportunity_title ?? `Opportunity #${risk.opportunity_id}`}
              </a>
            </div>
          )}

          {/* ── Source ─────────────────────────────────── */}
          <div className="space-y-1">
            <h3 className="font-mono text-xs font-semibold text-foreground">
              Source
            </h3>
            <SourceChip
              label={risk.source === "ai_generated" ? "AI Generated" : "Manual"}
              kind={risk.source === "ai_generated" ? "heuristic" : "real"}
            />
          </div>

          {/* ── Full Detail Link ──────────────────────── */}
          <div className="pt-2">
            <a
              href={`/risks/detail?id=${risk.id}`}
              className="inline-flex items-center gap-1 rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 transition-colors"
            >
              View Full Detail
            </a>
          </div>

          {/* ── Meta ───────────────────────────────────── */}
          <div className="border-t border-border pt-3 text-[11px] text-muted-foreground space-y-0.5">
            <p>Created: {new Date(risk.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(risk.updated_at).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </>
  );
}
