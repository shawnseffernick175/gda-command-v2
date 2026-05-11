import { useEffect, useState } from "react";
import {
  fetchContacts,
  type ContactsData,
  type ContactRow,
  type MeetingNoteRow,
  type ContactRelationshipRow,
  type LinkedOpportunityRow,
  type TeamingRecordRow,
  type ActionItemRow,
} from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  inactive: "#9ca3af",
  prospect: "#f59e0b",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  prospect: "Prospect",
};

const STRENGTH_COLORS: Record<string, string> = {
  strong: "#22c55e",
  moderate: "#3b82f6",
  weak: "#f59e0b",
  new: "#8b5cf6",
};

const STRENGTH_LABELS: Record<string, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  new: "New",
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  in_person: "In Person",
  virtual: "Virtual",
  phone: "Phone",
  conference: "Conference",
};

const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
  peer: "Peer",
  supervisor: "Supervisor",
  subordinate: "Subordinate",
  stakeholder: "Stakeholder",
  champion: "Champion",
};

const TEAMING_ROLE_LABELS: Record<string, string> = {
  prime: "Prime",
  sub: "Subcontractor",
  mentor: "Mentor",
  jv_partner: "JV Partner",
};

const TEAMING_STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  past: "#9ca3af",
  prospective: "#3b82f6",
};

const ACTION_STATUS_COLORS: Record<string, string> = {
  open: "#f59e0b",
  completed: "#22c55e",
  overdue: "#ef4444",
};

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

type DetailTab = "overview" | "meetings" | "relationships" | "opportunities" | "teaming";

