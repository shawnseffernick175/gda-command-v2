import { useEffect, useState } from "react";
import InfoBadge from "../components/InfoBadge";
import SourceBadge from "../components/SourceBadge";
import { authenticatedFetch } from "../api/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskEntry {
  id: string;
  opportunity_id: string | null;
  opportunity_title: string | null;
  category: string;
  if_statement: string;
  then_statement: string;
  likelihood: "critical" | "high" | "medium" | "low";
  impact: "critical" | "high" | "medium" | "low";
  risk_score: number;
  status: string;
  mitigation_plan: string;
  mitigation_owner: string;
  trigger_indicators: string[];
  contingency_plan: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  data_source: string | null;
}

interface RiskListData {
  risks: RiskEntry[];
  total: number;
  critical: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byLikelihood: Record<string, number>;
  byImpact: Record<string, number>;
  source: string;
}

interface GDAEnvelope<T> {
  success: boolean;
  data: T | null;
}

interface EvalMatch {
  risk_id: string;
  if_statement: string;
  then_statement: string;
  risk_score: number;
  status: string;
  mitigation_plan: string;
}

interface EvalResult {
  if_statement: string;
  matches: EvalMatch[];
  total_matches: number;
  recommendation: string;
  dry_run: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskColor(level: string): string {
  if (level === "critical") return "#991b1b";
  if (level === "high") return "#ef4444";
  if (level === "medium") return "#f59e0b";
  if (level === "low") return "#10b981";
  return "#6b7280";
}

function scoreColor(score: number): string {
  if (score >= 15) return "#ef4444";
  if (score >= 9) return "#f59e0b";
  if (score >= 5) return "#3b82f6";
  return "#10b981";
}

function statusColor(s: string): string {
  const colors: Record<string, string> = {
    open: "#f59e0b",
    mitigating: "#3b82f6",
    accepted: "#8b5cf6",
    closed: "#10b981",
    realized: "#ef4444",
  };
  return colors[s] ?? "#6b7280";
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    technical: "Technical",
    programmatic: "Programmatic",
    cost: "Cost",
    schedule: "Schedule",
    competitive: "Competitive",
    regulatory: "Regulatory",
    teaming: "Teaming",
    past_performance: "Past Performance",
  };
  return labels[cat] ?? cat;
}

