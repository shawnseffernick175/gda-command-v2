import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types (matching backend response shapes)
// ---------------------------------------------------------------------------

interface GDAEnvelope<T> {
  success: boolean;
  workflow: string;
  action: string;
  dryRun: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: { code: string; message: string; detail: string | null } | null;
}

interface IntelItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: string;
  source: string;
  source_url: string | null;
  related_opportunity_id: string | null;
  related_competitor: string | null;
  tags: string[];
  created_at: string;
  read: boolean;
}

interface IntelFeedData {
  items: IntelItem[];
  total: number;
  filtered: number;
  unreadCount: number;
  categoryCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  source: "mock" | "db";
}

interface BriefingMetric {
  label: string;
  value: string;
  change: string | null;
  trend: "up" | "down" | "flat";
}

interface BriefingAlert {
  severity: string;
  message: string;
  source: string;
  action_required: boolean;
}

interface BriefingActionItem {
  action: string;
  priority: string;
  due: string | null;
  context: string;
}

interface MorningBriefing {
  id: string;
  date: string;
  headline: string;
  key_metrics: BriefingMetric[];
  alerts: BriefingAlert[];
  action_items: BriefingActionItem[];
  market_snapshot: string;
  generated_at: string;
}

interface BriefingsData {
  briefings: MorningBriefing[];
  total: number;
  source: "mock" | "db";
}

interface DeepResearchReport {
  id: string;
  query: string;
  status: string;
  summary: string | null;
  findings: string | null;
  sources_count: number;
  requested_at: string;
  completed_at: string | null;
  requested_by: string;
}

interface ResearchData {
  reports: DeepResearchReport[];
  total: number;
  filtered: number;
  statusCounts: Record<string, number>;
  source: "mock" | "db";
}

interface CompetitorProfile {
  id: string;
  name: string;
  threat_score: number;
  contracts_won: number;
  contracts_value: number;
  primary_naics: string[];
  strengths: string[];
  weaknesses: string[];
  recent_wins: string[];
  watch_status: string;
  last_updated: string;
}

interface CompetitorsData {
  competitors: CompetitorProfile[];
  total: number;
  filtered: number;
  source: "mock" | "db";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string): Promise<GDAEnvelope<T>> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<GDAEnvelope<T>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabId = "briefing" | "feed" | "research" | "competitors";