export default function Contacts() {
  const [data, setData] = useState<ContactsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [strengthFilter, setStrengthFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadContacts();
  }, [statusFilter, agencyFilter, strengthFilter, search]);

  async function loadContacts() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (agencyFilter) params.agency = agencyFilter;
      if (strengthFilter) params.strength = strengthFilter;
      if (search) params.search = search;
      const env = await fetchContacts(params);
      if (env.success && env.data) {
        setData(env.data);
        if (!selected && env.data.contacts.length > 0) {
          setSelected(env.data.contacts[0]);
          setActiveTab("overview");
        }
        if (selected && !env.data.contacts.find((c) => c.id === selected.id)) {
          setSelected(env.data.contacts[0] ?? null);
          setActiveTab("overview");
        }
      } else {
        setError(env.error?.message ?? "Failed to load contacts");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setStatusFilter("");
    setAgencyFilter("");
    setStrengthFilter("");
    setSearch("");
  }

  const hasFilters = statusFilter || agencyFilter || strengthFilter || search;

  const summary = data?.summary;
  const contacts = data?.contacts ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Contacts &amp; Relationships</h1>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(59,130,246,0.15)",
            color: "#3b82f6",
          }}
        >
          Mock data
        </span>
      </div>

      {/* Summary Strip */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <SummaryCard label="Total Contacts" value={data?.total ?? 0} />
          <SummaryCard label="Active Relationships" value={summary.activeRelationships} color="#22c55e" />
          <SummaryCard label="Pending Actions" value={summary.pendingMeetings} color="#f59e0b" />
          <SummaryCard label="Teaming Gaps" value={summary.teamingGaps} color="#ef4444" />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospect">Prospect</option>
        </select>

        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Agencies</option>
          {(summary?.agencies ?? []).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={strengthFilter}
          onChange={(e) => setStrengthFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Strengths</option>
          <option value="strong">Strong</option>
          <option value="moderate">Moderate</option>
          <option value="weak">Weak</option>
          <option value="new">New</option>
        </select>

        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            width: 200,
          }}
        />

        {hasFilters && (
          <button onClick={clearFilters} style={clearBtnStyle}>
            Clear filters
          </button>
        )}

        {data && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: "auto" }}>
            Showing {data.filtered} of {data.total}
          </span>
        )}
      </div>

      {loading && <p style={{ color: "var(--color-text-muted)" }}>Loading contacts...</p>}
      {error && <p style={{ color: "#ef4444" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>
          {/* Contact List */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: "calc(100vh - 320px)",
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {contacts.map((c) => (
              <div
                key={c.id}
                onClick={() => { setSelected(c); setActiveTab("overview"); setExpandedMeeting(null); }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${selected?.id === c.id ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: selected?.id === c.id ? "rgba(59,130,246,0.08)" : "var(--color-surface)",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {c.first_name} {c.last_name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: `${STATUS_COLORS[c.status] ?? "#6b7280"}22`,
                      color: STATUS_COLORS[c.status] ?? "#6b7280",
                    }}
                  >
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{c.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.agency} — {c.department?.split(" - ")[0] ?? ""}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: `${STRENGTH_COLORS[c.relationship_strength] ?? "#6b7280"}22`,
                      color: STRENGTH_COLORS[c.relationship_strength] ?? "#6b7280",
                    }}
                  >
                    {STRENGTH_LABELS[c.relationship_strength] ?? c.relationship_strength}
                  </span>
                </div>
              </div>
            ))}
            {contacts.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 24 }}>
                No contacts match your filters.
              </p>
            )}
          </div>

          {/* Detail Panel */}
          {selected ? (
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                background: "var(--color-surface)",
                maxHeight: "calc(100vh - 320px)",
                overflowY: "auto",
              }}
            >
              {/* Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                      {selected.first_name} {selected.last_name}
                    </h2>
                    <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>{selected.title}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{selected.agency} — {selected.department}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: `${STRENGTH_COLORS[selected.relationship_strength] ?? "#6b7280"}22`,
                        color: STRENGTH_COLORS[selected.relationship_strength] ?? "#6b7280",
                      }}
                    >
                      {STRENGTH_LABELS[selected.relationship_strength]}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: `${STATUS_COLORS[selected.status] ?? "#6b7280"}22`,
                        color: STATUS_COLORS[selected.status] ?? "#6b7280",
                      }}
                    >
                      {STATUS_LABELS[selected.status]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 20px" }}>
                {(
                  [
                    { key: "overview", label: "Overview" },
                    { key: "meetings", label: `Meeting Notes (${selected.meeting_notes.length})` },
                    { key: "relationships", label: `Relationships (${selected.relationships.length})` },
                    { key: "opportunities", label: `Opportunities (${selected.linked_opportunities.length})` },
                    { key: "teaming", label: `Teaming (${selected.teaming_records.length})` },
                  ] as { key: DetailTab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setExpandedMeeting(null); }}
                    style={{
                      padding: "10px 14px",
                      fontSize: 13,
                      fontWeight: activeTab === tab.key ? 600 : 400,
                      color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
                      background: "transparent",
                      border: "none",
                      borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ padding: 20 }}>
                {activeTab === "overview" && <OverviewTab contact={selected} />}
                {activeTab === "meetings" && (
                  <MeetingsTab
                    notes={selected.meeting_notes}
                    expandedId={expandedMeeting}
                    onToggle={(id) => setExpandedMeeting(expandedMeeting === id ? null : id)}
                  />
                )}
                {activeTab === "relationships" && <RelationshipsTab relationships={selected.relationships} />}
                {activeTab === "opportunities" && <OpportunitiesTab opportunities={selected.linked_opportunities} />}
                {activeTab === "teaming" && <TeamingTab records={selected.teaming_records} />}
              </div>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                background: "var(--color-surface)",
                padding: 40,
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}
            >
              Select a contact to view details.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function OverviewTab({ contact }: { contact: ContactRow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Contact Info */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Contact Information</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <InfoRow label="Email" value={contact.email} />
          <InfoRow label="Phone" value={contact.phone} />
          <InfoRow label="Agency" value={contact.agency} />
          <InfoRow label="Department" value={contact.department} />
          <InfoRow label="Last Contact" value={new Date(contact.last_contact_date).toLocaleDateString()} />
          <InfoRow label="Created" value={new Date(contact.created_at).toLocaleDateString()} />
        </div>
      </div>

      {/* Relationship History */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Relationship History</h3>
        <p style={{ fontSize: 13, color: "var(--color-text)", margin: 0, lineHeight: 1.5 }}>
          {contact.relationship_history}
        </p>
      </div>

      {/* Tags */}
      {contact.tags.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Tags</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {contact.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(59,130,246,0.1)",
                  color: "#3b82f6",
                  fontWeight: 500,
                }}
              >
                {tag.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Quick Stats</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <MiniStat label="Meetings" value={contact.meeting_notes.length} />
          <MiniStat label="Relationships" value={contact.relationships.length} />
          <MiniStat label="Opportunities" value={contact.linked_opportunities.length} />
          <MiniStat label="Teaming" value={contact.teaming_records.length} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--color-border)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{label}</div>
    </div>
  );
}

