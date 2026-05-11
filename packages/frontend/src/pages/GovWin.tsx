import { useEffect, useState } from "react";
import {
  fetchGovWinSummary,
  fetchGovWinOpportunities,
  fetchGovWinSyncs,
  triggerGovWinSync,
  promoteGovWinOpportunity,
  type GovWinSummaryData,
  type GovWinOpportunityRow,
  type GovWinSyncRow,
} from "../api/client";

type Tab = "opportunities" | "syncs";

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  tracking: "#d97706",
  qualified: "#16a34a",
  dismissed: "#6b7280",
  archived: "#4b5563",
};

const STAGE_COLORS: Record<string, string> = {
  Forecast: "#8b5cf6",
  "Pre-RFP": "#3b82f6",
  "Pre-Solicitation": "#0ea5e9",
  "RFP Released": "#f59e0b",
  Evaluation: "#ef4444",
  Awarded: "#22c55e",
};

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

function relTime(dt: string): string {
  const diff = Date.now() - new Date(dt).getTime();
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 1) return "< 1h ago";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {label}
    </span>
  );
}

function SummaryBox({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string | number;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        background: "var(--color-surface, #18181b)",
        borderRadius: 10,
        border: "1px solid var(--color-border, #27272a)",
        textAlign: "center",
        minWidth: 100,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--color-text-muted, #9ca3af)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--color-text, #e4e4e7)" }}>{value}</div>
    </div>
  );
}

