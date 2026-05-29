import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  fetchPrompts,
  fetchPromptDetail,
  type PromptRow,
  type PromptsSummary,
  type PromptDetailData,
  type PromptQueryParams,
} from "../api/client";
import { authenticatedFetch } from "../api/auth";

const CATEGORY_COLORS: Record<string, string> = {
  capture: "#f59e0b",
  compliance: "#ef4444",
  proposal: "#8b5cf6",
  research: "#3b82f6",
  analysis: "#22c55e",
  general: "#6b7280",
};

const OUTCOME_COLORS: Record<string, string> = {
  success: "#22c55e",
  partial: "#f59e0b",
  failed: "#ef4444",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
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

export default function PromptArchitect() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [summary, setSummary] = useState<PromptsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"body" | "versions" | "usage">("body");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newDescription, setNewDescription] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreatePrompt() {
    if (!newName.trim() || !newTemplate.trim()) return;
    setCreating(true);
    try {
      const resp = await authenticatedFetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, category: newCategory, description: newDescription, template: newTemplate }),
      });
      if (resp.ok) {
        setShowCreateForm(false);
        setNewName(""); setNewCategory("general"); setNewDescription(""); setNewTemplate("");
        loadPrompts();
      }
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  const loadPrompts = useCallback((params: PromptQueryParams = {}) => {
    setLoading(true);
    setError(null);
    fetchPrompts(params)
      .then((env) => {
        if (env.success && env.data) {
          setPrompts(env.data.prompts);
          setSummary(env.data.summary);
        } else {
          setError(env.error?.message ?? "Failed to load prompts");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPrompts({ search, category, status });
    }, 200);
    return () => clearTimeout(timer);
  }, [search, category, status, loadPrompts]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let stale = false;
    setDetailLoading(true);
    setDetailTab("body");
    fetchPromptDetail(selectedId)
      .then((env) => {
        if (stale) return;
        if (env.success && env.data) setDetail(env.data);
      })
      .catch(() => {})
      .finally(() => { if (!stale) setDetailLoading(false); });
    return () => { stale = true; };
  }, [selectedId]);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
        <Link to="/" style={{ color: "var(--color-primary)" }}>Launchpad</Link>
        {" / "}
        <span>Prompt Architect</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Prompt Architect
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24, fontSize: 14 }}>
        Versioned, tagged prompt library for repeatable AI-assisted operations.
        Stored and searchable — not lost in a chat window.
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
          Live DB
        </span>
      </div>

      {/* Summary strip */}
      {summary && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}>
          <SummaryCard label="Total" value={summary.total} />
          <SummaryCard label="Active" value={summary.active} color="#22c55e" />
          <SummaryCard label="Draft" value={summary.draft} color="#f59e0b" />
          <SummaryCard label="Archived" value={summary.archived} color="#6b7280" />
          <SummaryCard label="Starred" value={summary.starred} color="#eab308" />
          <SummaryCard label="Categories" value={summary.categories.length} color="#8b5cf6" />
        </div>
      )}

      {/* Filter bar */}
      <div style={{
        display: "flex",
        gap: 12,
        marginBottom: 20,
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        <input
          type="text"
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            width: 220,
          }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All categories</option>
          {summary?.categories.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        {(search || category || status) && (
          <button
            onClick={() => { setSearch(""); setCategory(""); setStatus(""); }}
            style={{
              padding: "8px 14px",
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
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          + New Prompt
        </button>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Showing {prompts.length} of {summary?.total ?? 0}
        </span>
      </div>

      {/* Create Prompt Form */}
      {showCreateForm && (
        <div style={{
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: 10, padding: 20, marginBottom: 20,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>New Prompt</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Name *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Opportunity Summarizer"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}>
                <option value="general">General</option>
                <option value="capture">Capture</option>
                <option value="compliance">Compliance</option>
                <option value="proposal">Proposal</option>
                <option value="research">Research</option>
                <option value="analysis">Analysis</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Description</label>
            <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief description of this prompt's purpose"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Template *</label>
            <textarea value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)}
              placeholder="Enter prompt template text. Use {{variable}} for placeholders."
              rows={6}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13,  resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreatePrompt} disabled={creating || !newName.trim() || !newTemplate.trim()}
              style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#22c55e", color: "#fff", fontWeight: 600, fontSize: 13, cursor: creating ? "not-allowed" : "pointer" }}>
              {creating ? "Creating..." : "Create Prompt"}
            </button>
            <button onClick={() => setShowCreateForm(false)}
              style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ color: "var(--color-text-muted)", padding: 24 }}>Loading prompts...</div>
      )}

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid #ef4444",
          borderRadius: 8,
          padding: 16,
          color: "#ef4444",
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", gap: 20 }}>
          {/* Prompt list */}
          <div style={{ flex: selectedId ? "0 0 420px" : 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {prompts.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                style={{
                  background: selectedId === p.id ? "rgba(59,130,246,0.08)" : "var(--color-surface)",
                  border: selectedId === p.id ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {p.starred && <span style={{ color: "#eab308", fontSize: 14 }}>&#9733;</span>}
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{p.title}</span>
                  <span style={{
                    marginLeft: "auto",
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: `${CATEGORY_COLORS[p.category] ?? "#6b7280"}20`,
                    color: CATEGORY_COLORS[p.category] ?? "#6b7280",
                  }}>
                    {p.category}
                  </span>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 500,
                    background: p.status === "active" ? "rgba(34,197,94,0.15)" : p.status === "draft" ? "rgba(245,158,11,0.15)" : "rgba(107,114,128,0.15)",
                    color: p.status === "active" ? "#22c55e" : p.status === "draft" ? "#f59e0b" : "#6b7280",
                  }}>
                    {p.status}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px", lineHeight: 1.4 }}>
                  {p.description}
                </p>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--color-text-muted)" }}>
                  <span>v{p.version}</span>
                  <span>{p.usageCount} uses</span>
                  <span>Updated {formatDate(p.updatedAt)}</span>
                  <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {p.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "rgba(99,102,241,0.1)",
                        color: "#6366f1",
                        fontSize: 10,
                      }}>
                        {t}
                      </span>
                    ))}
                    {p.tags.length > 4 && (
                      <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>+{p.tags.length - 4}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {prompts.length === 0 && !loading && (
              <div style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 32,
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}>
                No prompts match your filters.
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedId && (
            <div style={{
              flex: 1,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 20,
              minWidth: 0,
              overflow: "auto",
            }}>
              {detailLoading && (
                <div style={{ color: "var(--color-text-muted)", padding: 16 }}>Loading detail...</div>
              )}
              {detail && detail.prompt.id === selectedId && !detailLoading && (
                <PromptDetail
                  data={detail}
                  activeTab={detailTab}
                  onTabChange={setDetailTab}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      padding: "12px 14px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 500, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function PromptDetail({
  data,
  activeTab,
  onTabChange,
  onClose,
}: {
  data: PromptDetailData;
  activeTab: "body" | "versions" | "usage";
  onTabChange: (tab: "body" | "versions" | "usage") => void;
  onClose: () => void;
}) {
  const { prompt, versions, usage } = data;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {prompt.starred && <span style={{ color: "#eab308", fontSize: 18 }}>&#9733;</span>}
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{prompt.title}</h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px", lineHeight: 1.4 }}>
            {prompt.description}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background: `${CATEGORY_COLORS[prompt.category] ?? "#6b7280"}20`,
              color: CATEGORY_COLORS[prompt.category] ?? "#6b7280",
            }}>
              {prompt.category}
            </span>
            <span style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background: prompt.status === "active" ? "rgba(34,197,94,0.15)" : prompt.status === "draft" ? "rgba(245,158,11,0.15)" : "rgba(107,114,128,0.15)",
              color: prompt.status === "active" ? "#22c55e" : prompt.status === "draft" ? "#f59e0b" : "#6b7280",
            }}>
              {prompt.status}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", alignSelf: "center" }}>
              v{prompt.version} &middot; {prompt.usageCount} uses &middot; By {prompt.createdBy}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            fontSize: 16,
          }}
        >
          &times;
        </button>
      </div>

      {/* Tags */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {prompt.tags.map((t) => (
          <span key={t} style={{
            padding: "3px 8px",
            borderRadius: 6,
            background: "rgba(99,102,241,0.1)",
            color: "#6366f1",
            fontSize: 12,
          }}>
            {t}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 16,
        borderBottom: "1px solid var(--color-border)",
        paddingBottom: 0,
      }}>
        {(["body", "versions", "usage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "transparent",
              color: activeTab === tab ? "var(--color-primary)" : "var(--color-text-muted)",
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: "pointer",
              fontSize: 13,
              marginBottom: -1,
            }}
          >
            {tab === "body" ? "Prompt Body" : tab === "versions" ? `Versions (${versions.length})` : `Usage (${usage.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "body" && (
        <div style={{
          background: "rgba(0,0,0,0.2)",
          borderRadius: 8,
          padding: 16,
          
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          color: "var(--color-text)",
          maxHeight: 500,
          overflow: "auto",
          border: "1px solid var(--color-border)",
        }}>
          {prompt.body}
        </div>
      )}

      {activeTab === "versions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {versions.map((v) => (
            <div key={v.version} style={{
              background: v.version === prompt.version ? "rgba(59,130,246,0.06)" : "transparent",
              border: `1px solid ${v.version === prompt.version ? "var(--color-primary)" : "var(--color-border)"}`,
              borderRadius: 8,
              padding: "12px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: v.version === prompt.version ? "var(--color-primary)" : "var(--color-text)",
                }}>
                  v{v.version}
                </span>
                {v.version === prompt.version && (
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 600,
                    background: "rgba(59,130,246,0.15)",
                    color: "var(--color-primary)",
                  }}>
                    current
                  </span>
                )}
                <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: "auto" }}>
                  {v.changedBy} &middot; {formatDate(v.changedAt)}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
                {v.changeNote}
              </p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "usage" && (
        <div>
          {usage.length === 0 ? (
            <div style={{
              padding: 24,
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: 13,
            }}>
              No usage records yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {usage.map((u) => (
                <div key={u.id} style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{u.context}</span>
                    {u.outcome && (
                      <span style={{
                        marginLeft: "auto",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: `${OUTCOME_COLORS[u.outcome] ?? "#6b7280"}20`,
                        color: OUTCOME_COLORS[u.outcome] ?? "#6b7280",
                      }}>
                        {u.outcome}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--color-text-muted)" }}>
                    <span>{u.usedBy}</span>
                    <span>{formatDateTime(u.usedAt)}</span>
                  </div>
                  {u.notes && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0 0", fontStyle: "italic" }}>
                      {u.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metadata footer */}
      <div style={{
        marginTop: 20,
        paddingTop: 12,
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        gap: 16,
        fontSize: 11,
        color: "var(--color-text-muted)",
      }}>
        <span>Created: {formatDate(prompt.createdAt)}</span>
        <span>Updated: {formatDate(prompt.updatedAt)}</span>
        {prompt.lastUsedAt && <span>Last used: {formatDateTime(prompt.lastUsedAt)}</span>}
      </div>
    </div>
  );
}
