import { useEffect, useState } from "react";
import {
  fetchDoctrineDrafts,
  fetchDoctrinePublishRuns,
  finalizeDoctrineSprint,
  type DoctrineDraftRow,
  type DoctrineDraftsData,
  type DoctrinePublishRunRow,
  type DoctrineFinalizeData,
  type GateCheckResultRow,
} from "../api/client";

const DOC_TYPE_LABELS: Record<string, string> = {
  book_of_truths: "Book of Truths",
  sprint_notes: "Sprint Notes",
  decision_log: "Decision Log",
  master_build_note: "Master Build Note",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  book_of_truths: "#8b5cf6",
  sprint_notes: "#3b82f6",
  decision_log: "#f59e0b",
  master_build_note: "#06b6d4",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#3b82f6",
  finalized: "#22c55e",
  superseded: "#6b7280",
  blocked: "#ef4444",
};

const RUN_STATUS_COLORS: Record<string, string> = {
  running: "#f59e0b",
  success: "#22c55e",
  blocked: "#ef4444",
  failed: "#ef4444",
};

const GATE_STATUS_COLORS: Record<string, string> = {
  pass: "#22c55e",
  fail: "#ef4444",
  skip: "#6b7280",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function Doctrine() {
  const [data, setData] = useState<DoctrineDraftsData | null>(null);
  const [runs, setRuns] = useState<DoctrinePublishRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSprint, setSelectedSprint] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<DoctrineFinalizeData | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"drafts" | "runs">("drafts");

  useEffect(() => {
    loadData();
  }, [selectedSprint, selectedStatus, selectedDocType, search]);

  function loadData() {
    setLoading(true);
    const params: Record<string, string> = {};
    if (selectedSprint) params.sprint = selectedSprint;
    if (selectedStatus) params.status = selectedStatus;
    if (selectedDocType) params.doc_type = selectedDocType;
    if (search) params.search = search;

    Promise.all([
      fetchDoctrineDrafts(params),
      fetchDoctrinePublishRuns(selectedSprint || undefined),
    ])
      .then(([draftsEnv, runsEnv]) => {
        if (draftsEnv.success && draftsEnv.data) setData(draftsEnv.data);
        if (runsEnv.success && runsEnv.data) setRuns(runsEnv.data.runs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  async function handleFinalize(sprintId: string) {
    setFinalizing(true);
    setFinalizeResult(null);
    try {
      const env = await finalizeDoctrineSprint(sprintId);
      if (env.success && env.data) {
        setFinalizeResult(env.data);
      } else {
        setError("Finalize request failed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Doctrine</h1>
        <p style={{ color: "var(--color-text-muted)" }}>Loading doctrine drafts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24, color: "var(--color-text)" }}>Doctrine</h1>
        <p style={{ color: "#ef4444" }}>Error: {error}</p>
        <button onClick={() => { setError(null); loadData(); }} style={{ marginTop: 12, padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Retry</button>
      </div>
    );
  }

  const drafts = data?.drafts ?? [];
  const sprints = data?.sprints ?? [];
  const statusCounts = data?.statusCounts ?? { draft: 0, finalized: 0, superseded: 0, blocked: 0 };
  const total = data?.total ?? 0;
  const filtered = data?.filtered ?? 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Doctrine</h1>
        <span style={{
          padding: "4px 12px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: "rgba(59,130,246,0.15)",
          color: "#60a5fa",
        }}>
          Live DB
        </span>
      </div>

      {/* Summary Strip */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
      }}>
        <SummaryCard label="Total Drafts" value={total} />
        <SummaryCard label="Draft" value={statusCounts.draft} color="#3b82f6" />
        <SummaryCard label="Finalized" value={statusCounts.finalized} color="#22c55e" />
        <SummaryCard label="Blocked" value={statusCounts.blocked} color="#ef4444" />
        <SummaryCard label="Sprints" value={sprints.length} />
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("drafts")}
          style={{
            padding: "8px 20px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: activeTab === "drafts" ? "rgba(59,130,246,0.15)" : "transparent",
            color: activeTab === "drafts" ? "#60a5fa" : "var(--color-text-muted)",
            fontWeight: activeTab === "drafts" ? 600 : 400,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Drafts ({total})
        </button>
        <button
          onClick={() => setActiveTab("runs")}
          style={{
            padding: "8px 20px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: activeTab === "runs" ? "rgba(59,130,246,0.15)" : "transparent",
            color: activeTab === "runs" ? "#60a5fa" : "var(--color-text-muted)",
            fontWeight: activeTab === "runs" ? 600 : 400,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Publish Runs ({runs.length})
        </button>
      </div>

      {activeTab === "drafts" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search drafts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 14,
                width: 200,
              }}
            />
            <select
              value={selectedSprint}
              onChange={(e) => setSelectedSprint(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 14,
              }}
            >
              <option value="">All Sprints</option>
              {sprints.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 14,
              }}
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
              <option value="superseded">Superseded</option>
              <option value="blocked">Blocked</option>
            </select>
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 14,
              }}
            >
              <option value="">All Types</option>
              <option value="book_of_truths">Book of Truths</option>
              <option value="sprint_notes">Sprint Notes</option>
              <option value="decision_log">Decision Log</option>
              <option value="master_build_note">Master Build Note</option>
            </select>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {filtered} of {total} drafts
            </span>
          </div>

          {/* Finalize Button */}
          {selectedSprint && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              padding: "12px 16px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
            }}>
              <button
                onClick={() => handleFinalize(selectedSprint)}
                disabled={finalizing}
                style={{
                  padding: "8px 20px",
                  borderRadius: 6,
                  border: "1px solid #8b5cf6",
                  background: "rgba(139,92,246,0.15)",
                  color: "#a78bfa",
                  fontWeight: 600,
                  cursor: finalizing ? "wait" : "pointer",
                  fontSize: 14,
                  opacity: finalizing ? 0.6 : 1,
                }}
              >
                {finalizing ? "Running gates..." : `Finalize ${selectedSprint}`}
              </button>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                Dry-run — runs gate checks without publishing documents
              </span>
            </div>
          )}

          {/* Finalize Result */}
          {finalizeResult && (
            <FinalizeResultPanel result={finalizeResult} onDismiss={() => setFinalizeResult(null)} />
          )}

          {/* Drafts List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                expanded={expandedDraft === draft.id}
                onToggle={() =>
                  setExpandedDraft(expandedDraft === draft.id ? null : draft.id)
                }
              />
            ))}
            {drafts.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 40 }}>
                No drafts match the current filters.
              </p>
            )}
          </div>
        </>
      )}

      {activeTab === "runs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {runs.map((run) => (
            <PublishRunCard key={run.id} run={run} />
          ))}
          {runs.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 40 }}>
              No publish runs found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      padding: "12px 20px",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      minWidth: 100,
    }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function DraftCard({
  draft,
  expanded,
  onToggle,
}: {
  draft: DoctrineDraftRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor = STATUS_COLORS[draft.status] ?? "#6b7280";
  const docTypeColor = DOC_TYPE_COLORS[draft.doc_type] ?? "#6b7280";
  const docTypeLabel = DOC_TYPE_LABELS[draft.doc_type] ?? draft.doc_type;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          padding: "14px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 16, color: "var(--color-text-muted)", width: 16, textAlign: "center" }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>

        <span style={{
          padding: "2px 8px",
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          background: `${docTypeColor}20`,
          color: docTypeColor,
          whiteSpace: "nowrap",
        }}>
          {docTypeLabel}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {draft.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
            {draft.sprint_id} · {draft.component}
            {draft.source_pr_number ? ` · PR #${draft.source_pr_number}` : ""}
          </div>
        </div>

        <span style={{
          padding: "2px 10px",
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          background: `${statusColor}20`,
          color: statusColor,
          textTransform: "capitalize",
        }}>
          {draft.status}
        </span>

        <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap", minWidth: 60, textAlign: "right" }}>
          {timeAgo(draft.updated_at)}
        </span>
      </div>

      {expanded && draft.body && (
        <div style={{
          padding: "0 16px 16px 44px",
          borderTop: "1px solid var(--color-border)",
        }}>
          <div style={{
            marginTop: 12,
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--color-text)",
            whiteSpace: "pre-wrap",
          }}>
            {draft.body.split("\n").map((line, i) => {
              if (line.startsWith("## ")) {
                return (
                  <h3 key={i} style={{ fontSize: 15, fontWeight: 600, margin: "16px 0 8px" }}>
                    {line.slice(3)}
                  </h3>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <div key={i} style={{ paddingLeft: 16, marginBottom: 2 }}>
                    {"\u2022 "}{line.slice(2)}
                  </div>
                );
              }
              if (line.startsWith("```")) return null;
              if (line.trim() === "") return <br key={i} />;
              return <span key={i}>{line}{"\n"}</span>;
            })}
          </div>
          {draft.source_pr_url && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <a
                href={draft.source_pr_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa" }}
              >
                View source PR #{draft.source_pr_number}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PublishRunCard({ run }: { run: DoctrinePublishRunRow }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = RUN_STATUS_COLORS[run.status] ?? "#6b7280";

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "14px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 16, color: "var(--color-text-muted)", width: 16, textAlign: "center" }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>

        <span style={{
          padding: "2px 10px",
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600,
          background: `${statusColor}20`,
          color: statusColor,
          textTransform: "capitalize",
        }}>
          {run.status}
        </span>

        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{run.sprint_id}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>
            {run.trigger_type}
          </span>
        </div>

        {run.commit_sha && (
          <code style={{ fontSize: 12, color: "#60a5fa", fontFamily: "monospace" }}>
            {run.commit_sha.slice(0, 7)}
          </code>
        )}

        <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
          {timeAgo(run.started_at)}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px 44px", borderTop: "1px solid var(--color-border)" }}>
          {run.reason && (
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6,
              fontSize: 13,
              color: "#fca5a5",
            }}>
              {run.reason}
            </div>
          )}

          {run.gate_results && run.gate_results.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Gate Results</div>
              {run.gate_results.map((gate, i) => (
                <GateResultRow key={i} gate={gate} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--color-text-muted)" }}>
            Started: {new Date(run.started_at).toLocaleString()}
            {run.completed_at && <> · Completed: {new Date(run.completed_at).toLocaleString()}</>}
          </div>
        </div>
      )}
    </div>
  );
}

function GateResultRow({ gate }: { gate: GateCheckResultRow }) {
  const color = GATE_STATUS_COLORS[gate.status] ?? "#6b7280";
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "6px 0",
      borderBottom: "1px solid var(--color-border)",
      fontSize: 13,
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{ fontWeight: 500, minWidth: 180 }}>{gate.name}</span>
      <span style={{ color: "var(--color-text-muted)", flex: 1 }}>{gate.message}</span>
      <span style={{
        padding: "1px 6px",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
        background: `${color}20`,
        color,
        textTransform: "uppercase",
      }}>
        {gate.status}
      </span>
      {!gate.required && (
        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>optional</span>
      )}
    </div>
  );
}

function FinalizeResultPanel({
  result,
  onDismiss,
}: {
  result: DoctrineFinalizeData;
  onDismiss: () => void;
}) {
  const isBlocked = result.status === "blocked";
  const borderColor = isBlocked ? "#ef4444" : "#22c55e";

  return (
    <div style={{
      marginBottom: 16,
      padding: 16,
      background: "var(--color-surface)",
      border: `1px solid ${borderColor}40`,
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            padding: "3px 10px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            background: `${borderColor}20`,
            color: borderColor,
            textTransform: "capitalize",
          }}>
            {result.status}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Finalize {result.sprintId}
          </span>
          <code style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>
            {result.correlationId}
          </code>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            fontSize: 18,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      {result.reason && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(239,68,68,0.1)",
          borderRadius: 6,
          fontSize: 13,
          color: "#fca5a5",
          marginBottom: 12,
        }}>
          {result.reason}
        </div>
      )}

      {result.note && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(34,197,94,0.1)",
          borderRadius: 6,
          fontSize: 13,
          color: "#86efac",
          marginBottom: 12,
        }}>
          {result.note}
        </div>
      )}

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong>{result.draftsCount}</strong> draft(s) in scope
        {result.draftsFinalized && (
          <span style={{ color: "var(--color-text-muted)" }}>
            : {result.draftsFinalized.join(", ")}
          </span>
        )}
      </div>

      {result.gateResults.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Gate Results</div>
          {result.gateResults.map((gate, i) => (
            <GateResultRow key={i} gate={gate} />
          ))}
        </div>
      )}

      {result.dryRun && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
          Dry-run mode — no documents were published.
        </div>
      )}
    </div>
  );
}