export default function GovWin() {
  const [tab, setTab] = useState<Tab>("opportunities");
  const [summary, setSummary] = useState<GovWinSummaryData | null>(null);
  const [opps, setOpps] = useState<GovWinOpportunityRow[]>([]);
  const [syncs, setSyncs] = useState<GovWinSyncRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("relevance");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchGovWinSummary().then((r) => {
        if (r.data) setSummary(r.data);
      }),
      fetchGovWinOpportunities({ sort: sortBy }).then((r) => {
        if (r.data) setOpps(r.data);
      }),
      fetchGovWinSyncs().then((r) => {
        if (r.data) setSyncs(r.data);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  function handleSync() {
    setSyncing(true);
    triggerGovWinSync()
      .then(() => {
        fetchGovWinSyncs().then((r) => {
          if (r.data) setSyncs(r.data);
        });
      })
      .finally(() => setSyncing(false));
  }

  function handlePromote(id: string) {
    promoteGovWinOpportunity(id).then((r) => {
      if (r.data) {
        alert(`Promoted to Ops Tracker as ${r.data.new_opportunity_id}`);
      }
    });
  }

  const filtered = opps.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        o.title.toLowerCase().includes(q) ||
        o.agency.toLowerCase().includes(q) ||
        o.naics.includes(q) ||
        o.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const sel = filtered.find((o) => o.id === selectedId) ?? null;

  if (loading)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted, #9ca3af)" }}>
        Loading GovWin IQ...
      </div>
    );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{"\u{1F310}"} GovWin IQ Integration</h2>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            background: syncing ? "#27272a" : "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: syncing ? "not-allowed" : "pointer",
          }}
        >
          {syncing ? "Syncing\u2026" : "\u{26A1} Sync Now"}
        </button>
      </div>

      {/* Summary Strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryBox label="Total" value={summary.total} />
          <SummaryBox
            label="New"
            value={summary.new_count}
            color="#3b82f6"
            onClick={() => setStatusFilter(statusFilter === "new" ? null : "new")}
          />
          <SummaryBox
            label="Tracking"
            value={summary.tracking_count}
            color="#d97706"
            onClick={() => setStatusFilter(statusFilter === "tracking" ? null : "tracking")}
          />
          <SummaryBox
            label="Qualified"
            value={summary.qualified_count}
            color="#16a34a"
            onClick={() => setStatusFilter(statusFilter === "qualified" ? null : "qualified")}
          />
          <SummaryBox
            label="Dismissed"
            value={summary.dismissed_count}
            color="#6b7280"
            onClick={() => setStatusFilter(statusFilter === "dismissed" ? null : "dismissed")}
          />
          <SummaryBox label="Avg Relevance" value={`${summary.avg_relevance}%`} color="#8b5cf6" />
          <SummaryBox label="Pipeline Value" value={fmt$(summary.total_pipeline_value)} color="#0ea5e9" />
          <SummaryBox label="Last Sync" value={summary.last_sync ? relTime(summary.last_sync) : "Never"} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--color-border, #27272a)" }}>
        {(["opportunities", "syncs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
              color: tab === t ? "#3b82f6" : "var(--color-text-muted, #9ca3af)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t === "opportunities" ? `Opportunities (${filtered.length})` : `Sync History (${syncs.length})`}
          </button>
        ))}
      </div>

      {/* Opportunities Tab */}
      {tab === "opportunities" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Search opportunities, agencies, NAICS\u2026"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "8px 12px",
                background: "var(--color-surface, #18181b)",
                color: "var(--color-text, #e4e4e7)",
                border: "1px solid var(--color-border, #27272a)",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "var(--color-surface, #18181b)",
                color: "var(--color-text, #e4e4e7)",
                border: "1px solid var(--color-border, #27272a)",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="value">Sort: Value</option>
              <option value="date">Sort: Recent</option>
            </select>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                style={{
                  background: `${STATUS_COLORS[statusFilter]}18`,
                  color: STATUS_COLORS[statusFilter],
                  border: `1px solid ${STATUS_COLORS[statusFilter]}40`,
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {statusFilter} \u2715
              </button>
            )}
          </div>

          {/* List + Detail */}
          <div style={{ display: "flex", gap: 16 }}>
            {/* List */}
            <div style={{ flex: sel ? "0 0 45%" : "1 1 auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((o) => (
                <div
                  key={o.id}
                  onClick={() => setSelectedId(selectedId === o.id ? null : o.id)}
                  style={{
                    background: selectedId === o.id ? "var(--color-surface, #18181b)" : "transparent",
                    border: `1px solid ${selectedId === o.id ? "#3b82f6" : "var(--color-border, #27272a)"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text, #e4e4e7)", marginBottom: 2 }}>{o.title}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted, #9ca3af)" }}>{o.agency}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      <Pill label={o.status} color={STATUS_COLORS[o.status] ?? "#6b7280"} />
                      <Pill label={o.stage} color={STAGE_COLORS[o.stage] ?? "#6b7280"} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted, #9ca3af)" }}>
                    <span>
                      {"\u{1F4B0}"}{" "}
                      {o.value_low && o.value_high ? `${fmt$(o.value_low)}\u2013${fmt$(o.value_high)}` : "TBD"}
                    </span>
                    <span>{"\u{1F3AF}"} {o.relevance_score}% match</span>
                    <span>NAICS {o.naics}</span>
                    {o.set_aside && <span>{"\u{1F3F7}"} {o.set_aside}</span>}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ color: "var(--color-text-muted, #9ca3af)", textAlign: "center", padding: 30 }}>
                  No opportunities match your filters
                </div>
              )}
            </div>

            {/* Detail Panel */}
            {sel && (
              <div
                style={{
                  flex: "0 0 55%",
                  background: "var(--color-surface, #18181b)",
                  border: "1px solid var(--color-border, #27272a)",
                  borderRadius: 10,
                  padding: 20,
                  maxHeight: "75vh",
                  overflow: "auto",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text, #e4e4e7)" }}>{sel.title}</h3>
                  <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer" }}>
                    {"\u2715"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <Pill label={sel.status} color={STATUS_COLORS[sel.status] ?? "#6b7280"} />
                  <Pill label={sel.stage} color={STAGE_COLORS[sel.stage] ?? "#6b7280"} />
                  <Pill label={sel.procurement_type} color="#0ea5e9" />
                </div>

                {/* AI Summary */}
                <div style={{ background: "#1e1e22", borderRadius: 8, padding: 14, marginBottom: 16, border: "1px solid #27272a" }}>
                  <div style={{ fontSize: 11, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{"\u{1F916}"} AI Assessment</div>
                  <p style={{ color: "#d4d4d8", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{sel.ai_summary}</p>
                </div>

                {/* Key Info Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <InfoItem label="Agency" value={sel.agency} />
                  <InfoItem label="Sub-Agency" value={sel.sub_agency} />
                  <InfoItem label="Value Range" value={sel.value_low && sel.value_high ? `${fmt$(sel.value_low)} \u2013 ${fmt$(sel.value_high)}` : "TBD"} />
                  <InfoItem label="Relevance" value={`${sel.relevance_score}%`} color={sel.relevance_score >= 80 ? "#22c55e" : sel.relevance_score >= 60 ? "#f59e0b" : "#ef4444"} />
                  <InfoItem label="NAICS" value={sel.naics} />
                  <InfoItem label="Set-Aside" value={sel.set_aside ?? "Unrestricted"} />
                  <InfoItem label="Expected Release" value={sel.expected_release ?? "TBD"} />
                  <InfoItem label="Expected Award" value={sel.expected_award ?? "TBD"} />
                  <InfoItem label="Place of Performance" value={sel.place_of_performance} />
                  <InfoItem label="GovWin ID" value={sel.govwin_id} />
                </div>

                {/* Incumbents */}
                {sel.incumbents.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Incumbents</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {sel.incumbents.map((inc) => (
                        <span key={inc} style={{ background: "#ef444422", color: "#fca5a5", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{inc}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Competitors */}
                {sel.competitors.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Known Competitors</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {sel.competitors.map((comp) => (
                        <span key={comp} style={{ background: "#f59e0b22", color: "#fcd34d", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{comp}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Contacts */}
                {sel.key_contacts.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Key Contacts</div>
                    {sel.key_contacts.map((c, i) => (
                      <div key={i} style={{ background: "#1e1e22", borderRadius: 6, padding: "8px 12px", marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.title} \u2014 {c.agency}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {sel.tags.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tags</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {sel.tags.map((t) => (
                        <span key={t} style={{ background: "#27272a", color: "#d4d4d8", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, borderTop: "1px solid #27272a", paddingTop: 14 }}>
                  <button
                    onClick={() => handlePromote(sel.id)}
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {"\u{1F680}"} Promote to Ops Tracker
                  </button>
                  <a
                    href={sel.govwin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: "#27272a",
                      color: "#d4d4d8",
                      border: "1px solid #3f3f46",
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 13,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {"\u{1F517}"} View in GovWin
                  </a>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Syncs Tab */}
      {tab === "syncs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {syncs.map((s) => (
            <div
              key={s.id}
              style={{
                background: "var(--color-surface, #18181b)",
                border: "1px solid var(--color-border, #27272a)",
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text, #e4e4e7)" }}>
                  {new Date(s.started_at).toLocaleString()}
                </div>
                {s.error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{s.error}</div>}
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12, color: "var(--color-text-muted, #9ca3af)" }}>
                <span>{s.opportunities_synced} synced</span>
                <span>{s.new_matches} new</span>
                <Pill
                  label={s.status}
                  color={s.status === "completed" ? "#22c55e" : s.status === "running" ? "#3b82f6" : "#ef4444"}
                />
              </div>
            </div>
          ))}
          {syncs.length === 0 && (
            <div style={{ color: "var(--color-text-muted, #9ca3af)", textAlign: "center", padding: 30 }}>No sync history</div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: color ?? "#d4d4d8", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
