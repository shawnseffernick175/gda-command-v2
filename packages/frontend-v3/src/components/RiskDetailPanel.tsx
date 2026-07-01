"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SourceChip } from "@/components/shared/source-chip";
import { cn } from "@/lib/utils";
import { useUpdateRisk, useRiskEvents, useAddRiskEvent } from "@/hooks/use-risks";
import type { Risk, RiskSeverity, RiskStatus } from "@/lib/types";
import { XIcon, ArrowRightIcon } from "lucide-react";

const SEVERITIES: RiskSeverity[] = ["critical", "high", "medium", "low"];
const STATUSES: RiskStatus[] = ["open", "mitigating", "resolved", "accepted"];

function severityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-critical/10 text-critical border-critical/30";
    case "high":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "medium":
      return "bg-amber-400/10 text-amber-400 border-amber-400/30";
    case "low":
      return "bg-accent/10 text-accent border-accent/30";
    default:
      return "bg-muted/10 text-muted-foreground border-border";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "mitigating":
      return "bg-amber-400/10 text-amber-400 border-amber-400/30";
    case "resolved":
      return "bg-accent/10 text-accent border-accent/30";
    case "accepted":
      return "bg-muted/10 text-muted-foreground border-border";
    default:
      return "bg-muted/10 text-muted-foreground border-border";
  }
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "created": return "Created";
    case "status_change": return "Status changed";
    case "duplicate_fire": return "Duplicate fire";
    case "mitigation_update": return "Mitigation updated";
    case "owner_change": return "Owner changed";
    case "evidence_added": return "Evidence added";
    case "severity_change": return "Severity changed";
    case "note": return "Note";
    default: return eventType;
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
  const { data: eventsData } = useRiskEvents(risk.id);
  const addEvent = useAddRiskEvent();
  const [owner, setOwner] = useState(risk.owner ?? "");
  const [dueAt, setDueAt] = useState(risk.due_at ? risk.due_at.slice(0, 10) : "");
  const [mitPlan, setMitPlan] = useState(risk.mitigation_plan ?? "");
  const [noteText, setNoteText] = useState("");

  const isNegative = risk.risk_type !== "positive";
  const events = eventsData?.items ?? [];

  function saveField(field: string, value: string) {
    updateRisk.mutate({ id: risk.id, [field]: value || null });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    addEvent.mutate({
      riskId: risk.id,
      event_type: "note",
      detail: { text: noteText.trim() },
      actor: "user",
    });
    setNoteText("");
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-border bg-bg shadow-xl animate-in slide-in-from-right duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 rounded p-1 text-muted hover:text-ink transition-colors"
        >
          <XIcon className="h-4 w-4" />
        </button>

        <div className="space-y-5 p-5 pt-4">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-body font-semibold text-ink pr-6">
              {risk.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded border px-1.5 py-0.5 text-caption font-medium uppercase", severityBadge(risk.severity))}>
                {risk.severity}
              </span>
              <span className={cn("rounded border px-1.5 py-0.5 text-caption font-medium", statusBadge(risk.status))}>
                {risk.status}
              </span>
              <Badge
                className={cn(
                  "text-caption font-medium uppercase tracking-wide",
                  isNegative
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-accent/15 text-accent border-accent/30",
                )}
              >
                {isNegative ? "THREAT" : "OPPORTUNITY"}
              </Badge>
              <Badge variant="outline" className="text-caption capitalize">
                {(risk.category ?? "other").replace(/_/g, " ")}
              </Badge>
            </div>
            {risk.description && (
              <p className="text-caption text-muted leading-relaxed">
                {risk.description}
              </p>
            )}
          </div>

          {/* Severity + Status inline edit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption text-muted mb-1">Severity</label>
              <select
                value={risk.severity}
                onChange={(e) => updateRisk.mutate({ id: risk.id, severity: e.target.value as RiskSeverity })}
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption text-muted mb-1">Status</label>
              <select
                value={risk.status}
                onChange={(e) => updateRisk.mutate({ id: risk.id, status: e.target.value as RiskStatus })}
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* If / Then */}
          {(risk.if_condition || risk.then_impact) && (
            <div className="card p-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div>
                  <p className="text-caption font-semibold text-muted mb-1">If this happens:</p>
                  <p className="text-caption text-ink leading-relaxed">{risk.if_condition ?? "\u2014"}</p>
                </div>
                <div className="flex items-center pt-4">
                  <ArrowRightIcon className="h-4 w-4 text-muted" />
                </div>
                <div>
                  <p className="text-caption font-semibold text-muted mb-1">Then this occurs:</p>
                  <p className="text-caption text-ink leading-relaxed">{risk.then_impact ?? "\u2014"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Mitigation Plan */}
          {isNegative && (
            <div className="space-y-2">
              <h3 className="text-caption font-semibold text-ink">Mitigation Plan</h3>
              <textarea
                rows={3}
                value={mitPlan}
                onChange={(e) => setMitPlan(e.target.value)}
                onBlur={() => saveField("mitigation_plan", mitPlan)}
                placeholder="Describe mitigation steps..."
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none"
              />
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-caption text-muted mb-1">Owner</label>
                  <input
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    onBlur={() => saveField("owner", owner)}
                    placeholder="Assign owner..."
                    className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-caption text-muted mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueAt}
                    onChange={(e) => {
                      setDueAt(e.target.value);
                      saveField("due_at", e.target.value);
                    }}
                    className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Exploitation Plan (positive) */}
          {!isNegative && (
            <div className="space-y-2">
              <h3 className="text-caption font-semibold text-ink">Exploitation Plan</h3>
              <p className="text-caption text-muted leading-relaxed">
                {risk.exploitation_plan ?? "No exploitation plan specified."}
              </p>
            </div>
          )}

          {/* Source Event */}
          {risk.source_event && Object.keys(risk.source_event).length > 0 && (
            <div className="space-y-1">
              <h3 className="text-caption font-semibold text-ink">Source Event</h3>
              <div className="rounded border border-border bg-bg p-2">
                <pre className="text-caption text-muted whitespace-pre-wrap break-words">
                  {JSON.stringify(risk.source_event, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Linked Records */}
          <div className="space-y-1">
            <h3 className="text-caption font-semibold text-ink">Linked Records</h3>
            <div className="flex flex-wrap gap-2">
              {risk.opportunity_id && (
                <a
                  href={`/opportunities?highlight=${risk.opportunity_id}`}
                  className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-caption text-accent hover:bg-accent/20 transition-colors"
                >
                  {risk.opportunity_title ?? `Opportunity #${risk.opportunity_id}`}
                </a>
              )}
              {risk.related_capture_id && (
                <span className="inline-flex items-center gap-1 rounded border border-border bg-bg px-2 py-1 text-caption text-muted">
                  Capture #{risk.related_capture_id}
                </span>
              )}
              {!risk.opportunity_id && !risk.related_capture_id && (
                <span className="text-caption text-muted">{"\u2014"} No linked records</span>
              )}
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1">
            <h3 className="text-caption font-semibold text-ink">Source</h3>
            <SourceChip
              label={risk.source === "ai_generated" ? "AI Generated" : risk.source === "doctrine_rule" ? "Doctrine Rule" : risk.source === "color_review" ? "Color Review" : risk.source === "sentinel" ? "Sentinel" : "Manual"}
              kind={risk.source === "manual" ? "real" : "heuristic"}
            />
          </div>

          {/* Timeline / Event Log */}
          <div className="space-y-2">
            <h3 className="text-caption font-semibold text-ink">Timeline</h3>
            {events.length === 0 ? (
              <p className="text-caption text-muted">No events recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {events.map((ev) => (
                  <div key={ev.id} className="flex gap-2 border-l-2 border-border pl-3 py-1">
                    <div className="flex-1">
                      <p className="text-caption font-medium text-ink">{eventLabel(ev.event_type)}</p>
                      {ev.detail && Object.keys(ev.detail).length > 0 && (
                        <p className="text-caption text-muted">
                          {ev.event_type === "note"
                            ? String(ev.detail.text ?? "")
                            : ev.event_type === "status_change"
                              ? `${ev.detail.from} → ${ev.detail.to}`
                              : ev.event_type === "owner_change"
                                ? `${ev.detail.from ?? "none"} → ${ev.detail.to}`
                                : ev.event_type === "severity_change"
                                  ? `${ev.detail.from} → ${ev.detail.to}`
                                  : JSON.stringify(ev.detail)}
                        </p>
                      )}
                      <p className="text-caption text-muted tabular-nums">
                        {new Date(ev.created_at).toLocaleString()} — {ev.actor}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add note */}
            <div className="flex gap-2 pt-1">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={!noteText.trim() || addEvent.isPending}
                className="rounded border border-accent bg-accent/10 px-3 py-1.5 text-caption font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Meta */}
          <div className="border-t border-border pt-3 text-caption text-muted space-y-0.5">
            <p>Identified: {risk.identified_at ? new Date(risk.identified_at).toLocaleString() : "\u2014"}</p>
            <p>Created: {new Date(risk.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(risk.updated_at).toLocaleString()}</p>
            {risk.resolved_at && <p>Resolved: {new Date(risk.resolved_at).toLocaleString()}</p>}
            <p>Created by: {risk.created_by}</p>
            {risk.evidence_grade && <p>Evidence grade: {risk.evidence_grade}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
