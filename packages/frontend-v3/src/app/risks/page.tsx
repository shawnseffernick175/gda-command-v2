"use client";

import { Suspense, useState, useMemo } from "react";
import { useRisks, useCreateRisk, useUpdateRisk, useDeleteRisk, useGenerateRisks } from "@/hooks/use-risks";
import { useOpportunities } from "@/hooks/use-opportunities";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
import { RiskDetailPanel } from "@/components/RiskDetailPanel";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { useColumnFilters } from "@/hooks/use-column-filters";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { cn } from "@/lib/utils";
import type { Risk, RiskCategory, RiskSeverity, RiskStatus } from "@/lib/types";

const CATEGORIES: RiskCategory[] = [
  "doctrine_violation", "margin", "compliance", "past_performance",
  "teaming", "incumbent_advantage", "schedule", "staffing",
  "certification", "price", "technical", "other",
  "operational", "financial", "competitive", "personnel",
];

const SEVERITIES: RiskSeverity[] = ["critical", "high", "medium", "low"];

const STATUSES: RiskStatus[] = ["open", "mitigating", "resolved", "accepted", "mitigated", "closed"];

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

function sourceBadge(source: string) {
  switch (source) {
    case "doctrine_rule":
      return "bg-critical/10 text-critical border-critical/30";
    case "color_review":
      return "bg-amber-400/10 text-amber-400 border-amber-400/30";
    case "sentinel":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "ai_generated":
      return "bg-accent/10 text-accent border-accent/30";
    default:
      return "bg-muted/10 text-muted-foreground border-border";
  }
}

const EMPTY_FORM: {
  title: string;
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  likelihood: number;
  impact: number;
  status: RiskStatus;
  owner: string;
  mitigation: string;
  mitigation_plan: string;
} = {
  title: "",
  description: "",
  category: "other",
  severity: "medium",
  likelihood: 3,
  impact: 3,
  status: "open",
  owner: "",
  mitigation: "",
  mitigation_plan: "",
};

