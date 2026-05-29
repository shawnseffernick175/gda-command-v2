import { useEffect, useState } from "react";
import { authenticatedFetch } from "../api/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIStatus {
  available: boolean;
  models: { fast: boolean; deep: boolean };
  fast_model: string | null;
  deep_model: string | null;
}

interface UsageByAction {
  action: string;
  count: string;
  tokens: string;
  avg_latency_ms: string;
}

interface UsageByModel {
  model_tier: string;
  count: string;
  tokens: string;
}

interface RecentUsage {
  id: string;
  action: string;
  model_tier: string;
  total_tokens: number;
  latency_ms: number;
  status: string;
  created_at: string;
}

interface UsageData {
  total_calls: number;
  total_tokens: number;
  by_action: UsageByAction[];
  by_model: UsageByModel[];
  recent: RecentUsage[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AIGateway() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  // Summarizer state
  const [summarizeText, setSummarizeText] = useState("");
  const [summarizeResult, setSummarizeResult] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      authenticatedFetch("/api/ai-gateway/status")
        .then((r) => r.json())
        .then((env: { success: boolean; data: AIStatus | null }) => {
          if (env.success && env.data) setStatus(env.data);
        }),
      authenticatedFetch("/api/ai-gateway/usage")
        .then((r) => r.json())
        .then((env: { success: boolean; data: UsageData | null }) => {
          if (env.success && env.data) setUsage(env.data);
        }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSummarize = async () => {
    if (!summarizeText.trim()) return;
    setSummarizing(true);
    setSummarizeResult(null);
    try {
      const resp = await authenticatedFetch("/api/ai-gateway/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summarizeText }),
      });
      const env = await resp.json();
      if (env.success && env.data) {
        setSummarizeResult(env.data.summary);
      } else {
        setSummarizeResult(env.error?.message ?? "Failed to summarize.");
      }
    } catch {
      setSummarizeResult("Error connecting to AI service.");
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.pageTitle}>AI Gateway</h1>
        <p style={{ color: "#94a3b8" }}>Loading AI status...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>AI Gateway</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24, fontSize: 14 }}>
        LLM service management — model status, text summarizer, and usage analytics.
      </p>

      {/* Model Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Status</div>
          <div style={{ ...styles.kpiValue, fontSize: 18, color: status?.available ? "#22c55e" : "#ef4444" }}>
            {status?.available ? "Online" : "Offline"}
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Fast Model</div>
          <div style={{ ...styles.kpiValue, fontSize: 14, color: status?.models.fast ? "#22c55e" : "#6b7280" }}>
            {status?.fast_model ?? "Not configured"}
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Deep Model</div>
          <div style={{ ...styles.kpiValue, fontSize: 14, color: status?.models.deep ? "#22c55e" : "#6b7280" }}>
            {status?.deep_model ?? "Not configured"}
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total API Calls</div>
          <div style={styles.kpiValue}>{usage?.total_calls ?? 0}</div>
        </div>
      </div>

      {/* Summarizer */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Text Summarizer</h2>
        <textarea
          value={summarizeText}
          onChange={(e) => setSummarizeText(e.target.value)}
          placeholder="Paste opportunity description, SOW, or any text to summarize..."
          style={styles.textarea}
          rows={5}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={handleSummarize}
            disabled={summarizing || !summarizeText.trim() || !status?.available}
            style={{
              ...styles.btn,
              opacity: summarizing || !summarizeText.trim() || !status?.available ? 0.5 : 1,
            }}
          >
            {summarizing ? "Summarizing..." : "Summarize"}
          </button>
        </div>
        {summarizeResult && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 6, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", fontSize: 13, lineHeight: 1.6 }}>
            {summarizeResult}
          </div>
        )}
      </div>

      {/* Usage by Action */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Usage by Action</h2>
        {!usage || usage.by_action.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>No AI usage recorded yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Calls</th>
                <th style={styles.th}>Tokens</th>
                <th style={styles.th}>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {usage.by_action.map((row) => (
                <tr key={row.action}>
                  <td style={{ ...styles.td, fontWeight: 600, textTransform: "capitalize" }}>{row.action.replace(/-/g, " ")}</td>
                  <td style={styles.td}>{row.count}</td>
                  <td style={styles.td}>{Number(row.tokens).toLocaleString()}</td>
                  <td style={styles.td}>{row.avg_latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Usage by Model */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Usage by Model</h2>
        {!usage || usage.by_model.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>No AI usage recorded yet.</p>
        ) : (
          <div style={{ display: "flex", gap: 16 }}>
            {usage.by_model.map((row) => (
              <div key={row.model_tier} style={{ ...styles.kpiCard, flex: 1 }}>
                <div style={styles.kpiLabel}>{row.model_tier === "fast" ? "GPT-4o (Fast)" : "Claude (Deep)"}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>{row.count} calls</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{Number(row.tokens).toLocaleString()} tokens</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Activity</h2>
        {!usage || usage.recent.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>No recent AI activity.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Model</th>
                <th style={styles.th}>Tokens</th>
                <th style={styles.th}>Latency</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {usage.recent.map((row) => (
                <tr key={row.id}>
                  <td style={{ ...styles.td, textTransform: "capitalize" }}>{row.action.replace(/-/g, " ")}</td>
                  <td style={styles.td}>{row.model_tier}</td>
                  <td style={styles.td}>{row.total_tokens}</td>
                  <td style={styles.td}>{row.latency_ms}ms</td>
                  <td style={styles.td}>
                    <span style={{ color: row.status === "success" ? "#22c55e" : "#ef4444" }}>{row.status}</span>
                  </td>
                  <td style={styles.td}>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 24,
    color: "#e2e8f0",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 4,
  },
  section: {
    marginBottom: 28,
    padding: 20,
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
  },
  kpiCard: {
    padding: "16px 20px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    textAlign: "center" as const,
  },
  kpiLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#e2e8f0",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    textAlign: "left" as const,
    color: "#64748b",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "top" as const,
  },
  textarea: {
    width: "100%",
    padding: 12,
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    color: "#e2e8f0",
    fontSize: 13,
    fontFamily: "inherit",
    resize: "vertical" as const,
    outline: "none",
  },
  btn: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    background: "#01696F",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
};
