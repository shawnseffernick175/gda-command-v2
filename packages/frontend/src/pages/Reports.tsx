import { useEffect, useState } from "react";
import {
  fetchReportTemplates,
  fetchGeneratedReports,
  fetchScheduledReports,
  fetchExportJobs,
  triggerReportGeneration,
  type ReportTemplatesData,
  type GeneratedReportsData,
  type ScheduledReportsData,
  type ExportJobsData,
  type ReportTemplateRow,
  type GeneratedReportRow,
  type GenerateReportResult,
} from "../api/client";

const CATEGORY_LABELS: Record<string, string> = {
  pipeline: "Pipeline",
  bd_performance: "BD Performance",
  executive_summary: "Executive Summary",
  sitrep: "SITREP",
  financial: "Financial",
  compliance: "Compliance",
};

const CATEGORY_COLORS: Record<string, string> = {
  pipeline: "#3b82f6",
  bd_performance: "#8b5cf6",
  executive_summary: "#f59e0b",
  sitrep: "#ef4444",
  financial: "#22c55e",
  compliance: "#14b8a6",
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  excel: "Excel",
  pptx: "PowerPoint",
  csv: "CSV",
};

const FORMAT_COLORS: Record<string, string> = {
  pdf: "#ef4444",
  excel: "#22c55e",
  pptx: "#f59e0b",
  csv: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  generating: "#3b82f6",
  scheduled: "#8b5cf6",
  failed: "#ef4444",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

type TabKey = "templates" | "generated" | "scheduled" | "exports";

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function timeUntil(dateStr: string): string {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms < 0) return "overdue";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function Reports() {
  const [tab, setTab] = useState<TabKey>("templates");
  const [tplData, setTplData] = useState<ReportTemplatesData | null>(null);
  const [genData, setGenData] = useState<GeneratedReportsData | null>(null);
  const [schData, setSchData] = useState<ScheduledReportsData | null>(null);
  const [expData, setExpData] = useState<ExportJobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Template detail
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateRow | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");

  // Generate modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateTemplate, setGenerateTemplate] = useState<ReportTemplateRow | null>(null);
  const [generateFormat, setGenerateFormat] = useState("");
  const [generateResult, setGenerateResult] = useState<GenerateReportResult | null>(null);
  const [generating, setGenerating] = useState(false);

  // Generated report detail
  const [selectedReport, setSelectedReport] = useState<GeneratedReportRow | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchReportTemplates(),
      fetchGeneratedReports(),
      fetchScheduledReports(),
      fetchExportJobs(),
    ])
      .then(([tplEnv, genEnv, schEnv, expEnv]) => {
        if (tplEnv.success && tplEnv.data) setTplData(tplEnv.data);
        else setError(tplEnv.error?.message ?? "Failed to load templates");
        if (genEnv.success && genEnv.data) setGenData(genEnv.data);
        if (schEnv.success && schEnv.data) setSchData(schEnv.data);
        if (expEnv.success && expEnv.data) setExpData(expEnv.data);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, color: "var(--color-text-muted)" }}>Loading reports...</div>;
  if (error) return <div style={{ padding: 40, color: "#ef4444" }}>Error: {error}</div>;

  const templates = tplData?.templates ?? [];
  const reports = genData?.reports ?? [];
  const schedules = schData?.schedules ?? [];
  const exports = expData?.exports ?? [];

  // Summary values
  const totalTemplates = tplData?.total ?? 0;
  const totalReports = genData?.total ?? 0;
  const completedReports = genData?.summary.statusCounts.completed ?? 0;
  const failedReports = genData?.summary.statusCounts.failed ?? 0;
  const activeSchedules = schData?.summary.enabled ?? 0;
  const totalExports = expData?.total ?? 0;
  const totalCategories = tplData?.summary.categories ?? 0;

  // Filter templates
  let filteredTemplates = [...templates];
  if (categoryFilter) filteredTemplates = filteredTemplates.filter((t) => t.category === categoryFilter);
  if (search) {
    const q = search.toLowerCase();
    filteredTemplates = filteredTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  // Filter generated reports
  let filteredReports = [...reports];
  if (categoryFilter) filteredReports = filteredReports.filter((r) => r.category === categoryFilter);
  if (statusFilter) filteredReports = filteredReports.filter((r) => r.status === statusFilter);
  if (formatFilter) filteredReports = filteredReports.filter((r) => r.format === formatFilter);
  if (search) {
    const q = search.toLowerCase();
    filteredReports = filteredReports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.template_name.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
    );
  }

  const handleGenerate = async () => {
    if (!generateTemplate) return;
    setGenerating(true);
    setGenerateResult(null);
    try {
      const env = await triggerReportGeneration({
        template_id: generateTemplate.id,
        format: generateFormat || undefined,
      });
      if (env.success && env.data) {
        setGenerateResult(env.data);
      }
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const openGenerateModal = (tpl: ReportTemplateRow) => {
    setGenerateTemplate(tpl);
    setGenerateFormat(tpl.default_format);
    setGenerateResult(null);
    setShowGenerateModal(true);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Reporting & Export</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            Generate reports, schedule automated delivery, and export data across all GDA modules.
          </p>
        </div>
        <span style={{
          padding: "4px 12px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: "rgba(59,130,246,0.15)",
          color: "#60a5fa",
        }}>
          Mock data
        </span>
      </div>

      {/* Summary Strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 12,
        marginBottom: 20,
      }}>
        {[
          { label: "Templates", value: totalTemplates, color: "#3b82f6" },
          { label: "Reports Generated", value: totalReports, color: "#8b5cf6" },
          { label: "Completed", value: completedReports, color: "#22c55e" },
          { label: "Failed", value: failedReports, color: failedReports > 0 ? "#ef4444" : "#6b7280" },
          { label: "Active Schedules", value: activeSchedules, color: "#f59e0b" },
          { label: "Export Jobs", value: totalExports, color: "#14b8a6" },
          { label: "Categories", value: totalCategories, color: "#6b7280" },
        ].map((kpi) => (
          <div key={kpi.label} style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "12px 16px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--color-border)" }}>
        {(["templates", "generated", "scheduled", "exports"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedTemplate(null); setSelectedReport(null); }}
            style={{
              padding: "8px 16px",
              background: tab === t ? "var(--color-surface)" : "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              color: tab === t ? "var(--color-text)" : "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {t === "templates" ? `Templates (${totalTemplates})` :
             t === "generated" ? `History (${totalReports})` :
             t === "scheduled" ? `Schedules (${activeSchedules})` :
             `Exports (${totalExports})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={tab === "templates" ? "Search templates..." : "Search reports..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            width: 200,
          }}
        />
        {(tab === "templates" || tab === "generated") && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: 13,
            }}
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        {tab === "generated" && (
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 13,
              }}
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="generating">Generating</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 13,
              }}
            >
              <option value="">All Formats</option>
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </>
        )}
        {(search || categoryFilter || statusFilter || formatFilter) && (
          <button
            onClick={() => { setSearch(""); setCategoryFilter(""); setStatusFilter(""); setFormatFilter(""); }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Templates Tab */}
      {tab === "templates" && (
        <div style={{ display: "flex", gap: 16 }}>
          {/* Template List */}
          <div style={{ flex: selectedTemplate ? "0 0 420px" : 1, overflow: "auto", maxHeight: "calc(100vh - 340px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: selectedTemplate ? "1fr" : "repeat(2, 1fr)", gap: 12 }}>
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  style={{
                    padding: 16,
                    background: selectedTemplate?.id === tpl.id ? "rgba(59,130,246,0.08)" : "var(--color-surface)",
                    border: `1px solid ${selectedTemplate?.id === tpl.id ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{tpl.name}</h3>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `${CATEGORY_COLORS[tpl.category] ?? "#6b7280"}20`,
                      color: CATEGORY_COLORS[tpl.category] ?? "#6b7280",
                      whiteSpace: "nowrap",
                      marginLeft: 8,
                    }}>
                      {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                    {tpl.description.slice(0, 120)}{tpl.description.length > 120 ? "..." : ""}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
                      <span>{tpl.estimated_pages} pages</span>
                      <span>|</span>
                      <span>{tpl.use_count} uses</span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {tpl.available_formats.map((f) => (
                        <span
                          key={f}
                          style={{
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            background: `${FORMAT_COLORS[f] ?? "#6b7280"}15`,
                            color: FORMAT_COLORS[f] ?? "#6b7280",
                            textTransform: "uppercase",
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Template Detail Panel */}
          {selectedTemplate && (
            <div style={{
              flex: 1,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 20,
              overflow: "auto",
              maxHeight: "calc(100vh - 340px)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selectedTemplate.name}</h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `${CATEGORY_COLORS[selectedTemplate.category] ?? "#6b7280"}20`,
                      color: CATEGORY_COLORS[selectedTemplate.category] ?? "#6b7280",
                    }}>
                      {CATEGORY_LABELS[selectedTemplate.category] ?? selectedTemplate.category}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      by {selectedTemplate.created_by}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => openGenerateModal(selectedTemplate)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--color-primary)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Generate Report
                </button>
              </div>

              <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
                {selectedTemplate.description}
              </p>

              {/* Quick stats */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginBottom: 20,
              }}>
                {[
                  { label: "Pages", value: selectedTemplate.estimated_pages },
                  { label: "Uses", value: selectedTemplate.use_count },
                  { label: "Sections", value: selectedTemplate.sections.length },
                  { label: "Last Used", value: selectedTemplate.last_used ? formatDate(selectedTemplate.last_used) : "Never" },
                ].map((s) => (
                  <div key={s.label} style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.06)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Sections */}
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Report Sections</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedTemplate.sections
                  .slice().sort((a, b) => a.order - b.order)
                  .map((sec) => (
                    <div key={sec.id} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: sec.included ? "rgba(34,197,94,0.05)" : "rgba(107,114,128,0.05)",
                      border: `1px solid ${sec.included ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)"}`,
                      borderRadius: 6,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          <span style={{ color: sec.included ? "#22c55e" : "#6b7280", marginRight: 6 }}>
                            {sec.included ? "\u2713" : "\u2014"}
                          </span>
                          {sec.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 18 }}>
                          {sec.description}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: sec.included ? "#22c55e" : "#6b7280",
                      }}>
                        {sec.included ? "Included" : "Optional"}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Tags */}
              {selectedTemplate.tags.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Tags</h3>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedTemplate.tags.map((tag) => (
                      <span key={tag} style={{
                        padding: "2px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        background: "rgba(59,130,246,0.1)",
                        color: "#60a5fa",
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Available formats */}
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Export Formats</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  {selectedTemplate.available_formats.map((f) => (
                    <span key={f} style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      background: `${FORMAT_COLORS[f] ?? "#6b7280"}15`,
                      color: FORMAT_COLORS[f] ?? "#6b7280",
                      border: `1px solid ${FORMAT_COLORS[f] ?? "#6b7280"}30`,
                      textTransform: "uppercase",
                    }}>
                      {FORMAT_LABELS[f] ?? f}
                      {f === selectedTemplate.default_format && (
                        <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>(default)</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generated Reports Tab */}
      {tab === "generated" && (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: selectedReport ? "0 0 480px" : 1, overflow: "auto", maxHeight: "calc(100vh - 340px)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredReports.map((rpt) => (
                <div
                  key={rpt.id}
                  onClick={() => setSelectedReport(rpt)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    background: selectedReport?.id === rpt.id ? "rgba(59,130,246,0.08)" : "var(--color-surface)",
                    border: `1px solid ${selectedReport?.id === rpt.id ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Format icon */}
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: `${FORMAT_COLORS[rpt.format] ?? "#6b7280"}15`,
                    color: FORMAT_COLORS[rpt.format] ?? "#6b7280",
                    textTransform: "uppercase",
                    minWidth: 40,
                    textAlign: "center",
                  }}>
                    {rpt.format}
                  </span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rpt.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {rpt.template_name} &middot; {formatDateTime(rpt.generated_at)}
                    </div>
                  </div>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: `${STATUS_COLORS[rpt.status] ?? "#6b7280"}20`,
                    color: STATUS_COLORS[rpt.status] ?? "#6b7280",
                    textTransform: "capitalize",
                  }}>
                    {rpt.status}
                  </span>
                  {rpt.file_size_bytes !== null && (
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", minWidth: 50, textAlign: "right" }}>
                      {formatBytes(rpt.file_size_bytes)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Report Detail Panel */}
          {selectedReport && (
            <div style={{
              flex: 1,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 20,
              overflow: "auto",
              maxHeight: "calc(100vh - 340px)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{selectedReport.title}</h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `${CATEGORY_COLORS[selectedReport.category] ?? "#6b7280"}20`,
                      color: CATEGORY_COLORS[selectedReport.category] ?? "#6b7280",
                    }}>
                      {CATEGORY_LABELS[selectedReport.category] ?? selectedReport.category}
                    </span>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `${STATUS_COLORS[selectedReport.status] ?? "#6b7280"}20`,
                      color: STATUS_COLORS[selectedReport.status] ?? "#6b7280",
                      textTransform: "capitalize",
                    }}>
                      {selectedReport.status}
                    </span>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      background: `${FORMAT_COLORS[selectedReport.format] ?? "#6b7280"}15`,
                      color: FORMAT_COLORS[selectedReport.format] ?? "#6b7280",
                      textTransform: "uppercase",
                    }}>
                      {selectedReport.format}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginBottom: 20,
              }}>
                {[
                  { label: "Generated", value: formatDateTime(selectedReport.generated_at) },
                  { label: "Pages", value: selectedReport.page_count ?? "—" },
                  { label: "Size", value: formatBytes(selectedReport.file_size_bytes) },
                  { label: "By", value: selectedReport.generated_by },
                ].map((s) => (
                  <div key={s.label} style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.06)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Sections included */}
              {selectedReport.sections_included.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Sections Included</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {selectedReport.sections_included.map((sec, i) => (
                      <div key={i} style={{
                        padding: "6px 12px",
                        background: "rgba(34,197,94,0.05)",
                        border: "1px solid rgba(34,197,94,0.15)",
                        borderRadius: 4,
                        fontSize: 12,
                      }}>
                        <span style={{ color: "#22c55e", marginRight: 6 }}>{"\u2713"}</span>
                        {sec}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Parameters */}
              {Object.keys(selectedReport.parameters).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Parameters</h3>
                  <div style={{
                    padding: 12,
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}>
                    {Object.entries(selectedReport.parameters).map(([k, v]) => (
                      <div key={k} style={{ marginBottom: 2 }}>
                        <span style={{ color: "#60a5fa" }}>{k}</span>
                        <span style={{ color: "var(--color-text-muted)" }}>: </span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedReport.notes && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Notes</h3>
                  <div style={{
                    padding: 12,
                    background: selectedReport.status === "failed" ? "rgba(239,68,68,0.05)" : "rgba(59,130,246,0.05)",
                    border: `1px solid ${selectedReport.status === "failed" ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.15)"}`,
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: selectedReport.status === "failed" ? "#fca5a5" : "var(--color-text)",
                  }}>
                    {selectedReport.notes}
                  </div>
                </div>
              )}

              {/* Expiry */}
              {selectedReport.expires_at && (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
                  Expires: {formatDate(selectedReport.expires_at)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scheduled Tab */}
      {tab === "scheduled" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedules.map((sch) => (
            <div key={sch.id} style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 20px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
            }}>
              {/* Enabled indicator */}
              <span style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: sch.enabled ? "#22c55e" : "#6b7280",
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sch.template_name}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {sch.recipients.join(", ")}
                </div>
              </div>
              <span style={{
                padding: "2px 10px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(139,92,246,0.15)",
                color: "#a78bfa",
                textTransform: "capitalize",
              }}>
                {FREQ_LABELS[sch.frequency] ?? sch.frequency}
              </span>
              <span style={{
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                background: `${FORMAT_COLORS[sch.format] ?? "#6b7280"}15`,
                color: FORMAT_COLORS[sch.format] ?? "#6b7280",
                textTransform: "uppercase",
              }}>
                {sch.format}
              </span>
              <div style={{ textAlign: "right", minWidth: 120 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Next: {timeUntil(sch.next_run)}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {sch.last_run ? `Last: ${formatDate(sch.last_run)}` : "Never run"}
                </div>
              </div>
              <span style={{
                padding: "2px 8px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: sch.enabled ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)",
                color: sch.enabled ? "#22c55e" : "#6b7280",
              }}>
                {sch.enabled ? "Active" : "Paused"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Exports Tab */}
      {tab === "exports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 80px 100px 80px 100px 140px",
            gap: 12,
            padding: "8px 16px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            <span>Format</span>
            <span>Source</span>
            <span>Rows</span>
            <span>Size</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Correlation ID</span>
          </div>
          {exports.map((exp) => {
            const durationMs = exp.completed_at
              ? new Date(exp.completed_at).getTime() - new Date(exp.started_at).getTime()
              : null;
            return (
              <div key={exp.id} style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 80px 100px 80px 100px 140px",
                gap: 12,
                padding: "10px 16px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                alignItems: "center",
                fontSize: 13,
              }}>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${FORMAT_COLORS[exp.format] ?? "#6b7280"}15`,
                  color: FORMAT_COLORS[exp.format] ?? "#6b7280",
                  textTransform: "uppercase",
                  textAlign: "center",
                }}>
                  {exp.format}
                </span>
                <span style={{ fontWeight: 500 }}>{exp.source_page}</span>
                <span style={{ color: "var(--color-text-muted)" }}>{exp.row_count ?? "—"}</span>
                <span style={{ color: "var(--color-text-muted)" }}>{formatBytes(exp.file_size_bytes)}</span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  background: `${STATUS_COLORS[exp.status] ?? "#6b7280"}20`,
                  color: STATUS_COLORS[exp.status] ?? "#6b7280",
                  textTransform: "capitalize",
                  textAlign: "center",
                }}>
                  {exp.status}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}
                </span>
                <span style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {exp.correlation_id}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && generateTemplate && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
          onClick={() => { setShowGenerateModal(false); setGenerateResult(null); }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Generate Report</h2>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
              {generateTemplate.name}
            </p>

            {!generateResult ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Format</label>
                  <select
                    value={generateFormat}
                    onChange={(e) => setGenerateFormat(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: 13,
                      width: "100%",
                    }}
                  >
                    {generateTemplate.available_formats.map((f) => (
                      <option key={f} value={f}>
                        {FORMAT_LABELS[f] ?? f}{f === generateTemplate.default_format ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Sections ({generateTemplate.sections.filter((s) => s.included).length} included)
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {generateTemplate.sections.map((sec) => (
                      <div key={sec.id} style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        background: sec.included ? "rgba(34,197,94,0.05)" : "rgba(107,114,128,0.05)",
                        borderRadius: 4,
                        color: sec.included ? "var(--color-text)" : "var(--color-text-muted)",
                      }}>
                        <span style={{ color: sec.included ? "#22c55e" : "#6b7280", marginRight: 6 }}>
                          {sec.included ? "\u2713" : "\u2014"}
                        </span>
                        {sec.title}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setShowGenerateModal(false); setGenerateResult(null); }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: generating ? "#6b7280" : "var(--color-primary)",
                      color: "#fff",
                      cursor: generating ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {generating ? "Generating..." : "Generate (Dry Run)"}
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div style={{
                  padding: 16,
                  background: "rgba(34,197,94,0.05)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: 8,
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#22c55e", marginBottom: 8 }}>
                    {generateResult.status === "accepted" ? "Report Queued (Dry Run)" : generateResult.status}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {generateResult.message}
                  </div>
                </div>

                <div style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontFamily: "monospace",
                  fontSize: 12,
                  marginBottom: 16,
                }}>
                  <div><span style={{ color: "#60a5fa" }}>correlation_id</span>: {generateResult.correlation_id}</div>
                  <div><span style={{ color: "#60a5fa" }}>template</span>: {generateResult.template_name}</div>
                  <div><span style={{ color: "#60a5fa" }}>format</span>: {generateResult.format.toUpperCase()}</div>
                  <div><span style={{ color: "#60a5fa" }}>sections</span>: {generateResult.sections_included.length}</div>
                  <div><span style={{ color: "#60a5fa" }}>est_pages</span>: {generateResult.estimated_pages}</div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setShowGenerateModal(false); setGenerateResult(null); }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: "var(--color-primary)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
