"use client";

import { useState } from "react";
import { useRisks, useCreateRisk, useUpdateRisk, useDeleteRisk } from "@/hooks/use-risks";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
import { PendingState } from "@/components/shared/pending-state";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/types";

const CATEGORIES = ["operational", "technical", "financial", "schedule", "compliance", "personnel"] as const;
const STATUSES = ["open", "mitigated", "accepted", "closed"] as const;
const IMPACTS = [1, 2, 3, 4, 5] as const;

function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

function scoreColor(score: number): string {
  if (score >= 15) return "text-red-500";
  if (score >= 8) return "text-amber-400";
  return "text-gda-green";
}

function scoreBg(score: number): string {
  if (score >= 15) return "bg-red-500/10 border-red-500/30 text-red-400";
  if (score >= 8) return "bg-amber-400/10 border-amber-400/30 text-amber-400";
  return "bg-gda-green/10 border-gda-green/30 text-gda-green";
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "open": return "destructive";
    case "mitigated": return "outline";
    case "accepted": return "secondary";
    case "closed": return "outline";
    default: return "outline";
  }
}

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "operational" as string,
  likelihood: 3,
  impact: 3,
  status: "open" as "open" | "mitigated" | "accepted" | "closed",
  owner: "",
  mitigation: "",
};

