"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useRisk, useRiskEvents, useUpdateRisk } from "@/hooks/use-risks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Risk, RiskEvent } from "@/lib/types";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high": return "bg-amber-400/15 text-amber-400 border-amber-400/30";
    case "medium": return "bg-blue-400/15 text-blue-400 border-blue-400/30";
    case "low": return "bg-gda-green/15 text-gda-green border-gda-green/30";
    default: return "bg-border text-muted-foreground border-border";
  }
}

function scoreBg(score: number): string {
  if (score >= 15) return "bg-red-500/10 border-red-500/30 text-red-400";
  if (score >= 8) return "bg-amber-400/10 border-amber-400/30 text-amber-400";
  return "bg-gda-green/10 border-gda-green/30 text-gda-green";
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case "created": return "Created";
    case "duplicate_fire": return "Duplicate Detected";
    case "status_change": return "Status Changed";
    case "severity_change": return "Severity Changed";
    case "owner_assigned": return "Owner Assigned";
    case "mitigation_updated": return "Mitigation Updated";
    case "evidence_added": return "Evidence Added";
    case "auto_archived": return "Auto-Archived";
    default: return type;
  }
}

function EventTimeline({ events }: { events: RiskEvent[] }) {
  if (!events.length) {
    return (
      <p className="text-xs text-muted-foreground">No events recorded yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((ev) => (
        <div key={ev.id} className="flex gap-3 items-start">
          <div className="w-2 h-2 mt-1.5 rounded-full bg-gda-green shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">
                {eventTypeLabel(ev.event_type)}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {new Date(ev.created_at).toLocaleString()}
              </span>
            </div>
            {ev.payload && Object.keys(ev.payload).length > 0 && (
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {ev.event_type === "status_change" && `${(ev.payload as Record<string, string>).from} → ${(ev.payload as Record<string, string>).to}`}
                {ev.event_type === "severity_change" && `${(ev.payload as Record<string, string>).from} → ${(ev.payload as Record<string, string>).to}`}
                {ev.event_type === "owner_assigned" && `${(ev.payload as Record<string, string>).from ?? "unassigned"} → ${(ev.payload as Record<string, string>).to}`}
                {ev.event_type === "duplicate_fire" && `Attempted: "${(ev.payload as Record<string, string>).attempted_title}"`}
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">by {ev.actor}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskDetailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riskId = searchParams.get("id") ? Number(searchParams.get("id")) : null;
  const { data: risk, isLoading } = useRisk(riskId);
  const { data: eventsData } = useRiskEvents(riskId);
  const updateRisk = useUpdateRisk();

  const [mitigationPlan, setMitigationPlan] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-gda-panel rounded w-1/3" />
        <div className="h-4 bg-gda-panel rounded w-2/3" />
      </div>
    );
  }

  if (!risk) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Risk not found.</p>
      </div>
    );
  }

  const score = (risk.likelihood ?? 3) * (risk.impact ?? 3);
  const events = eventsData?.items ?? risk.events ?? [];
  const isNegative = risk.risk_type !== "positive";

  function saveMitigation() {
    if (mitigationPlan !== null) {
      updateRisk.mutate({ id: risk!.id, mitigation_plan: mitigationPlan });
    }
  }

  function saveOwner() {
    if (owner !== null) {
      updateRisk.mutate({ id: risk!.id, owner: owner || null });
    }
  }

  function changeStatus(newStatus: string) {
    updateRisk.mutate({ id: risk!.id, status: newStatus as Risk["status"] });
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      {/* Back navigation */}
      <button
        type="button"
        onClick={() => router.push("/risks")}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeftIcon className="h-3 w-3" /> Back to Risk Register
      </button>

      {/* Header */}
      <div className="space-y-3">
        <h1 className="font-mono text-lg font-bold text-foreground">
          {risk.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("text-[12px] font-mono font-bold uppercase tracking-wide border", severityColor(risk.severity ?? "medium"))}>
            {risk.severity ?? "medium"}
          </Badge>
          <Badge className={cn("text-[12px] font-mono font-bold uppercase tracking-wide", isNegative ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-gda-green/15 text-gda-green border-gda-green/30")}>
            {isNegative ? "THREAT" : "OPPORTUNITY"}
          </Badge>
          <Badge variant="outline" className="text-[12px] font-mono capitalize">
            {risk.category?.split("_").join(" ") ?? "operational"}
          </Badge>
          <span className={cn("rounded border px-1.5 py-0.5 text-[12px] font-mono font-bold", scoreBg(score))}>
            L{risk.likelihood} x I{risk.impact} = {score}
          </span>
          <Badge variant="outline" className="text-[12px] font-mono capitalize">
            {risk.status ?? "open"}
          </Badge>
        </div>
        {risk.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {risk.description}
          </p>
        )}
      </div>

      {/* If / Then */}
      {(risk.if_condition || risk.then_impact) && (
        <div className="rounded border border-border bg-gda-panel p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
            <div>
              <p className="text-[12px] font-mono font-semibold text-muted-foreground mb-1">If this happens:</p>
              <p className="text-xs text-foreground leading-relaxed">{risk.if_condition ?? "---"}</p>
            </div>
            <div className="flex items-center pt-4">
              <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[12px] font-mono font-semibold text-muted-foreground mb-1">Then this occurs:</p>
              <p className="text-xs text-foreground leading-relaxed">{risk.then_impact ?? "---"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mitigation Plan Editor */}
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-foreground">
          {isNegative ? "Mitigation Plan" : "Exploitation Plan"}
        </h2>
        <textarea
          rows={4}
          defaultValue={isNegative ? (risk.mitigation_plan ?? risk.mitigation ?? "") : (risk.exploitation_plan ?? "")}
          onChange={(e) => setMitigationPlan(e.target.value)}
          onBlur={saveMitigation}
          placeholder={isNegative ? "Describe how to reduce or accept this risk..." : "Describe how to exploit this opportunity..."}
          className="w-full rounded border border-border bg-gda-bg-base px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] text-muted-foreground mb-1">Owner</label>
            <input
              defaultValue={risk.owner ?? ""}
              onChange={(e) => setOwner(e.target.value)}
              onBlur={saveOwner}
              placeholder="Assign owner..."
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
          <div>
            <label className="block text-[12px] text-muted-foreground mb-1">Due Date</label>
            <input
              type="date"
              defaultValue={risk.due_at?.split("T")[0] ?? risk.due_date ?? ""}
              onChange={(e) => updateRisk.mutate({ id: risk.id, due_at: e.target.value || null })}
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
        </div>
      </div>

      {/* Status Actions */}
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-foreground">Lifecycle</h2>
        <div className="flex flex-wrap gap-2">
          {(["open", "mitigating", "resolved", "accepted"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={risk.status === s}
              onClick={() => changeStatus(s)}
              className={cn(
                "rounded border px-3 py-1 text-xs font-mono transition-colors",
                risk.status === s
                  ? "border-gda-green bg-gda-green/10 text-gda-green"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {risk.resolved_at && (
          <p className="text-[12px] text-muted-foreground">
            Resolved: {new Date(risk.resolved_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Evidence Documents */}
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-foreground">Evidence Documents</h2>
        {risk.mitigation_doc_ids && risk.mitigation_doc_ids.length > 0 ? (
          <ul className="space-y-1">
            {risk.mitigation_doc_ids.map((docId, i) => (
              <li key={i} className="text-xs text-muted-foreground font-mono">
                {docId}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No evidence documents attached.</p>
        )}
        {risk.evidence_grade && (
          <p className="text-xs text-muted-foreground">
            Evidence Grade: <span className="font-mono font-bold text-foreground">{risk.evidence_grade}</span>
          </p>
        )}
      </div>

      {/* Linked Records */}
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-foreground">Linked Records</h2>
        <div className="flex flex-wrap gap-2">
          {risk.opportunity_id && (
            <a
              href={`/opportunities?highlight=${risk.opportunity_id}`}
              className="inline-flex items-center gap-1 rounded border border-gda-cyan/30 bg-gda-cyan/10 px-2 py-1 text-[12px] font-mono text-gda-cyan hover:bg-gda-cyan/20 transition-colors"
            >
              {risk.opportunity_title ?? `Opportunity #${risk.opportunity_id}`}
            </a>
          )}
          {risk.related_capture_id && (
            <a
              href={`/capture?id=${risk.related_capture_id}`}
              className="inline-flex items-center gap-1 rounded border border-gda-cyan/30 bg-gda-cyan/10 px-2 py-1 text-[12px] font-mono text-gda-cyan hover:bg-gda-cyan/20 transition-colors"
            >
              Capture #{risk.related_capture_id}
            </a>
          )}
          {risk.related_pipeline_item_id && (
            <a
              href={`/pipeline?highlight=${risk.related_pipeline_item_id}`}
              className="inline-flex items-center gap-1 rounded border border-gda-cyan/30 bg-gda-cyan/10 px-2 py-1 text-[12px] font-mono text-gda-cyan hover:bg-gda-cyan/20 transition-colors"
            >
              Pipeline #{risk.related_pipeline_item_id}
            </a>
          )}
          {!risk.opportunity_id && !risk.related_capture_id && !risk.related_pipeline_item_id && (
            <p className="text-xs text-muted-foreground">No linked records.</p>
          )}
        </div>
      </div>

      {/* Source Event */}
      {risk.source_event && Object.keys(risk.source_event).length > 0 && (
        <div className="rounded border border-border bg-gda-panel p-4 space-y-2">
          <h2 className="font-mono text-sm font-semibold text-foreground">Source Event</h2>
          <pre className="text-[12px] text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(risk.source_event, null, 2)}
          </pre>
        </div>
      )}

      {/* Event Timeline */}
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-foreground">Event Timeline</h2>
        <EventTimeline events={events} />
      </div>

      {/* Meta */}
      <div className="border-t border-border pt-3 text-[12px] text-muted-foreground space-y-0.5">
        <p>Identified: {new Date(risk.identified_at ?? risk.created_at).toLocaleString()}</p>
        <p>Created: {new Date(risk.created_at).toLocaleString()}</p>
        <p>Updated: {new Date(risk.updated_at).toLocaleString()}</p>
        <p>Created By: {risk.created_by ?? "system"}</p>
        <p>Source: {risk.source === "ai_generated" ? "AI Generated" : "Manual"}</p>
      </div>
    </div>
  );
}

export default function RiskDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 animate-pulse"><div className="h-6 bg-gda-skeleton rounded w-1/3" /></div>}>
      <RiskDetailInner />
    </Suspense>
  );
}