function MeetingsTab({
  notes,
  expandedId,
  onToggle,
}: {
  notes: MeetingNoteRow[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (notes.length === 0) {
    return <p style={{ color: "var(--color-text-muted)" }}>No meeting notes recorded.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {notes.map((mn) => {
        const isExpanded = expandedId === mn.id;
        const openActions = mn.action_items.filter((ai) => ai.status === "open").length;
        return (
          <div
            key={mn.id}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => onToggle(mn.id)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: isExpanded ? "rgba(59,130,246,0.05)" : "transparent",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{mn.subject}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                  {new Date(mn.date).toLocaleDateString()} — {MEETING_TYPE_LABELS[mn.type] ?? mn.type}
                  {openActions > 0 && (
                    <span style={{ color: "#f59e0b", marginLeft: 8 }}>
                      {openActions} open action{openActions > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
            </div>

            {isExpanded && (
              <div style={{ padding: "12px 14px", borderTop: "1px solid var(--color-border)" }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4 }}>Attendees</div>
                  <div style={{ fontSize: 13 }}>{mn.attendees.join(", ")}</div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4 }}>Topics</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {mn.topics.map((t, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4 }}>Notes</div>
                  <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: "var(--color-text)" }}>{mn.notes}</p>
                </div>

                {mn.action_items.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4 }}>Action Items</div>
                    {mn.action_items.map((ai, i) => (
                      <ActionItemCard key={i} item={ai} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionItemCard({ item }: { item: ActionItemRow }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid var(--color-border)",
        marginBottom: 4,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{item.description}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Owner: {item.owner}
          {item.due_date && ` — Due: ${new Date(item.due_date).toLocaleDateString()}`}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "1px 6px",
          borderRadius: 3,
          background: `${ACTION_STATUS_COLORS[item.status] ?? "#6b7280"}22`,
          color: ACTION_STATUS_COLORS[item.status] ?? "#6b7280",
          textTransform: "capitalize",
        }}
      >
        {item.status}
      </span>
    </div>
  );
}

function RelationshipsTab({ relationships }: { relationships: ContactRelationshipRow[] }) {
  if (relationships.length === 0) {
    return <p style={{ color: "var(--color-text-muted)" }}>No relationships mapped.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {relationships.map((rel, i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{rel.contact_name}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "rgba(139,92,246,0.1)",
                  color: "#8b5cf6",
                }}
              >
                {RELATIONSHIP_TYPE_LABELS[rel.relationship_type] ?? rel.relationship_type}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `${STRENGTH_COLORS[rel.strength] ?? "#6b7280"}22`,
                  color: STRENGTH_COLORS[rel.strength] ?? "#6b7280",
                }}
              >
                {STRENGTH_LABELS[rel.strength] ?? rel.strength}
              </span>
            </div>
          </div>
          {rel.notes && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{rel.notes}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function OpportunitiesTab({ opportunities }: { opportunities: LinkedOpportunityRow[] }) {
  if (opportunities.length === 0) {
    return <p style={{ color: "var(--color-text-muted)" }}>No linked opportunities.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {opportunities.map((opp, i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{opp.opportunity_title}</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#22c55e" }}>{formatCurrency(opp.value_estimated)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 3,
                background: "rgba(59,130,246,0.1)",
                color: "#3b82f6",
              }}
            >
              {opp.agency}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 3,
                background: "rgba(139,92,246,0.1)",
                color: "#8b5cf6",
              }}
            >
              {opp.role}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 3,
                background: "rgba(34,197,94,0.1)",
                color: "#22c55e",
                textTransform: "capitalize",
              }}
            >
              {opp.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamingTab({ records }: { records: TeamingRecordRow[] }) {
  if (records.length === 0) {
    return <p style={{ color: "var(--color-text-muted)" }}>No teaming records.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {records.map((rec, i) => (
        <div
          key={i}
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{rec.partner_name}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "rgba(59,130,246,0.1)",
                  color: "#3b82f6",
                }}
              >
                {TEAMING_ROLE_LABELS[rec.role] ?? rec.role}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `${TEAMING_STATUS_COLORS[rec.status] ?? "#6b7280"}22`,
                  color: TEAMING_STATUS_COLORS[rec.status] ?? "#6b7280",
                  textTransform: "capitalize",
                }}
              >
                {rec.status}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{rec.capability}</div>

          {rec.past_collaborations.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 2 }}>Past Collaborations</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {rec.past_collaborations.map((collab, j) => (
                  <span
                    key={j}
                    style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: "rgba(34,197,94,0.1)",
                      color: "#22c55e",
                    }}
                  >
                    {collab}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: 6,
              background: "rgba(59,130,246,0.05)",
              border: "1px solid rgba(59,130,246,0.15)",
              fontSize: 12,
              color: "var(--color-text)",
              lineHeight: 1.4,
            }}
          >
            {rec.assessment}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 13,
};

const clearBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "transparent",
  color: "var(--color-text-muted)",
  fontSize: 12,
  cursor: "pointer",
};