export default function RisksPage() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data, isLoading } = useRisks({
    status: filterStatus || undefined,
    category: filterCategory || undefined,
  });
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  const items: Risk[] = data?.items ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        likelihood: Number(form.likelihood),
        impact: Number(form.impact),
      };
      if (editingId) {
        await updateRisk.mutateAsync({ id: editingId, ...payload });
      } else {
        await createRisk.mutateAsync(payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(risk: Risk) {
    setForm({
      title: risk.title,
      description: risk.description ?? "",
      category: risk.category ?? "operational",
      likelihood: risk.likelihood ?? 3,
      impact: risk.impact ?? 3,
      status: risk.status ?? "open",
      owner: risk.owner ?? "",
      mitigation: risk.mitigation ?? "",
    });
    setEditingId(risk.id);
    setShowForm(true);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this risk?")) return;
    await deleteRisk.mutateAsync(id);
  }

  // Build 5x5 matrix — bucket items by (likelihood, impact)
  const matrixMap: Record<string, Risk[]> = {};
  for (const r of items) {
    const key = `${r.likelihood ?? 3}_${r.impact ?? 3}`;
    if (!matrixMap[key]) matrixMap[key] = [];
    matrixMap[key].push(r);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-foreground">Risk Register</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track, score, and mitigate capture risks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {items.length} risks
          </Badge>
          <button
            type="button"
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setEditingId(null);
              setShowForm((v) => !v);
            }}
            className={cn(
              "rounded border px-3 py-1 text-xs font-mono font-medium transition-colors",
              showForm
                ? "border-border bg-gda-panel text-muted-foreground"
                : "border-gda-green bg-gda-green/10 text-gda-green hover:bg-gda-green/20"
            )}
          >
            {showForm ? "Cancel" : "+ Add Risk"}
          </button>
        </div>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded border border-border bg-gda-panel p-4 space-y-3"
        >
          <p className="font-mono text-xs font-semibold text-foreground">
            {editingId ? "Edit Risk" : "New Risk"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-muted-foreground mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Key personnel departure"
                className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              />
            </div>
            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-muted-foreground mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Details about the risk…"
                className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
              />
            </div>
            {/* Category */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            {/* Status */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "open" | "mitigated" | "accepted" | "closed" }))}
                className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            {/* Likelihood */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Likelihood (1–5): <span className="font-mono text-foreground">{form.likelihood}</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.likelihood}
                onChange={(e) => setForm((f) => ({ ...f, likelihood: Number(e.target.value) }))}
                className="w-full accent-gda-green"
              />
            </div>
            {/* Impact */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Impact (1–5): <span className="font-mono text-foreground">{form.impact}</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.impact}
                onChange={(e) => setForm((f) => ({ ...f, impact: Number(e.target.value) }))}
                className="w-full accent-gda-green"
              />
            </div>
            {/* Owner */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Owner</label>
              <input
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder="Person responsible"
                className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              />
            </div>
            {/* Score preview */}
            <div className="flex items-end">
              <div className={cn("rounded border px-3 py-1.5 text-xs font-mono font-bold", scoreBg(riskScore(form.likelihood, form.impact)))}>
                Score: {riskScore(form.likelihood, form.impact)} / 25
              </div>
            </div>
            {/* Mitigation */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-muted-foreground mb-1">Mitigation Plan</label>
              <textarea
                rows={2}
                value={form.mitigation}
                onChange={(e) => setForm((f) => ({ ...f, mitigation: e.target.value }))}
                placeholder="Steps to reduce or accept this risk…"
                className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Risk"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); }}
              className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-border bg-gda-panel px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded border border-border bg-gda-panel px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        {(filterStatus || filterCategory) && (
          <button
            type="button"
            onClick={() => { setFilterStatus(""); setFilterCategory(""); }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Risk Matrix (5×5) */}
      <CollapseSection id="risk-matrix" title="Risk Matrix" defaultOpen={true}>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-[320px]">
            {/* Y-axis label */}
            <div className="flex">
              <div className="w-16 shrink-0" />
              <div className="flex-1 text-center text-[11px] text-muted-foreground mb-1">
                Impact →
              </div>
            </div>
            <div className="flex items-center gap-0">
              {/* Likelihood label rotated */}
              <div className="w-8 shrink-0 flex items-center justify-center">
                <span
                  className="text-[11px] text-muted-foreground"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  Likelihood ↑
                </span>
              </div>
              <div className="flex flex-col gap-0">
                {/* Impact header row */}
                <div className="flex">
                  <div className="w-8 shrink-0" />
                  {IMPACTS.map((imp) => (
                    <div
                      key={imp}
                      className="w-14 text-center text-[11px] text-muted-foreground pb-1"
                    >
                      {imp}
                    </div>
                  ))}
                </div>
                {/* Rows: likelihood 5→1 (high at top) */}
                {[5, 4, 3, 2, 1].map((lik) => (
                  <div key={lik} className="flex items-center">
                    <div className="w-8 shrink-0 text-center text-[11px] text-muted-foreground">
                      {lik}
                    </div>
                    {IMPACTS.map((imp) => {
                      const score = lik * imp;
                      const cellItems = matrixMap[`${lik}_${imp}`] ?? [];
                      const bg =
                        score >= 15
                          ? "bg-red-500/20 border-red-500/30"
                          : score >= 8
                          ? "bg-amber-400/15 border-amber-400/30"
                          : "bg-gda-green/10 border-gda-green/20";
                      return (
                        <div
                          key={imp}
                          title={cellItems.map((r) => r.title).join("\n")}
                          className={cn(
                            "w-14 h-10 border flex items-center justify-center text-[11px] font-mono cursor-default",
                            bg
                          )}
                        >
                          {cellItems.length > 0 ? (
                            <span className={cn("font-bold", scoreColor(score))}>
                              {cellItems.length}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30 text-[11px]">{score}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Numbers = risk count per cell. Hover for titles. Red ≥ 15 · Amber ≥ 8 · Green {'<'} 8.
            </p>
          </div>
        </div>
      </CollapseSection>

      {/* Risk Table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Risk</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-left font-medium">L</th>
              <th className="px-3 py-2 text-left font-medium">I</th>
              <th className="px-3 py-2 text-left font-medium">Score</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Opportunity</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  <td colSpan={9} className="px-3 py-2">
                    <div className="h-3 bg-gda-panel rounded w-3/4" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No risks logged yet — click {'"+"'} Add Risk to create one
                </td>
              </tr>
            ) : (
              items.map((r) => {
                const score = riskScore(r.likelihood ?? 3, r.impact ?? 3);
                return (
                  <tr key={r.id} className="border-b border-border hover:bg-gda-panel/50">
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className="block font-medium text-xs text-foreground truncate" title={r.title}>
                        {r.title}
                      </span>
                      {r.mitigation && (
                        <span className="block text-[11px] text-muted-foreground truncate" title={r.mitigation}>
                          {r.mitigation}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground capitalize">
                      {r.category ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-foreground">
                      {r.likelihood ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-foreground">
                      {r.impact ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-left">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono font-bold", scoreBg(score))}>
                        {score}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left">
                      <Badge variant={statusBadgeVariant(r.status ?? "open") as "outline" | "destructive" | "secondary"} className="text-[11px] capitalize">
                        {r.status ?? "open"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground">
                      {r.owner ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground max-w-[140px]">
                      {r.opportunity_title ? (
                        <span className="truncate block" title={r.opportunity_title}>
                          {r.opportunity_title}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-left">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="text-[11px] text-red-400 hover:text-red-300"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* AI Risk Generation (future) */}
      <CollapseSection id="risk-ai-gen" title="AI Risk Generation" defaultOpen={false}>
        <PendingState
          surface="AI Risk Generation"
          reason="Will auto-generate risks from opportunity analysis cache using the LLM router. Activates with the intelligence layer."
        />
      </CollapseSection>
    </div>
  );
}