function formatDate(iso: string): string {
  const safe = iso.length === 10 ? `${iso}T12:00:00` : iso;
  return new Date(safe).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TabKey = "all" | "open" | "critical" | "matrix";

export default function RiskRegister() {
  const [data, setData] = useState<RiskListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [evalInput, setEvalInput] = useState("");
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await authenticatedFetch("/api/risk-register");
        const env: GDAEnvelope<RiskListData> = await r.json();
        if (env.data) setData(env.data);
        else setError("No data returned");
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function runEval() {
    if (!evalInput.trim()) return;
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const r = await authenticatedFetch("/api/risk-register/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ if_statement: evalInput, dry_run: true }),
      });
      const env: GDAEnvelope<EvalResult> = await r.json();
      if (env.data) setEvalResult(env.data);
    } catch {
      // ignore
    } finally {
      setEvalLoading(false);
    }
  }

  if (loading) return <div style={{ padding: 32, color: "var(--color-text-muted)" }}>Loading risk register...</div>;
  if (error) return <div style={{ padding: 32, color: "#ef4444" }}>Error: {error}</div>;
  if (!data) return null;

  // Filtering
  let filtered = data.risks;
  if (tab === "open") filtered = filtered.filter((r) => r.status === "open" || r.status === "mitigating");
  if (tab === "critical") filtered = filtered.filter((r) => r.risk_score >= 15 && r.status !== "closed");
  if (categoryFilter) filtered = filtered.filter((r) => r.category === categoryFilter);
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.if_statement.toLowerCase().includes(q) ||
        r.then_statement.toLowerCase().includes(q) ||
        (r.opportunity_title ?? "").toLowerCase().includes(q) ||
        r.mitigation_owner.toLowerCase().includes(q),
    );
  }

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "All Risks", count: data.total },
    { key: "open", label: "Active", count: (data.byStatus["open"] ?? 0) + (data.byStatus["mitigating"] ?? 0) },
    { key: "critical", label: "Critical", count: data.critical },
    { key: "matrix", label: "Risk Matrix", count: 0 },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Risk Register</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            If-This-Then-That risk tracking across your portfolio
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Risks" value={data.total} info={{ whatItIs: "Total number of risks in the register.", whatItMeans: "Complete inventory of identified risks across all opportunities." }} />
        <KpiCard label="Critical" value={data.critical} color="#ef4444" info={{ whatItIs: "Risks with a score of 15+ that are not closed.", whatItMeans: "Highest priority risks requiring immediate attention." }} />
        <KpiCard label="Open" value={data.byStatus["open"] ?? 0} color="#f59e0b" info={{ whatItIs: "Risks identified but not yet being actively mitigated.", whatItMeans: "These risks need mitigation plans assigned." }} />
        <KpiCard label="Mitigating" value={data.byStatus["mitigating"] ?? 0} color="#3b82f6" info={{ whatItIs: "Risks with active mitigation underway.", whatItMeans: "Mitigation plans are being executed." }} />
        <KpiCard label="Accepted" value={data.byStatus["accepted"] ?? 0} color="#8b5cf6" info={{ whatItIs: "Risks acknowledged and accepted without active mitigation.", whatItMeans: "Risk exposure is deemed acceptable or unavoidable." }} />
        <KpiCard label="Closed" value={data.byStatus["closed"] ?? 0} color="#10b981" info={{ whatItIs: "Risks that have been resolved or are no longer applicable.", whatItMeans: "Successfully mitigated or risk conditions changed." }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)", marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? "var(--color-primary)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {t.label}
            {t.key !== "matrix" && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "matrix" ? (
        <RiskMatrix risks={data.risks} />
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              placeholder="Search risks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 13,
                minWidth: 200,
              }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 13,
              }}
            >
              <option value="">All Categories</option>
              {Object.entries(data.byCategory).map(([k, v]) => (
                <option key={k} value={k}>{categoryLabel(k)} ({v})</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 13,
              }}
            >
              <option value="">All Statuses</option>
              {Object.entries(data.byStatus).map(([k, v]) => (
                <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)} ({v})</option>
              ))}
            </select>
          </div>

          {/* If-This-Then-That evaluator */}
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              If-This-Then-That Evaluator
              <InfoBadge
                size={14}
                whatItIs="Test a scenario against existing risks."
                whatItMeans="Enter an 'if' condition and see which existing risks match. Helps identify overlapping or related risks."
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="IF: Describe a scenario..."
                value={evalInput}
                onChange={(e) => setEvalInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runEval()}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
              />
              <button
                onClick={runEval}
                disabled={evalLoading || !evalInput.trim()}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: evalLoading ? "wait" : "pointer",
                  opacity: !evalInput.trim() ? 0.5 : 1,
                }}
              >
                {evalLoading ? "Evaluating..." : "Evaluate"}
              </button>
            </div>

            {evalResult && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  {evalResult.recommendation}
                </div>
                {evalResult.matches.map((m) => (
                  <div
                    key={m.risk_id}
                    style={{
                      padding: "10px 14px",
                      background: "var(--color-bg)",
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{m.risk_id}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(m.risk_score) }}>
                        Score: {m.risk_score}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 2 }}>
                      <strong>IF:</strong> {m.if_statement}
                    </div>
                    <div style={{ fontSize: 12, color: "#f59e0b" }}>
                      <strong>THEN:</strong> {m.then_statement}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risk list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
                No risks match current filters.
              </div>
            ) : (
              filtered.map((risk) => (
                <RiskCard
                  key={risk.id}
                  risk={risk}
                  expanded={expanded === risk.id}
                  onToggle={() => setExpanded(expanded === risk.id ? null : risk.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Card
// ---------------------------------------------------------------------------

function RiskCard({ risk, expanded, onToggle }: { risk: RiskEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        borderLeft: `4px solid ${scoreColor(risk.risk_score)}`,
        overflow: "hidden",
      }}
    >
      {/* Header row — always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: "14px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        {/* Score badge */}
        <div
          style={{
            minWidth: 40,
            height: 40,
            borderRadius: 8,
            background: scoreColor(risk.risk_score),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 16,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {risk.risk_score}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)" }}>{risk.id}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: `${statusColor(risk.status)}22`,
                color: statusColor(risk.status),
                textTransform: "uppercase",
              }}
            >
              {risk.status}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "rgba(107,114,128,0.15)",
                color: "#9ca3af",
                textTransform: "uppercase",
              }}
            >
              {categoryLabel(risk.category)}
            </span>
            <SourceBadge source={risk.data_source} />
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            <span style={{ color: "#3b82f6", fontWeight: 600 }}>IF</span>{" "}
            {risk.if_statement}
          </div>
          <div style={{ fontSize: 13, color: "#f59e0b" }}>
            <span style={{ fontWeight: 600 }}>THEN</span>{" "}
            {risk.then_statement}
          </div>
        </div>

        {/* Right side info */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", marginBottom: 4 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Likelihood</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: riskColor(risk.likelihood) }}>{risk.likelihood}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Impact</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: riskColor(risk.impact) }}>{risk.impact}</div>
            </div>
          </div>
          {risk.due_date && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Due: {formatDate(risk.due_date)}</div>
          )}
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{risk.mitigation_owner}</div>
        </div>

        <span style={{ fontSize: 14, color: "var(--color-text-muted)", marginLeft: 4 }}>
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-border)" }}>
          {risk.opportunity_title && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 12, marginBottom: 8 }}>
              Opportunity: <span style={{ color: "var(--color-text)", fontWeight: 500 }}>{risk.opportunity_title}</span>
            </div>
          )}

          {/* Mitigation plan */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", marginBottom: 6 }}>Mitigation Plan</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, padding: "10px 14px", background: "var(--color-bg)", borderRadius: 6, border: "1px solid var(--color-border)" }}>
              {risk.mitigation_plan}
            </div>
          </div>

          {/* Trigger indicators */}
          {risk.trigger_indicators.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", marginBottom: 6 }}>
                Trigger Indicators
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {risk.trigger_indicators.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 12,
                      padding: "6px 12px",
                      background: "rgba(245,158,11,0.08)",
                      borderRadius: 4,
                      borderLeft: "3px solid #f59e0b",
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contingency plan */}
          {risk.contingency_plan && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#8b5cf6", marginBottom: 6 }}>Contingency Plan</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, padding: "10px 14px", background: "var(--color-bg)", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                {risk.contingency_plan}
              </div>
            </div>
          )}

          {/* Meta */}
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "var(--color-text-muted)" }}>
            <span>Created: {formatDate(risk.created_at)}</span>
            <span>Updated: {formatDate(risk.updated_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Matrix (5x5 heat map)
// ---------------------------------------------------------------------------

function RiskMatrix({ risks }: { risks: RiskEntry[] }) {
  const likelihoodLevels = ["critical", "high", "medium", "low"] as const;
  const impactLevels = ["low", "medium", "high", "critical"] as const;
  const activeRisks = risks.filter((r) => r.status !== "closed");

  function cellRisks(likelihood: string, impact: string) {
    return activeRisks.filter((r) => r.likelihood === likelihood && r.impact === impact);
  }

  function riskScore(likelihood: string, impact: string): number {
    const lMap: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const iMap: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (lMap[likelihood] ?? 1) * (iMap[impact] ?? 1);
  }

  function cellGradient(likelihood: string, impact: string): string {
    const score = riskScore(likelihood, impact);
    if (score >= 12) return "linear-gradient(135deg, rgba(239,68,68,0.35), rgba(220,38,38,0.20))";
    if (score >= 8) return "linear-gradient(135deg, rgba(245,158,11,0.30), rgba(234,88,12,0.18))";
    if (score >= 4) return "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(99,102,241,0.12))";
    return "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.08))";
  }

  function cellBorderColor(likelihood: string, impact: string): string {
    const score = riskScore(likelihood, impact);
    if (score >= 12) return "rgba(239,68,68,0.4)";
    if (score >= 8) return "rgba(245,158,11,0.35)";
    if (score >= 4) return "rgba(59,130,246,0.25)";
    return "rgba(16,185,129,0.2)";
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Risk Heat Map</span>
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{activeRisks.length} active risks</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr", gap: 3, position: "relative" }}>
        {/* Impact header */}
        <div style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--color-text-muted)", paddingBottom: 4 }}>
          Impact →
        </div>
        <div />
        {impactLevels.map((imp) => (
          <div key={imp} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: riskColor(imp), padding: "6px 0" }}>
            {imp}
          </div>
        ))}

        {/* Matrix rows */}
        {likelihoodLevels.map((lik) => (
          <div key={lik} style={{ display: "contents" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
              color: riskColor(lik), writingMode: "vertical-lr" as const, transform: "rotate(180deg)",
            }}>
              {lik}
            </div>
            {impactLevels.map((imp) => {
              const cell = cellRisks(lik, imp);
              const score = riskScore(lik, imp);
              return (
                <div
                  key={`${lik}-${imp}`}
                  style={{
                    background: cellGradient(lik, imp),
                    borderRadius: 8,
                    padding: 10,
                    minHeight: 72,
                    border: `1px solid ${cellBorderColor(lik, imp)}`,
                    position: "relative",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1.03)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  {/* Score badge */}
                  <div style={{
                    position: "absolute", top: 4, right: 4,
                    fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", opacity: 0.5,
                  }}>
                    {score}
                  </div>
                  {cell.length === 0 ? (
                    <div style={{ fontSize: 18, color: "var(--color-text-muted)", textAlign: "center", marginTop: 16, opacity: 0.3 }}>-</div>
                  ) : (
                    <>
                      {cell.length > 0 && (
                        <div style={{
                          fontSize: 20, fontWeight: 800, textAlign: "center",
                          color: score >= 12 ? "#ef4444" : score >= 8 ? "#f59e0b" : score >= 4 ? "#3b82f6" : "#10b981",
                          marginBottom: 4,
                        }}>
                          {cell.length}
                        </div>
                      )}
                      {cell.slice(0, 2).map((r) => (
                        <div
                          key={r.id}
                          style={{
                            fontSize: 10,
                            padding: "3px 6px",
                            background: "rgba(0,0,0,0.15)",
                            borderRadius: 4,
                            marginBottom: 3,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            backdropFilter: "blur(4px)",
                          }}
                          title={`${r.id}: ${r.if_statement} → ${r.then_statement}`}
                        >
                          <span style={{ fontWeight: 700 }}>{r.id}</span>
                        </div>
                      ))}
                      {cell.length > 2 && (
                        <div style={{ fontSize: 9, color: "var(--color-text-muted)", textAlign: "center" }}>
                          +{cell.length - 2} more
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Likelihood axis label */}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--color-text-muted)", marginTop: 8, textAlign: "center" }}>
        ↑ Likelihood
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 11, color: "var(--color-text-muted)", justifyContent: "center" }}>
        {[
          { label: "Critical", bg: "linear-gradient(135deg, rgba(239,68,68,0.35), rgba(220,38,38,0.20))", range: "12-16" },
          { label: "High", bg: "linear-gradient(135deg, rgba(245,158,11,0.30), rgba(234,88,12,0.18))", range: "8-11" },
          { label: "Medium", bg: "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(99,102,241,0.12))", range: "4-7" },
          { label: "Low", bg: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.08))", range: "1-3" },
        ].map((item) => (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: item.bg, border: "1px solid rgba(255,255,255,0.1)" }} />
            {item.label} ({item.range})
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  color,
  info,
}: {
  label: string;
  value: number;
  color?: string;
  info?: { whatItIs: string; whatItMeans: string };
}) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        padding: "14px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {label}
        {info && <InfoBadge size={14} {...info} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}