function AiRiskGeneration() {
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const generateRisks = useGenerateRisks(selectedOppId);
  const { data: oppData } = useOpportunities();
  const opportunities = oppData?.items ?? [];

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted">
        Select an active opportunity to auto-generate risks from its scope, agency, and deadline
        context. Generated risks are added to the risk register as AI-generated entries for your
        review.
      </p>

      <select
        value={selectedOppId ?? ""}
        onChange={(e) => setSelectedOppId(e.target.value || null)}
        className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
      >
        <option value="">Select opportunity</option>
        {opportunities.map((o) => (
          <option key={o.internal_id} value={String(o.id)}>
            {o.title}{o.agency ? ` — ${o.agency}` : ""}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!selectedOppId || generateRisks.isPending}
        onClick={() => generateRisks.mutate()}
        className="rounded border border-accent bg-accent/10 px-4 py-1.5 text-caption font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
      >
        {generateRisks.isPending ? "Generating..." : "Generate Risks"}
      </button>

      {generateRisks.isError && (
        <p className="text-caption text-red-400">
          {generateRisks.error instanceof Error ? generateRisks.error.message : "Failed to generate risks"}
        </p>
      )}

      {generateRisks.isSuccess && generateRisks.data && (
        <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-1">
          <p className="text-caption font-medium text-accent">
            Generated {generateRisks.data.risks_created} risks and added to register.
          </p>
          <p className="text-caption text-muted">{generateRisks.data.generation_summary}</p>
        </div>
      )}
    </div>
  );
}

const RISK_SORT_COLS: ColumnSortConfig[] = [
  { field: "title", type: "string" },
  { field: "severity", type: "enum", enumOrder: ["critical", "high", "medium", "low"] },
  { field: "category", type: "string" },
  { field: "status", type: "enum", enumOrder: ["open", "mitigating", "resolved", "accepted", "mitigated", "closed"] },
  { field: "owner", type: "string" },
  { field: "source", type: "string" },
  { field: "opportunity_title", type: "string" },
  { field: "identified_at", type: "string" },
];

function RisksRegisterContent() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const { sortBy, sortDir, handleSort } = useTableSort();
  const { filters, setFilter, applyFilters } = useColumnFilters();

  const { data, isLoading } = useRisks({
    status: filterStatus || undefined,
    severity: filterSeverity || undefined,
    category: filterCategory || undefined,
  });
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  const rawItems = useMemo(() => data?.items ?? [], [data?.items]);
  const filteredItems = useMemo(
    () => applyFilters(rawItems),
    [rawItems, applyFilters],
  );
  const items = useMemo(() => {
    if (!sortBy) return filteredItems;
    return sortData(filteredItems as unknown as Record<string, unknown>[], sortBy, sortDir, RISK_SORT_COLS) as unknown as Risk[];
  }, [filteredItems, sortBy, sortDir]);

  // Summary counts
  const counts = useMemo(() => {
    const all = data?.items ?? [];
    return {
      total: all.length,
      critical: all.filter((r) => r.severity === "critical" && r.status === "open").length,
      high: all.filter((r) => r.severity === "high" && r.status === "open").length,
      open: all.filter((r) => r.status === "open").length,
    };
  }, [data?.items]);

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
      category: (risk.category ?? "other") as RiskCategory,
      severity: (risk.severity ?? "medium") as RiskSeverity,
      likelihood: risk.likelihood ?? 3,
      impact: risk.impact ?? 3,
      status: (risk.status ?? "open") as RiskStatus,
      owner: risk.owner ?? "",
      mitigation: risk.mitigation ?? "",
      mitigation_plan: risk.mitigation_plan ?? "",
    });
    setEditingId(risk.id);
    setShowForm(true);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this risk?")) return;
    await deleteRisk.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-section font-semibold text-ink">Risk Register</span>
          <Badge variant="outline" className="text-caption">
            {counts.total} total
          </Badge>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {counts.critical > 0 && (
            <span className={cn("rounded border px-2 py-0.5 text-caption font-medium", severityBadge("critical"))}>
              {counts.critical} critical
            </span>
          )}
          {counts.high > 0 && (
            <span className={cn("rounded border px-2 py-0.5 text-caption font-medium", severityBadge("high"))}>
              {counts.high} high
            </span>
          )}
          <span className={cn("rounded border px-2 py-0.5 text-caption font-medium", statusBadge("open"))}>
            {counts.open} open
          </span>
          <button
            type="button"
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setEditingId(null);
              setShowForm((v) => !v);
            }}
            className={cn(
              "rounded border px-3 py-1 text-caption font-medium transition-colors",
              showForm
                ? "border-border bg-bg text-muted"
                : "border-accent bg-accent/10 text-accent hover:bg-accent/20"
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
          className="card p-4 space-y-3"
        >
          <p className="text-body font-semibold text-ink">
            {editingId ? "Edit Risk" : "New Risk"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-caption text-muted mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Key personnel departure"
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-caption text-muted mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Details about the risk..."
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-caption text-muted mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as RiskCategory }))}
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption text-muted mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as RiskSeverity }))}
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
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as RiskStatus }))}
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption text-muted mb-1">Owner</label>
              <input
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder="Person responsible"
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-caption text-muted mb-1">Mitigation Plan</label>
              <textarea
                rows={2}
                value={form.mitigation_plan}
                onChange={(e) => setForm((f) => ({ ...f, mitigation_plan: e.target.value }))}
                placeholder="Steps to reduce or accept this risk..."
                className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded border border-accent bg-accent/10 px-4 py-1.5 text-caption font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Risk"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); }}
              className="rounded border border-border px-4 py-1.5 text-caption text-muted hover:text-ink transition-colors"
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
          className="rounded border border-border bg-bg px-2.5 py-1 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded border border-border bg-bg px-2.5 py-1 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="">All Severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded border border-border bg-bg px-2.5 py-1 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
          ))}
        </select>
        {(filterStatus || filterSeverity || filterCategory) && (
          <button
            type="button"
            onClick={() => { setFilterStatus(""); setFilterSeverity(""); setFilterCategory(""); }}
            className="text-caption text-muted hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Risk Table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border bg-bg text-caption text-muted">
              <SortableHeader label="Risk" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} textFilter={{ value: filters.title ?? "", onChange: (v) => setFilter("title", v) }} />
              <SortableHeader label="Severity" field="severity" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Category" field="category" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} textFilter={{ value: filters.category ?? "", onChange: (v) => setFilter("category", v) }} />
              <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Owner" field="owner" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} textFilter={{ value: filters.owner ?? "", onChange: (v) => setFilter("owner", v) }} />
              <SortableHeader label="Source" field="source" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Entity" field="opportunity_title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Identified" field="identified_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium bg-bg">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  <td colSpan={9} className="px-3 py-2">
                    <div className="h-3 bg-bg rounded w-3/4" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-caption text-muted">
                  No risks logged yet — click + Add Risk to create one
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-bg/50 cursor-pointer" onClick={() => setSelectedRisk(r)}>
                  <td className="px-3 py-2 max-w-[220px]">
                    <span className="block font-medium text-caption text-ink truncate" title={r.title}>
                      {r.title}
                    </span>
                    {r.description && (
                      <span className="block text-caption text-muted truncate" title={r.description}>
                        {r.description}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded border px-1.5 py-0.5 text-caption font-medium uppercase", severityBadge(r.severity))}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-left text-caption text-muted">
                    {(r.category ?? "other").replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded border px-1.5 py-0.5 text-caption font-medium", statusBadge(r.status))}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-left text-caption text-muted">
                    {r.owner ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded border px-1.5 py-0.5 text-caption", sourceBadge(r.source))}>
                      {r.source.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-left text-caption text-muted max-w-[140px]">
                    {r.opportunity_title ? (
                      <span className="truncate block" title={r.opportunity_title}>
                        {r.opportunity_title}
                      </span>
                    ) : "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-left text-caption text-muted tabular-nums">
                    {r.identified_at ? new Date(r.identified_at).toLocaleDateString() : "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                        className="text-caption text-muted hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                        className="text-caption text-red-400 hover:text-red-300"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* AI Risk Generation */}
      <CollapseSection id="risk-ai-gen" title="AI Risk Generation" defaultOpen={false}>
        <AiRiskGeneration />
      </CollapseSection>

      {/* Risk Detail Panel */}
      {selectedRisk && (
        <RiskDetailPanel
          risk={selectedRisk}
          onClose={() => setSelectedRisk(null)}
        />
      )}
    </div>
  );
}

export default function RisksPage() {
  return (
    <Suspense fallback={<div />}>
      <RisksPageInner />
    </Suspense>
  );
}

function RisksPageInner() {
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-bg border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        <div className="flex items-baseline gap-3">
          <h1 className="shrink-0 text-section font-semibold text-ink">Risks</h1>
          <p className="truncate text-caption text-muted">
            First-class risk register — track, mitigate, and resolve risks across the capture lifecycle
          </p>
        </div>
      </div>

      <RisksRegisterContent />
    </div>
  );
}
