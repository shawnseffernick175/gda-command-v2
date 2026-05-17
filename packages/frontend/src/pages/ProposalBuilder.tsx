import { useEffect, useState, useCallback } from "react";
import {
  fetchProposals,
  fetchProposalDetail,
  createProposal,
  updateProposal,
  deleteProposal,
  createProposalSection,
  updateProposalSection,
  deleteProposalSection,
  deleteAllProposalSections,
  generateProposalOutline,
  generateSectionContent,
  transformSectionContent,
  generateStoryboard,
  type ProposalRow,
  type ProposalSectionRow,
  type ProposalsData,
  type OutlineEntryRow,
  type StoryboardEntryRow,
} from "../api/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  in_review: "#f59e0b",
  red_team: "#ef4444",
  final: "#3b82f6",
  submitted: "#22c55e",
  archived: "#9ca3af",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  red_team: "Red Team",
  final: "Final",
  submitted: "Submitted",
  archived: "Archived",
};

const VOLUME_LABELS: Record<string, string> = {
  executive_summary: "Executive Summary",
  technical: "Technical Approach",
  management: "Management Plan",
  past_performance: "Past Performance",
  cost_price: "Cost/Price",
  cover_letter: "Cover Letter",
  other: "Other",
};

const VOLUME_ICONS: Record<string, string> = {
  executive_summary: "📋",
  technical: "⚙️",
  management: "👥",
  past_performance: "📊",
  cost_price: "💰",
  cover_letter: "✉️",
  other: "📄",
};

const SECTION_STATUS_COLORS: Record<string, string> = {
  outline: "#6b7280",
  draft: "#f59e0b",
  in_review: "#3b82f6",
  final: "#22c55e",
};