const TABS: { id: TabId; label: string }[] = [
  { id: "briefing", label: "Morning Briefing" },
  { id: "feed", label: "Intel Feed" },
  { id: "research", label: "Deep Research" },
  { id: "competitors", label: "Competitor Watch" },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

const CATEGORY_COLORS: Record<string, string> = {
  competitive: "#f59e0b",
  market: "#8b5cf6",
  threat: "#ef4444",
  opportunity: "#22c55e",
  regulatory: "#06b6d4",
  technology: "#ec4899",
};

const TREND_SYMBOLS: Record<string, string> = {
  up: "\u25b2",
  down: "\u25bc",
  flat: "\u2014",
};

const RESEARCH_STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  in_progress: "#3b82f6",
  queued: "#6b7280",
  failed: "#ef4444",
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(iso: string): string {
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by spec.
  // Append T12:00 to avoid timezone shift showing the wrong day.
  const safe = iso.length === 10 ? `${iso}T12:00:00` : iso;
  return new Date(safe).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Intel() {
  const [tab, setTab] = useState<TabId>("briefing");

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Intel Hub</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 20 }}>
        Intelligence feed, morning briefings, deep research, and competitor watch.
      </p>

      {/* Source badge */}
      <div style={{ marginBottom: 16 }}>
        <span style={{
          padding: "3px 10px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: "rgba(59,130,246,0.15)",
          color: "#3b82f6",
        }}>
          Mock data
        </span>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 24,
        borderBottom: "1px solid var(--color-border)",
        paddingBottom: 0,
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? "var(--color-primary)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.id ? "2px solid var(--color-primary)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "briefing" && <BriefingTab />}
      {tab === "feed" && <FeedTab />}
      {tab === "research" && <ResearchTab />}
      {tab === "competitors" && <CompetitorsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Briefing Tab
// ---------------------------------------------------------------------------

function BriefingTab() {
  const [briefings, setBriefings] = useState<MorningBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<BriefingsData>("/intel/briefings")
      .then((env) => {
        if (env.success && env.data) {
          setBriefings(env.data.briefings);
          if (env.data.briefings.length > 0) setSelectedId(env.data.briefings[0].id);
        } else {
          setError(env.error?.message ?? "Failed to load briefings");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingMsg />;
  if (error) return <ErrorMsg msg={error} />;

  const selected = briefings.find((b) => b.id === selectedId) ?? null;

  return (
    <div>
      {/* Date selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {briefings.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedId(b.id)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: b.id === selectedId ? 600 : 400,
              border: "1px solid",
              borderColor: b.id === selectedId ? "var(--color-primary)" : "var(--color-border)",
              background: b.id === selectedId ? "rgba(59,130,246,0.1)" : "transparent",
              color: b.id === selectedId ? "var(--color-primary)" : "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            {formatDate(b.date)}
          </button>
        ))}
      </div>

      {selected && (
        <>
          {/* Headline */}
          <div style={{
            padding: "16px 20px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 16,
            fontWeight: 600,
          }}>
            {selected.headline}
          </div>

          {/* Key Metrics */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}>
            {selected.key_metrics.map((m) => (
              <div key={m.label} style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "12px 16px",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 4 }}>
                  {m.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{m.value}</span>
                  {m.change && (
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: m.trend === "up" ? "#22c55e" : m.trend === "down" ? "#ef4444" : "var(--color-text-muted)",
                    }}>
                      {TREND_SYMBOLS[m.trend]} {m.change}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Alerts */}
          <SectionHeader title="Alerts" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {selected.alerts.map((a, i) => (
              <div key={i} style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: `1px solid ${PRIORITY_COLORS[a.severity] ?? "#6b7280"}30`,
                background: `${PRIORITY_COLORS[a.severity] ?? "#6b7280"}08`,
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}>
                <PriorityBadge priority={a.severity} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{a.message}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                    Source: {a.source} {a.action_required && " \u2022 Action required"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Items */}
          <SectionHeader title="Action Items" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {selected.action_items.map((a, i) => (
              <div key={i} style={{
                padding: "10px 16px",
                borderRadius: 6,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}>
                <PriorityBadge priority={a.priority} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{a.action}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{a.context}</div>
                </div>
                {a.due && (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                    Due: {formatDate(a.due)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Market Snapshot */}
          <SectionHeader title="Market Snapshot" />
          <div style={{
            padding: 16,
            borderRadius: 8,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--color-text-muted)",
          }}>
            {selected.market_snapshot}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed Tab
// ---------------------------------------------------------------------------

function FeedTab() {
  const [data, setData] = useState<IntelFeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search) params.set("search", search);
    const qs = params.toString();
    fetchJson<IntelFeedData>(`/intel/feed${qs ? `?${qs}` : ""}`)
      .then((env) => {
        if (env.success && env.data) setData(env.data);
        else setError(env.error?.message ?? "Failed to load intel feed");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [categoryFilter, priorityFilter, search]);

  if (loading && !data) return <LoadingMsg />;
  if (error && !data) return <ErrorMsg msg={error} />;
  if (!data) return null;

  return (
    <div>
      {/* Summary strip */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 16,
        flexWrap: "wrap",
      }}>
        <SummaryChip label="Total" value={String(data.total)} />
        <SummaryChip label="Filtered" value={String(data.filtered)} />
        <SummaryChip label="Unread" value={String(data.unreadCount)} accent="#ef4444" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Search title, summary, tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={selectStyle}>
          <option value="">All Categories</option>
          {Object.entries(data.categoryCounts).map(([k, v]) => (
            <option key={k} value={k}>{k} ({v})</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={selectStyle}>
          <option value="">All Priorities</option>
          {Object.entries(data.priorityCounts).map(([k, v]) => (
            <option key={k} value={k}>{k} ({v})</option>
          ))}
        </select>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.items.map((item) => (
          <div key={item.id} style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: item.read ? "var(--color-surface)" : "rgba(59,130,246,0.04)",
            borderLeft: item.read ? undefined : `3px solid ${PRIORITY_COLORS[item.priority] ?? "#6b7280"}`,
          }}>
            <div
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <PriorityBadge priority={item.priority} />
              <CategoryBadge category={item.category} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: item.read ? 400 : 600 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                  {formatDateTime(item.created_at)} · {item.source}
                  {item.related_competitor && ` · ${item.related_competitor}`}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {expandedId === item.id ? "\u25b2" : "\u25bc"}
              </span>
            </div>
            {expandedId === item.id && (
              <div style={{
                padding: "0 16px 14px 16px",
                borderTop: "1px solid var(--color-border)",
                paddingTop: 12,
              }}>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
                  {item.summary}
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.tags.map((t) => (
                    <span key={t} style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      background: "rgba(255,255,255,0.06)",
                      color: "var(--color-text-muted)",
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
                {item.source_url && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "var(--color-primary)" }}
                    >
                      View source \u2192
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Research Tab
// ---------------------------------------------------------------------------

function ResearchTab() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<ResearchData>("/intel/research")
      .then((env) => {
        if (env.success && env.data) setData(env.data);
        else setError(env.error?.message ?? "Failed to load research");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingMsg />;
  if (error) return <ErrorMsg msg={error} />;
  if (!data) return null;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <SummaryChip label="Total" value={String(data.total)} />
        {Object.entries(data.statusCounts).map(([k, v]) => (
          <SummaryChip key={k} label={k.replace("_", " ")} value={String(v)} accent={RESEARCH_STATUS_COLORS[k]} />
        ))}
      </div>

      {/* Reports */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.reports.map((r) => (
          <div key={r.id} style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-surface)",
          }}>
            <div
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              style={{
                padding: "14px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{
                padding: "2px 10px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: `${RESEARCH_STATUS_COLORS[r.status] ?? "#6b7280"}20`,
                color: RESEARCH_STATUS_COLORS[r.status] ?? "#6b7280",
                textTransform: "capitalize",
              }}>
                {r.status.replace("_", " ")}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.query}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                  Requested by {r.requested_by} · {formatDateTime(r.requested_at)}
                  {r.completed_at && ` · Completed ${formatDateTime(r.completed_at)}`}
                  {r.sources_count > 0 && ` · ${r.sources_count} sources`}
                </div>
              </div>
              {r.summary && (
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {expandedId === r.id ? "\u25b2" : "\u25bc"}
                </span>
              )}
            </div>
            {expandedId === r.id && r.summary && (
              <div style={{
                padding: "0 16px 14px",
                borderTop: "1px solid var(--color-border)",
                paddingTop: 12,
              }}>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
                  {r.summary}
                </p>
                {r.findings && (
                  <div style={{
                    padding: 16,
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--color-border)",
                    fontSize: 14,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}>
                    {r.findings}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Competitors Tab
// ---------------------------------------------------------------------------

function CompetitorsTab() {
  const [data, setData] = useState<CompetitorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const qs = params.toString();
    fetchJson<CompetitorsData>(`/intel/competitors${qs ? `?${qs}` : ""}`)
      .then((env) => {
        if (env.success && env.data) setData(env.data);
        else setError(env.error?.message ?? "Failed to load competitors");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [search]);

  if (loading && !data) return <LoadingMsg />;
  if (error && !data) return <ErrorMsg msg={error} />;
  if (!data) return null;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <SummaryChip label="Tracked" value={String(data.total)} />
        <SummaryChip label="Shown" value={String(data.filtered)} />
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search competitors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.competitors.map((c) => {
          const scoreColor = c.threat_score >= 85 ? "#ef4444" : c.threat_score >= 70 ? "#f59e0b" : "#22c55e";
          return (
            <div key={c.id} style={{
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              background: "var(--color-surface)",
            }}>
              <div
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                style={{
                  padding: "14px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {/* Threat score */}
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: `2px solid ${scoreColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: scoreColor }}>{c.threat_score}</span>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                    <span style={{
                      padding: "1px 8px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "capitalize",
                      background: c.watch_status === "active" ? "rgba(239,68,68,0.15)" : "rgba(107,114,128,0.15)",
                      color: c.watch_status === "active" ? "#ef4444" : "#6b7280",
                    }}>
                      {c.watch_status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {c.contracts_won} contracts · {formatCurrency(c.contracts_value)} total value · Updated {formatDate(c.last_updated)}
                  </div>
                </div>

                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {expandedId === c.id ? "\u25b2" : "\u25bc"}
                </span>
              </div>

              {expandedId === c.id && (
                <div style={{
                  padding: "0 16px 16px",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: 14,
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
                    {/* Strengths */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "#22c55e", marginBottom: 6 }}>
                        Strengths
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--color-text-muted)" }}>
                        {c.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    {/* Weaknesses */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "#ef4444", marginBottom: 6 }}>
                        Weaknesses
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--color-text-muted)" }}>
                        {c.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  </div>

                  {/* Recent wins */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>
                      Recent Wins
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {c.recent_wins.map((w, i) => (
                        <span key={i} style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--color-border)",
                        }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* NAICS */}
                  <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      NAICS: {c.primary_naics.join(", ")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

function LoadingMsg() {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
      Loading...
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "#ef4444" }}>
      Error: {msg}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, marginTop: 0 }}>{title}</h3>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 10,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      background: `${PRIORITY_COLORS[priority] ?? "#6b7280"}20`,
      color: PRIORITY_COLORS[priority] ?? "#6b7280",
      whiteSpace: "nowrap",
    }}>
      {priority}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 10,
      fontSize: 10,
      fontWeight: 600,
      textTransform: "capitalize",
      background: `${CATEGORY_COLORS[category] ?? "#6b7280"}15`,
      color: CATEGORY_COLORS[category] ?? "#6b7280",
      whiteSpace: "nowrap",
    }}>
      {category}
    </span>
  );
}

function SummaryChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: "6px 14px",
      borderRadius: 6,
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      fontSize: 13,
    }}>
      <span style={{ color: "var(--color-text-muted)", marginRight: 6 }}>{label}</span>
      <span style={{ fontWeight: 700, color: accent ?? "var(--color-text)" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 14,
  width: 260,
};

const selectStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 14,
};
