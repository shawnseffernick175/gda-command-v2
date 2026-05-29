import { useState, useEffect } from "react";
import {
  fetchDiscussionSummary,
  fetchDiscussionThreads,
  fetchDiscussionMessages,
  postDiscussionMessage,
  type DiscussionSummaryData,
  type DiscussionThreadRow,
  type DiscussionMessageRow,
} from "../api/client";

const ENTITY_COLORS: Record<string, string> = {
  opportunity: "#01696F",
  proposal: "#8b5cf6",
  capture_plan: "#f97316",
  compliance: "#10b981",
  general: "#6b7280",
};

const ENTITY_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  proposal: "Proposal",
  capture_plan: "Capture Plan",
  compliance: "Compliance",
  general: "General",
};

function relTime(dt: string): string {
  const diff = Date.now() - new Date(dt).getTime();
  if (Number.isNaN(diff)) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}40`, textTransform: "uppercase", letterSpacing: "0.5px",
    }}>{label}</span>
  );
}

function SummaryBox({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      padding: "12px 16px", background: "var(--color-surface)", borderRadius: 10,
      border: "1px solid var(--color-border)", textAlign: "center", minWidth: 100,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

export default function Discussions() {
  const [summary, setSummary] = useState<DiscussionSummaryData | null>(null);
  const [threads, setThreads] = useState<DiscussionThreadRow[]>([]);
  const [messages, setMessages] = useState<DiscussionMessageRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchDiscussionSummary().then((r) => { if (r.data) setSummary(r.data); }),
      fetchDiscussionThreads().then((r) => { if (r.data) setThreads(r.data); }),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchDiscussionMessages(selectedId).then((r) => { if (r.data) setMessages(r.data); });
    } else {
      setMessages([]);
    }
  }, [selectedId]);

  const filtered = threads.filter((t) => {
    if (entityFilter && t.entity_type !== entityFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.entity_title.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
    }
    return true;
  });

  const sel = threads.find((t) => t.id === selectedId) ?? null;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading Discussions...</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Discussions</h2>

      {/* Summary Strip */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <SummaryBox label="Threads" value={summary.total_threads} />
          <SummaryBox label="Active" value={summary.active} color="#01696F" />
          <SummaryBox label="Resolved" value={summary.resolved} color="#16a34a" />
          <SummaryBox label="Messages" value={summary.total_messages} color="#8b5cf6" />
          <SummaryBox label="Participants" value={summary.participants} color="#f97316" />
          <SummaryBox label="Opportunities" value={summary.by_entity.opportunity ?? 0} color="#01696F"
            onClick={() => setEntityFilter(entityFilter === "opportunity" ? null : "opportunity")} />
          <SummaryBox label="Proposals" value={summary.by_entity.proposal ?? 0} color="#8b5cf6"
            onClick={() => setEntityFilter(entityFilter === "proposal" ? null : "proposal")} />
          <SummaryBox label="Capture Plans" value={summary.by_entity.capture_plan ?? 0} color="#f97316"
            onClick={() => setEntityFilter(entityFilter === "capture_plan" ? null : "capture_plan")} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Search threads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 13, width: 260,
          }}
        />
        {entityFilter && (
          <button onClick={() => setEntityFilter(null)} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 12, cursor: "pointer",
          }}>
            Clear: {ENTITY_LABELS[entityFilter] ?? entityFilter}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* Thread List */}
        <div style={{ width: 400, flexShrink: 0, maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
          {filtered.map((t) => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} style={{
              padding: 14, background: selectedId === t.id ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: "1px solid var(--color-border)", borderLeft: `4px solid ${ENTITY_COLORS[t.entity_type] ?? "#6b7280"}`,
              borderRadius: 8, marginBottom: 8, cursor: "pointer", transition: "background 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Pill label={ENTITY_LABELS[t.entity_type] ?? t.entity_type} color={ENTITY_COLORS[t.entity_type] ?? "#6b7280"} />
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {t.is_resolved && <Pill label="Resolved" color="#16a34a" />}
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{t.message_count} msgs</span>
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t.title}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{t.entity_title}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{relTime(t.last_message_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!sel ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Select a thread to view messages</div>
          ) : (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
              {/* Thread Header */}
              <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--color-border)" }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{sel.title}</h3>
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Pill label={ENTITY_LABELS[sel.entity_type] ?? sel.entity_type} color={ENTITY_COLORS[sel.entity_type] ?? "#6b7280"} />
                  {sel.is_resolved && <Pill label="Resolved" color="#16a34a" />}
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {sel.participants.length} participants: {sel.participants.join(", ")}
                  </span>
                </div>
                {sel.tags.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                    {sel.tags.map((tag) => <Pill key={tag} label={tag} color="#6366f1" />)}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div style={{ maxHeight: "calc(100vh - 480px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ padding: 12, background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.author}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{relTime(m.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.content}</div>
                    {m.attachments.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                        {m.attachments.map((a, i) => (
                          <span key={i} style={{
                            padding: "2px 8px", borderRadius: 4, background: "#01696F10", border: "1px solid #01696F30",
                            fontSize: 11, color: "#01696F",
                          }}>{a.name}</span>
                        ))}
                      </div>
                    )}
                    {Object.keys(m.reactions).length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                        {Object.entries(m.reactions).map(([emoji, count]) => (
                          <span key={emoji} style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{emoji} {count}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Reply */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)",
                    background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13,
                  }}
                />
                <button
                  onClick={() => { postDiscussionMessage(sel.id, newMessage); setNewMessage(""); }}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "1px solid #01696F",
                    background: "#01696F18", color: "#01696F", fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}
                >
                  Send (dry-run)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