const TRANSFORM_ACTIONS = [
  { key: "expand", label: "Expand", icon: "📝", desc: "Add more detail and evidence" },
  { key: "shorten", label: "Shorten", icon: "✂️", desc: "Condense while keeping key points" },
  { key: "add_past_performance", label: "Add Past Performance", icon: "📊", desc: "Insert contract references & metrics" },
  { key: "add_win_themes", label: "Weave Win Themes", icon: "🎯", desc: "Thread discriminators throughout" },
  { key: "make_compliant", label: "Compliance Check", icon: "✅", desc: "Ensure SHALL/MUST addressed" },
  { key: "executive_tone", label: "Executive Tone", icon: "👔", desc: "BLUF structure, outcome-focused" },
  { key: "technical_tone", label: "Technical Tone", icon: "🔧", desc: "Detailed methodologies & standards" },
];

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (86400 * 1000));
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------
type WorkspaceTab = "outline" | "sections" | "storyboard" | "timeline" | "settings";

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function ProposalBuilder() {
  const [data, setData] = useState<ProposalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "workspace">("list");
  const [showCreate, setShowCreate] = useState(false);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchProposals();
      if (env.success && env.data) {
        setData(env.data);
      } else {
        setError(env.error?.message ?? "Failed to load proposals");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading Proposal Builder...</div>;
  if (error) return <div style={{ padding: 40, color: "#ef4444" }}>Error: {error}</div>;
  if (!data) return null;

  if (view === "workspace" && selectedId) {
    return (
      <ProposalWorkspace
        proposalId={selectedId}
        onBack={() => { setView("list"); loadProposals(); }}
      />
    );
  }

  const { proposals, summary } = data;
  const active = proposals.filter((p) => !["submitted", "archived"].includes(p.status)).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Proposal Builder</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
            Create, write, and manage proposals with AI assistance — from outline to submission.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>
          + New Proposal
        </button>
      </div>

      <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "rgba(34,197,94,0.15)", color: "#22c55e", marginBottom: 16 }}>
        Live — database
      </span>

      {/* Summary strip */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: String(data.total), color: "var(--color-text)" },
          { label: "Active", value: String(active), color: "#3b82f6" },
          { label: "Avg Compliance", value: `${summary.avgCompliance}%`, color: summary.avgCompliance >= 80 ? "#22c55e" : summary.avgCompliance >= 60 ? "#f59e0b" : "#ef4444" },
          { label: "Pipeline Value", value: formatCurrency(summary.totalValue), color: "#8b5cf6" },
          { label: "Red Team Findings", value: String(summary.totalRedTeamOpen), color: summary.totalRedTeamOpen > 0 ? "#ef4444" : "#22c55e" },
        ].map((s) => (
          <div key={s.label} style={summaryCard}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Proposals table */}
      {proposals.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No proposals yet</p>
          <p style={{ fontSize: 14, marginBottom: 20 }}>Create your first proposal to get started with AI-assisted writing.</p>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ New Proposal</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {proposals.map((p) => (
            <ProposalListItem
              key={p.id}
              proposal={p}
              onClick={() => { setSelectedId(p.id); setView("workspace"); }}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateProposalModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedId(id);
            setView("workspace");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposal List Item
// ---------------------------------------------------------------------------
function ProposalListItem({ proposal: p, onClick }: { proposal: ProposalRow; onClick: () => void }) {
  const statusColor = STATUS_COLORS[p.status] ?? "#6b7280";
  const days = daysUntil(p.due_date);
  const urgent = days <= 14 && days > 0;
  const overdue = days <= 0 && p.status !== "submitted";

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "16px 20px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {p.agency} • {p.solicitation_title || "No solicitation linked"}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(p.value_estimated)}</div>
          <div style={{ fontSize: 11, color: overdue ? "#ef4444" : urgent ? "#f59e0b" : "var(--color-text-muted)" }}>
            {p.due_date ? (overdue ? `${Math.abs(days)}d overdue` : `${days}d left`) : "No deadline"}
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 12,
          background: `${statusColor}22`,
          color: statusColor,
          whiteSpace: "nowrap",
        }}>
          {STATUS_LABELS[p.status] ?? p.status}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Proposal Modal
// ---------------------------------------------------------------------------
function CreateProposalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [agency, setAgency] = useState("");
  const [solTitle, setSolTitle] = useState("");
  const [solId, setSolId] = useState("");
  const [value, setValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [capMgr, setCapMgr] = useState("");
  const [propMgr, setPropMgr] = useState("");
  const [winThemes, setWinThemes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleCreate = async () => {
    if (!title || !agency) { setErr("Title and agency are required"); return; }
    setSaving(true);
    setErr("");
    try {
      const env = await createProposal({
        title,
        agency,
        solicitation_title: solTitle || undefined,
        solicitation_id: solId || undefined,
        value_estimated: value ? Number(value) : undefined,
        due_date: dueDate || undefined,
        capture_manager: capMgr || undefined,
        proposal_manager: propMgr || undefined,
        win_themes: winThemes ? winThemes.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      });
      if (env.success && env.data) {
        onCreated(env.data.proposal.id);
      } else {
        setErr(env.error?.message ?? "Failed to create proposal");
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>New Proposal</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Army PEO IEW&S SETA Support — Technical & Cost" />
          </div>
          <div>
            <label style={labelStyle}>Agency *</label>
            <input value={agency} onChange={(e) => setAgency(e.target.value)} style={inputStyle} placeholder="e.g. US Army" />
          </div>
          <div>
            <label style={labelStyle}>Estimated Value</label>
            <input value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} placeholder="e.g. 85000000" type="number" />
          </div>
          <div>
            <label style={labelStyle}>Solicitation Title</label>
            <input value={solTitle} onChange={(e) => setSolTitle(e.target.value)} style={inputStyle} placeholder="e.g. Army PEO IEW&S SETA IDIQ" />
          </div>
          <div>
            <label style={labelStyle}>Solicitation ID</label>
            <input value={solId} onChange={(e) => setSolId(e.target.value)} style={inputStyle} placeholder="e.g. SOL-2025-001" />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} type="date" />
          </div>
          <div>
            <label style={labelStyle}>Proposal Manager</label>
            <input value={propMgr} onChange={(e) => setPropMgr(e.target.value)} style={inputStyle} placeholder="e.g. Sarah Mitchell" />
          </div>
          <div>
            <label style={labelStyle}>Capture Manager</label>
            <input value={capMgr} onChange={(e) => setCapMgr(e.target.value)} style={inputStyle} placeholder="e.g. Shawn Seffernick" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Win Themes (comma-separated)</label>
            <input value={winThemes} onChange={(e) => setWinThemes(e.target.value)} style={inputStyle} placeholder="e.g. Proven C5ISR expertise, Cleared workforce, Rapid transition" />
          </div>
        </div>

        {err && <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={btnPrimary}>
            {saving ? "Creating..." : "Create Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposal Workspace — the main editing interface
// ---------------------------------------------------------------------------
function ProposalWorkspace({ proposalId, onBack }: { proposalId: string; onBack: () => void }) {
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [sections, setSections] = useState<ProposalSectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("outline");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const env = await fetchProposalDetail(proposalId);
      if (env.success && env.data) {
        setProposal(env.data.proposal);
        setSections(env.data.sections ?? []);
      } else {
        setError(env.error?.message ?? "Failed to load proposal");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, color: "var(--color-text-muted)" }}>Loading proposal...</div>;
  if (error || !proposal) return <div style={{ padding: 40, color: "#ef4444" }}>Error: {error}</div>;

  const statusColor = STATUS_COLORS[proposal.status] ?? "#6b7280";
  const totalWords = sections.reduce((sum, s) => sum + s.word_count, 0);
  const draftSections = sections.filter((s) => s.status === "draft" || s.status === "final").length;
  const progress = sections.length > 0 ? Math.round((draftSections / sections.length) * 100) : 0;

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  // Group sections by volume
  const volumeGroups = new Map<string, ProposalSectionRow[]>();
  for (const s of sections) {
    const existing = volumeGroups.get(s.volume_type) ?? [];
    existing.push(s);
    volumeGroups.set(s.volume_type, existing);
  }

  const handleGenerateOutline = async () => {
    setAiLoading(true);
    setAiStatus("Generating outline with AI...");
    try {
      const env = await generateProposalOutline(proposalId);
      if (env.success && env.data) {
        const outline = env.data.outline;
        if (!Array.isArray(outline) || outline.length === 0) {
          setAiStatus("AI returned an empty outline — sections were not modified.");
        } else {
          await deleteAllProposalSections(proposalId);
          for (const vol of outline) {
            for (let i = 0; i < vol.sections.length; i++) {
              const sec = vol.sections[i];
              await createProposalSection(proposalId, {
                volume_type: vol.volume_type,
                title: sec.title,
                content: sec.description,
                sort_order: i,
                status: "outline",
              });
            }
          }
          setAiStatus("Outline generated — sections created!");
        }
        await load();
        setTab("sections");
      } else {
        setAiStatus(`Error: ${env.error?.message ?? "Unknown error"}`);
      }
    } catch (e) {
      setAiStatus(`Error: ${e}`);
    } finally {
      setAiLoading(false);
      setTimeout(() => setAiStatus(""), 5000);
    }
  };

  const handleGenerateSection = async (sectionId: string, instructions?: string) => {
    setAiLoading(true);
    setAiStatus("AI is writing...");
    try {
      const env = await generateSectionContent(proposalId, sectionId, instructions);
      if (env.success && env.data) {
        setAiStatus(`Draft generated — ${env.data.wordCount} words`);
        await load();
      } else {
        setAiStatus(`Error: ${env.error?.message ?? "Unknown error"}`);
      }
    } catch (e) {
      setAiStatus(`Error: ${e}`);
    } finally {
      setAiLoading(false);
      setTimeout(() => setAiStatus(""), 5000);
    }
  };

  const handleTransformSection = async (sectionId: string, action: string) => {
    setAiLoading(true);
    setAiStatus(`Transforming: ${action}...`);
    try {
      const env = await transformSectionContent(proposalId, sectionId, action);
      if (env.success && env.data) {
        setAiStatus(`Transformed — ${env.data.wordCount} words`);
        await load();
      } else {
        setAiStatus(`Error: ${env.error?.message ?? "Unknown error"}`);
      }
    } catch (e) {
      setAiStatus(`Error: ${e}`);
    } finally {
      setAiLoading(false);
      setTimeout(() => setAiStatus(""), 5000);
    }
  };

  const handleGenerateStoryboard = async () => {
    setAiLoading(true);
    setAiStatus("Generating storyboard...");
    try {
      const env = await generateStoryboard(proposalId);
      if (env.success && env.data) {
        setAiStatus("Storyboard generated!");
        await load();
      } else {
        setAiStatus(`Error: ${env.error?.message ?? "Unknown error"}`);
      }
    } catch (e) {
      setAiStatus(`Error: ${e}`);
    } finally {
      setAiLoading(false);
      setTimeout(() => setAiStatus(""), 5000);
    }
  };

  const handleAddSection = async (volumeType: string) => {
    const title = prompt("Section title:");
    if (!title) return;
    await createProposalSection(proposalId, { volume_type: volumeType, title, sort_order: sections.filter((s) => s.volume_type === volumeType).length });
    await load();
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm("Delete this section?")) return;
    await deleteProposalSection(proposalId, sectionId);
    if (selectedSectionId === sectionId) setSelectedSectionId(null);
    await load();
  };

  const handleSaveSection = async (sectionId: string, content: string) => {
    await updateProposalSection(proposalId, sectionId, { content, status: "draft" });
    await load();
  };

  const handleUpdateStatus = async (newStatus: string) => {
    await updateProposal(proposalId, { status: newStatus } as Partial<ProposalRow>);
    await load();
  };

  const tabs: { key: WorkspaceTab; label: string; icon: string }[] = [
    { key: "outline", label: "Outline", icon: "📑" },
    { key: "sections", label: "Sections", icon: "✏️" },
    { key: "storyboard", label: "Storyboard", icon: "🎯" },
    { key: "timeline", label: "Timeline", icon: "📅" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <button onClick={onBack} style={{ ...btnSecondary, padding: "4px 12px", fontSize: 13 }}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {proposal.title}
        </h1>
        <select value={proposal.status} onChange={(e) => handleUpdateStatus(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12, color: statusColor, fontWeight: 600 }}>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
        <span>{proposal.agency}</span>
        <span>•</span>
        <span>{formatCurrency(proposal.value_estimated)}</span>
        <span>•</span>
        <span>Due: {formatDate(proposal.due_date)}</span>
        <span>•</span>
        <span>{sections.length} sections</span>
        <span>•</span>
        <span>{totalWords.toLocaleString()} words</span>
        <span>•</span>
        <span>{progress}% drafted</span>
      </div>

      {/* AI status bar */}
      {(aiLoading || aiStatus) && (
        <div style={{
          background: aiLoading ? "rgba(59,130,246,0.1)" : (aiStatus.startsWith("Error") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)"),
          border: `1px solid ${aiLoading ? "#3b82f6" : (aiStatus.startsWith("Error") ? "#ef4444" : "#22c55e")}`,
          borderRadius: 8,
          padding: "8px 16px",
          marginBottom: 16,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          {aiLoading && <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>}
          {aiStatus}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--color-border)", marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #3b82f6" : "2px solid transparent",
              marginBottom: -2,
              color: tab === t.key ? "#3b82f6" : "var(--color-text-muted)",
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "outline" && (
        <OutlineTab
          proposal={proposal}
          sections={sections}
          onGenerate={handleGenerateOutline}
          onAddSection={handleAddSection}
          aiLoading={aiLoading}
        />
      )}
      {tab === "sections" && (
        <SectionsTab
          proposal={proposal}
          sections={sections}
          volumeGroups={volumeGroups}
          selectedSection={selectedSection}
          onSelectSection={setSelectedSectionId}
          onGenerateSection={handleGenerateSection}
          onTransformSection={handleTransformSection}
          onSaveSection={handleSaveSection}
          onDeleteSection={handleDeleteSection}
          onAddSection={handleAddSection}
          aiLoading={aiLoading}
        />
      )}
      {tab === "storyboard" && (
        <StoryboardTab
          proposal={proposal}
          sections={sections}
          onGenerate={handleGenerateStoryboard}
          aiLoading={aiLoading}
        />
      )}
      {tab === "timeline" && <TimelineTab proposal={proposal} />}
      {tab === "settings" && <SettingsTab proposal={proposal} onUpdate={load} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outline Tab
// ---------------------------------------------------------------------------
function OutlineTab({ proposal, sections, onGenerate, onAddSection, aiLoading }: {
  proposal: ProposalRow;
  sections: ProposalSectionRow[];
  onGenerate: () => void;
  onAddSection: (volumeType: string) => void;
  aiLoading: boolean;
}) {
  const outline = proposal.outline ?? [];
  const volumeTypes = ["executive_summary", "technical", "management", "past_performance", "cost_price"];

  if (sections.length === 0 && outline.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Start with an Outline</p>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 24, maxWidth: 500, margin: "0 auto 24px" }}>
          Let AI generate a proposal outline based on your opportunity details, RFP requirements, and win themes. Or build your outline manually.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onGenerate} disabled={aiLoading} style={btnPrimary}>
            {aiLoading ? "Generating..." : "🤖 Generate Outline with AI"}
          </button>
          <button onClick={() => onAddSection("technical")} style={btnSecondary}>
            + Add Section Manually
          </button>
        </div>
      </div>
    );
  }

  // Group existing sections by volume
  const grouped = new Map<string, ProposalSectionRow[]>();
  for (const s of sections) {
    const existing = grouped.get(s.volume_type) ?? [];
    existing.push(s);
    grouped.set(s.volume_type, existing);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, margin: 0 }}>
          {sections.length} sections across {grouped.size} volumes
        </p>
        <button onClick={onGenerate} disabled={aiLoading} style={btnSecondary}>
          {aiLoading ? "Regenerating..." : "🤖 Regenerate Outline"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {volumeTypes.map((vt) => {
          const secs = grouped.get(vt) ?? [];
          return (
            <div key={vt} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{VOLUME_ICONS[vt]}</span>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{VOLUME_LABELS[vt]}</h3>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>({secs.length} sections)</span>
                </div>
                <button onClick={() => onAddSection(vt)} style={{ ...btnSecondary, padding: "3px 10px", fontSize: 12 }}>+ Add</button>
              </div>
              {secs.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: 0 }}>No sections yet</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {secs.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--color-bg)", borderRadius: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: SECTION_STATUS_COLORS[s.status] ?? "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, flex: 1 }}>{s.title}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{s.word_count} words</span>
                      <span style={{ fontSize: 11, color: SECTION_STATUS_COLORS[s.status], fontWeight: 600 }}>{s.status}</span>
                    </div>
                  ))}
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
// Sections Tab — Editor view
// ---------------------------------------------------------------------------
function SectionsTab({ proposal, sections, volumeGroups, selectedSection, onSelectSection, onGenerateSection, onTransformSection, onSaveSection, onDeleteSection, onAddSection, aiLoading }: {
  proposal: ProposalRow;
  sections: ProposalSectionRow[];
  volumeGroups: Map<string, ProposalSectionRow[]>;
  selectedSection: ProposalSectionRow | null;
  onSelectSection: (id: string | null) => void;
  onGenerateSection: (id: string, instructions?: string) => void;
  onTransformSection: (id: string, action: string) => void;
  onSaveSection: (id: string, content: string) => void;
  onDeleteSection: (id: string) => void;
  onAddSection: (volumeType: string) => void;
  aiLoading: boolean;
}) {
  const [editContent, setEditContent] = useState(selectedSection?.content ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (selectedSection) {
      setEditContent(selectedSection.content);
      setDirty(false);
    }
  }, [selectedSection]);

  if (sections.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>No sections yet</p>
        <p style={{ fontSize: 14 }}>Go to the Outline tab to generate or add sections first.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* Section nav sidebar */}
      <div style={{ width: 280, flexShrink: 0 }}>
        {Array.from(volumeGroups.entries()).map(([vt, secs]) => (
          <div key={vt} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <span>{VOLUME_ICONS[vt]}</span> {VOLUME_LABELS[vt]}
              </div>
              <button onClick={() => onAddSection(vt)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 14, padding: 0 }}>+</button>
            </div>
            {secs.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSection(s.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selectedSection?.id === s.id ? "rgba(59,130,246,0.15)" : "transparent",
                  borderLeft: selectedSection?.id === s.id ? "3px solid #3b82f6" : "3px solid transparent",
                  marginBottom: 2,
                  transition: "all 0.1s",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: selectedSection?.id === s.id ? 600 : 400, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
                  <span style={{ color: SECTION_STATUS_COLORS[s.status] }}>{s.status}</span>
                  <span>{s.word_count}w</span>
                  {s.ai_generated && <span style={{ color: "#8b5cf6" }}>AI</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Editor panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedSection ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
            <p>Select a section from the sidebar to start writing.</p>
          </div>
        ) : (
          <div>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{selectedSection.title}</h3>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                  {VOLUME_LABELS[selectedSection.volume_type]} • {selectedSection.word_count} words • {selectedSection.status}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    if (dirty) onSaveSection(selectedSection.id, editContent);
                  }}
                  disabled={!dirty}
                  style={{ ...btnPrimary, padding: "6px 14px", fontSize: 12, opacity: dirty ? 1 : 0.5 }}
                >
                  Save
                </button>
                <button onClick={() => onDeleteSection(selectedSection.id)} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, color: "#ef4444" }}>
                  Delete
                </button>
              </div>
            </div>

            {/* AI tools bar */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => onGenerateSection(selectedSection.id)}
                disabled={aiLoading}
                style={{ ...btnPrimary, padding: "5px 12px", fontSize: 12, background: "#8b5cf6" }}
              >
                🤖 {selectedSection.content ? "Rewrite with AI" : "Generate Draft"}
              </button>
              {selectedSection.content && TRANSFORM_ACTIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onTransformSection(selectedSection.id, t.key)}
                  disabled={aiLoading}
                  title={t.desc}
                  style={{ ...btnSecondary, padding: "5px 10px", fontSize: 11 }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Content editor */}
            <textarea
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); setDirty(true); }}
              style={{
                width: "100%",
                minHeight: 400,
                padding: 16,
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 14,
                lineHeight: 1.7,
                fontFamily: "'Georgia', serif",
                resize: "vertical",
                boxSizing: "border-box",
              }}
              placeholder="Start writing your proposal section here, or click 'Generate Draft' to let AI write a first draft..."
            />

            {/* Word count footer */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
              <span>{editContent.split(/\s+/).filter(Boolean).length} words</span>
              <span>Last updated: {formatDate(selectedSection.updated_at)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storyboard Tab
// ---------------------------------------------------------------------------
function StoryboardTab({ proposal, sections, onGenerate, aiLoading }: {
  proposal: ProposalRow;
  sections: ProposalSectionRow[];
  onGenerate: () => void;
  aiLoading: boolean;
}) {
  const storyboard: StoryboardEntryRow[] = proposal.storyboard ?? [];

  if (storyboard.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Storyboard</p>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 24, maxWidth: 500, margin: "0 auto 24px" }}>
          The storyboard shows how your win themes thread through each section. It maps key points and compliance requirements to create a cohesive narrative.
        </p>
        <button onClick={onGenerate} disabled={aiLoading || sections.length === 0} style={btnPrimary}>
          {aiLoading ? "Generating..." : "🎯 Generate Storyboard"}
        </button>
        {sections.length === 0 && (
          <p style={{ color: "#f59e0b", fontSize: 13, marginTop: 12 }}>Add sections first (Outline tab) before generating a storyboard.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <p style={{ color: "var(--color-text-muted)", fontSize: 14, margin: 0 }}>Win Theme Flow — {storyboard.length} sections mapped</p>
          {proposal.win_themes.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {proposal.win_themes.map((t) => (
                <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(139,92,246,0.15)", color: "#8b5cf6", fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <button onClick={onGenerate} disabled={aiLoading} style={btnSecondary}>
          {aiLoading ? "Regenerating..." : "🔄 Regenerate"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {storyboard.map((entry) => (
          <div key={entry.id ?? entry.section_id} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{VOLUME_ICONS[entry.volume_type] ?? "📄"}</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{entry.section_title}</span>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{VOLUME_LABELS[entry.volume_type]}</span>
            </div>

            {entry.win_themes?.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                {entry.win_themes.map((t) => (
                  <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>{t}</span>
                ))}
              </div>
            )}

            {entry.key_points?.length > 0 && (
              <ul style={{ margin: "0 0 8px", paddingLeft: 20, fontSize: 13, color: "var(--color-text-muted)" }}>
                {entry.key_points.map((pt, i) => <li key={i} style={{ marginBottom: 2 }}>{pt}</li>)}
              </ul>
            )}

            {entry.compliance_reqs?.length > 0 && (
              <div style={{ fontSize: 11, color: "#22c55e" }}>
                Compliance: {entry.compliance_reqs.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline Tab
// ---------------------------------------------------------------------------
function TimelineTab({ proposal }: { proposal: ProposalRow }) {
  const timeline = proposal.timeline ?? [];
  const milestones = [
    { label: "Compliance Matrix Complete", status: "completed" },
    { label: "First Draft — All Volumes", status: "on_track" },
    { label: "Pink Team Review", status: "on_track" },
    { label: "Red Team Review", status: "pending" },
    { label: "Gold Team Decision", status: "pending" },
    { label: "Final Submission", status: "pending" },
  ];

  const items = timeline.length > 0 ? timeline : milestones;

  return (
    <div>
      <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 20 }}>
        Shipley milestone tracking — from compliance matrix to final submission.
      </p>

      <div style={{ position: "relative", paddingLeft: 32 }}>
        {/* Vertical line */}
        <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: "var(--color-border)" }} />

        {items.map((item, i) => {
          const label = "milestone" in item ? (item as { milestone: string }).milestone : (item as { label: string }).label;
          const st = (item as { status: string }).status;
          const dotColor = st === "completed" ? "#22c55e" : st === "on_track" ? "#3b82f6" : st === "at_risk" ? "#f59e0b" : "#6b7280";

          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 24, position: "relative" }}>
              <div style={{
                position: "absolute",
                left: -22,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: dotColor,
                border: "2px solid var(--color-bg)",
                zIndex: 1,
              }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {"due_date" in item ? formatDate((item as { due_date: string }).due_date) : "TBD"}
                  {" • "}
                  <span style={{ color: dotColor, fontWeight: 600 }}>{st}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------
function SettingsTab({ proposal, onUpdate }: { proposal: ProposalRow; onUpdate: () => void }) {
  const [winThemes, setWinThemes] = useState(proposal.win_themes?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProposal(proposal.id, {
      win_themes: winThemes.split(",").map((t) => t.trim()).filter(Boolean),
    } as Partial<ProposalRow>);
    setSaving(false);
    onUpdate();
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ fontSize: 16, marginBottom: 16 }}>Proposal Settings</h3>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Win Themes (comma-separated)</label>
        <textarea
          value={winThemes}
          onChange={(e) => setWinThemes(e.target.value)}
          style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
          placeholder="e.g. Proven C5ISR expertise, Cleared workforce, Rapid 30-day transition"
        />
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
          Win themes are woven throughout AI-generated content and tracked in the storyboard.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Proposal Manager</label>
        <input value={proposal.proposal_manager} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Capture Manager</label>
        <input value={proposal.capture_manager} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
      </div>

      <button onClick={handleSave} disabled={saving} style={btnPrimary}>
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "transparent",
  color: "var(--color-text)",
  fontSize: 14,
  cursor: "pointer",
};

const summaryCard: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "12px 20px",
  minWidth: 110,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-text-muted)",
  marginBottom: 4,
  textTransform: "uppercase",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalContent: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 24,
  width: 600,
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflowY: "auto",
};
