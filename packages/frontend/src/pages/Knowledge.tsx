import { useEffect, useState, useRef } from "react";
import InfoBadge from "../components/InfoBadge";
import {
  fetchKnowledgeSummary,
  fetchKnowledgeCollections,
  fetchKnowledgeDocuments,
  fetchKnowledgeDocument,
  searchKnowledge,
  fetchChatSessions,
  fetchChatSession,
  sendChatMessage,
  uploadDocument,
  type KnowledgeSummaryData,
  type KnowledgeCollection,
  type KnowledgeDocument,
  type KnowledgeSearchResult,
  type ChatMessage,
  type ChatSessionSummary,
  type ChatSessionDetail,
} from "../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours > 0) return `${hours}h ago`;
  return "Just now";
}

const STATUS_COLORS: Record<string, string> = {
  indexed: "#22c55e",
  processing: "#f59e0b",
  failed: "#ef4444",
  pending: "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  financials: "Financials",
  past_performance: "Past Performance",
  proposal: "Proposal",
  compliance: "Compliance",
  capture_plan: "Capture Plan",
  capability_statement: "Capability Statement",
  doctrine: "Doctrine",
  contract: "Contract",
  sow: "Statement of Work (SOW)",
  pws: "Performance Work Statement (PWS)",
  rfp: "RFP / Solicitation",
  rfi: "RFI / Sources Sought",
  teaming_agreement: "Teaming Agreement",
  org_chart: "Org Chart",
  resume: "Resume / Key Personnel",
  cost_volume: "Cost / Price Volume",
  tech_volume: "Technical Volume",
  management_volume: "Management Volume",
  cpars: "CPARS / Past Performance Eval",
  dd254: "DD-254 / Security",
  subcontracting_plan: "Subcontracting Plan",
  quality_plan: "Quality Control Plan",
  transition_plan: "Transition Plan",
  white_paper: "White Paper",
  intel_report: "Intel / Market Research",
  meeting_notes: "Meeting Notes",
  memo: "Memo / General",
};

const ACTION_LABELS: Record<string, { label: string; description: string }> = {
  store: { label: "Store & Index", description: "Save to Knowledge Base for AI reference" },
  ingest_financials: { label: "Ingest into Financial Bible", description: "Parse financial data and update KPIs" },
  ingest_past_perf: { label: "Ingest Past Performance", description: "Extract contract history for proposals" },
  ingest_contacts: { label: "Extract Contacts", description: "Pull names, emails, roles into Contacts" },
  analyze: { label: "AI Analysis", description: "Run deep analysis and generate recommendations" },
  shred_rfp: { label: "Shred as RFP", description: "Extract requirements, compliance matrix, deadlines" },
  update_company: { label: "Update Company Profile", description: "Parse and update company capabilities" },
};

const TYPE_COLORS: Record<string, string> = {
  financials: "#10b981",
  past_performance: "#8b5cf6",
  proposal: "#3b82f6",
  compliance: "#f59e0b",
  capture_plan: "#22c55e",
  capability_statement: "#06b6d4",
  doctrine: "#ec4899",
  contract: "#6366f1",
  sow: "#a855f7",
  pws: "#a855f7",
  rfp: "#ef4444",
  rfi: "#f97316",
  teaming_agreement: "#14b8a6",
  org_chart: "#64748b",
  resume: "#0ea5e9",
  cost_volume: "#10b981",
  tech_volume: "#3b82f6",
  management_volume: "#8b5cf6",
  cpars: "#f59e0b",
  dd254: "#ef4444",
  subcontracting_plan: "#22c55e",
  quality_plan: "#06b6d4",
  transition_plan: "#a855f7",
  white_paper: "#64748b",
  intel_report: "#f97316",
  meeting_notes: "#6b7280",
  memo: "#6b7280",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryStrip({ summary }: { summary: KnowledgeSummaryData }) {
  const cards = [
    { label: "Documents", value: summary.total_documents, color: "#3b82f6", info: { whatItIs: "Total documents uploaded to Knowledge Base.", whatItMeans: "More documents = smarter AI across all features." } },
    { label: "Indexed", value: summary.indexed_count, color: "#22c55e", info: { whatItIs: "Documents fully processed and searchable.", whatItMeans: "These documents are available for RAG queries and AI analysis." } },
    { label: "Processing", value: summary.processing_count, color: "#f59e0b", info: { whatItIs: "Documents being chunked and embedded.", whatItMeans: "Recently uploaded — will be searchable once processing completes." } },
    { label: "Chunks", value: (summary.total_chunks ?? 0).toLocaleString(), color: "#8b5cf6", info: { whatItIs: "Text segments created for semantic search.", whatItMeans: "Documents split into searchable passages for precise AI retrieval.", howCalculated: "Each document split into overlapping ~500-token segments." } },
    { label: "Collections", value: summary.collection_count, color: "#06b6d4", info: { whatItIs: "Organized groups of related documents.", whatItMeans: "Categories like Past Performance, Proposals, Compliance for targeted search." } },
    { label: "Total Lookups", value: summary.total_access_count, color: "#6366f1", info: { whatItIs: "Times documents have been accessed or referenced.", whatItMeans: "High lookup count = frequently used by AI and users.", howCalculated: "Cumulative access count across all documents." } },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            flex: "1 1 140px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "12px 16px",
            minWidth: 120,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4 }}>
            {c.label}
            {c.info && <InfoBadge size={14} {...c.info} />}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: c.color, marginTop: 2 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------

function DocumentsTab() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchKnowledgeDocuments({ search: search || undefined, collection: collectionFilter || undefined, type: typeFilter || undefined, sort: sortBy }),
      fetchKnowledgeCollections(),
    ])
      .then(([docEnv, colEnv]) => {
        if (docEnv.success && docEnv.data) setDocuments(docEnv.data);
        if (colEnv.success && colEnv.data) setCollections(colEnv.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, collectionFilter, typeFilter, sortBy]);

  useEffect(() => {
    if (!selectedDocId) return;
    let stale = false;
    setDetailLoading(true);
    fetchKnowledgeDocument(selectedDocId)
      .then((env) => {
        if (!stale && env.success && env.data) setSelectedDoc(env.data);
      })
      .catch(() => {})
      .finally(() => { if (!stale) setDetailLoading(false); });
    return () => { stale = true; };
  }, [selectedDocId]);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading documents...</p>;

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* Left: Document list */}
      <div style={{ flex: "0 0 420px", maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 180px",
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: 13,
            }}
          />
          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}
          >
            <option value="">All Collections</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}
          >
            <option value="recent">Recent</option>
            <option value="accessed">Most Used</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{documents.length} documents</span>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + Upload
          </button>
        </div>

        {/* Document Cards */}
        {documents.map((doc) => (
          <div
            key={doc.id}
            onClick={() => { setSelectedDocId(doc.id); setSelectedDoc(doc); }}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${selectedDoc?.id === doc.id ? "#3b82f6" : "var(--color-border)"}`,
              background: selectedDoc?.id === doc.id ? "rgba(59,130,246,0.08)" : "var(--color-surface)",
              marginBottom: 8,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 13, fontWeight: 600, flex: 1, marginRight: 8 }}>{doc.title}</div>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: `${STATUS_COLORS[doc.status]}22`,
                  color: STATUS_COLORS[doc.status],
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {doc.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `${TYPE_COLORS[doc.type] ?? "#6b7280"}18`,
                  color: TYPE_COLORS[doc.type] ?? "#6b7280",
                  fontWeight: 500,
                }}
              >
                {TYPE_LABELS[doc.type] ?? doc.type}
              </span>
              <span>{doc.pages ? `${doc.pages}pg` : "—"}</span>
              <span>{formatBytes(doc.file_size_bytes)}</span>
              <span>{doc.chunks_indexed} chunks</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: "var(--color-text-muted)" }}>
              <span>Uploaded {timeAgo(doc.uploaded_at)}</span>
              {doc.access_count > 0 && <span>| {doc.access_count} lookups</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Right: Detail panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedDoc ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
            Select a document to view details
          </div>
        ) : detailLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading...</div>
        ) : (
          <DocumentDetail doc={selectedDoc} />
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && <UploadModal collections={collections} onClose={() => setShowUpload(false)} />}
    </div>
  );
}

function DocumentDetail({ doc }: { doc: KnowledgeDocument }) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{doc.title}</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{doc.file_name}</div>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 4,
            background: `${STATUS_COLORS[doc.status]}22`,
            color: STATUS_COLORS[doc.status],
            fontWeight: 600,
          }}
        >
          {doc.status}
        </span>
      </div>

      {/* Summary */}
      <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16, color: "var(--color-text)" }}>
        {doc.summary}
      </div>

      {/* Metadata grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 16 }}>
        <MetaField label="Type" value={TYPE_LABELS[doc.type] ?? doc.type} />
        <MetaField label="Pages" value={doc.pages ? String(doc.pages) : "—"} />
        <MetaField label="Size" value={formatBytes(doc.file_size_bytes)} />
        <MetaField label="Chunks Indexed" value={String(doc.chunks_indexed)} />
        <MetaField label="Uploaded" value={new Date(doc.uploaded_at).toLocaleDateString()} />
        <MetaField label="Last Accessed" value={doc.last_accessed ? timeAgo(doc.last_accessed) : "Never"} />
        <MetaField label="Lookups" value={String(doc.access_count)} />
        {doc.metadata?.agency && <MetaField label="Agency" value={doc.metadata.agency} />}
        {doc.metadata?.contract_number && <MetaField label="Contract #" value={doc.metadata.contract_number} />}
        {doc.metadata?.naics && <MetaField label="NAICS" value={doc.metadata.naics} />}
        {doc.metadata?.period_of_performance && <MetaField label="PoP" value={doc.metadata.period_of_performance} />}
        {doc.metadata?.solicitation_number && <MetaField label="Solicitation" value={doc.metadata.solicitation_number} />}
        {doc.metadata?.author && <MetaField label="Author" value={doc.metadata.author} />}
      </div>

      {/* Tags */}
      {doc.tags?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {doc.tags?.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "rgba(59,130,246,0.1)",
                  color: "#3b82f6",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function UploadModal({ collections, onClose }: { collections: KnowledgeCollection[]; onClose: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("memo");
  const [action, setAction] = useState("store");
  const [collection, setCollection] = useState("col-contracts");
  const [tagsInput, setTagsInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    if (!selectedFile) return;
    setUploading(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    uploadDocument(selectedFile, docType, collection, tags, action)
      .then((env) => {
        if (env.success && env.data) {
          setResult(`Uploaded: ${env.data.message}${env.data.download_url ? `\nDownload: ${env.data.download_url}` : ""}`);
        } else {
          setResult(`Upload failed: ${env.error?.message ?? "Unknown error"}`);
        }
      })
      .catch((err: Error) => setResult(`Upload failed: ${err.message}`))
      .finally(() => setUploading(false));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg, #1a1a2e)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: 24,
          width: 480,
          maxWidth: "90vw",
        }}
      >
        <h3 style={{ margin: "0 0 16px" }}>Upload Document</h3>
        {!result ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#3b82f6" : "var(--color-border)"}`,
                borderRadius: 8,
                padding: 24,
                textAlign: "center",
                cursor: "pointer",
                marginBottom: 12,
                background: dragOver ? "rgba(59,130,246,0.05)" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.pptx,.md,.png,.jpg,.jpeg,.gif"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedFile(file);
                }}
              />
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{formatFileSize(selectedFile.size)} &middot; {selectedFile.type || "unknown type"}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Drop a file here or click to browse</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>PDF, DOC, DOCX, TXT, CSV, XLSX, MD, images (max 50 MB)</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Type</label>
                <select value={docType} onChange={(e) => { setDocType(e.target.value); if (e.target.value === "financials") setAction("ingest_financials"); else if (e.target.value === "rfp") setAction("shred_rfp"); else if (e.target.value === "past_performance" || e.target.value === "cpars") setAction("ingest_past_perf"); else setAction("store"); }} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Collection</label>
                <select value={collection} onChange={(e) => setCollection(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>What should GDA do with this file?</label>
              <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4, fontStyle: "italic" }}>
                {ACTION_LABELS[action]?.description}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Tags (comma-separated)</label>
              <input
                type="text"
                placeholder="Army, SETA, cybersecurity"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: !selectedFile || uploading ? 0.5 : 1 }}
              >
                {uploading ? "Uploading..." : ACTION_LABELS[action]?.label ?? "Upload"}
              </button>
            </div>
          </>
        ) : (
          <div>
            <pre style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: 16, fontSize: 12, whiteSpace: "pre-wrap", color: "#22c55e" }}>
              {result}
            </pre>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections Tab
// ---------------------------------------------------------------------------

function CollectionsTab() {
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKnowledgeCollections()
      .then((env) => {
        if (env.success && env.data) setCollections(env.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Loading collections...</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
      {collections.map((col) => (
        <div
          key={col.id}
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>{col.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{col.name}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Updated {timeAgo(col.last_updated)}</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
            {col.description}
          </p>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Documents: </span>
              <span style={{ fontWeight: 600, color: "#3b82f6" }}>{col.document_count}</span>
            </div>
            <div>
              <span style={{ color: "var(--color-text-muted)" }}>Chunks: </span>
              <span style={{ fontWeight: 600, color: "#8b5cf6" }}>{(col.total_chunks ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search Tab
// ---------------------------------------------------------------------------

function SearchTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchSource, setSearchSource] = useState<"pgvector" | "db" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    searchKnowledge(query.trim())
      .then((env) => {
        if (env.success && env.data) {
          setResults(env.data.results);
          setSearchSource(env.data.source ?? null);
        }
      })
      .catch(() => { setResults([]); setSearchSource(null); })
      .finally(() => setSearching(false));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search your knowledge base... (e.g., 'Army SETA past performance')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
          }}
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: "#8b5cf6",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            opacity: searching || !query.trim() ? 0.5 : 1,
          }}
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {!searched ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div>Enter a query to search across all indexed documents using semantic similarity</div>
          <div style={{ fontSize: 12, marginTop: 8, color: "var(--color-text-muted)" }}>
            Powered by pgvector cosine similarity (text-embedding-3-small)
          </div>
        </div>
      ) : searching ? (
        <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Searching...</p>
      ) : results.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No results found for "{query}"</p>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
            {results.length} results for "{query}"
            {searchSource && (
              <span style={{
                marginLeft: 8,
                padding: "2px 8px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: searchSource === "pgvector" ? "#7c3aed" : "#6b7280",
                color: "#fff",
              }}>
                {searchSource === "pgvector" ? "Vector Search" : "Keyword Fallback"}
              </span>
            )}
          </div>
          {results.map((r, i) => (
            <div
              key={r.document_id}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 16,
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600 }}>#{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.document_title}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11 }}>
                    <span style={{ padding: "1px 6px", borderRadius: 3, background: `${TYPE_COLORS[r.document_type] ?? "#6b7280"}18`, color: TYPE_COLORS[r.document_type] ?? "#6b7280", fontWeight: 500 }}>
                      {TYPE_LABELS[r.document_type] ?? r.document_type}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: r.relevance_score >= 0.7 ? "#22c55e" : r.relevance_score >= 0.5 ? "#f59e0b" : "#6b7280" }}>
                    {Math.round(r.relevance_score * 100)}%
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>relevance</div>
                </div>
              </div>

              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "8px 0", lineHeight: 1.5 }}>
                {r.highlight}
              </p>

              {/* Expand chunks */}
              <button
                onClick={() => setExpandedId(expandedId === r.document_id ? null : r.document_id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#3b82f6",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                }}
              >
                {expandedId === r.document_id ? "Hide chunks" : `View ${r.chunks.length} matching chunk${r.chunks.length === 1 ? "" : "s"}`}
              </button>

              {expandedId === r.document_id && (
                <div style={{ marginTop: 8 }}>
                  {r.chunks.map((chunk) => (
                    <div
                      key={chunk.chunk_id}
                      style={{
                        background: "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.2)",
                        borderRadius: 6,
                        padding: 10,
                        marginTop: 6,
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          {chunk.section && `${chunk.section} · `}
                          {chunk.page !== null ? `Page ${chunk.page}` : ""}
                        </span>
                        {chunk.similarity_score !== undefined && (
                          <span style={{ color: "#8b5cf6", fontWeight: 600 }}>
                            {(chunk.similarity_score * 100).toFixed(0)}% similarity
                          </span>
                        )}
                      </div>
                      <div style={{ color: "var(--color-text)" }}>{chunk.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Tab (RAG Assistant)
// ---------------------------------------------------------------------------

function ChatTab() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSessionDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChatSessions()
      .then((env) => {
        if (env.success && env.data) setSessions(env.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSession = (id: string) => {
    fetchChatSession(id)
      .then((env) => {
        if (env.success && env.data) {
          setActiveSession(env.data);
          setMessages(env.data.messages);
          setSessionId(env.data.id);
        }
      })
      .catch(() => {});
  };

  const handleSend = () => {
    if (!input.trim() || sending) return;
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    sendChatMessage(userMsg.content, sessionId ?? undefined)
      .then((env) => {
        if (env.success && env.data) {
          setSessionId(env.data.session_id);
          setMessages((prev) => [...prev, env.data!.message]);
        }
      })
      .catch((err) => {
        const isTimeout = (err as Error).name === "AbortError";
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-err-${Date.now()}`,
            role: "assistant",
            content: isTimeout
              ? "Request timed out. The AI service may be overloaded \u2014 please try again."
              : "Sorry, an error occurred. Please try again.",
            timestamp: new Date().toISOString(),
          },
        ]);
      })
      .finally(() => setSending(false));
  };

  const startNewChat = () => {
    setActiveSession(null);
    setMessages([]);
    setSessionId(null);
    setInput("");
  };

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 320px)" }}>
      {/* Session sidebar */}
      <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <button
          onClick={startNewChat}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: 8,
            border: "1px solid #8b5cf6",
            background: "rgba(139,92,246,0.1)",
            color: "#8b5cf6",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          + New Chat
        </button>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Previous Sessions
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => loadSession(s.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 4,
                background: activeSession?.id === s.id ? "rgba(139,92,246,0.1)" : "transparent",
                border: activeSession?.id === s.id ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                {s.message_count} messages · {timeAgo(s.created_at)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            background: "var(--color-surface)",
            borderRadius: "8px 8px 0 0",
            border: "1px solid var(--color-border)",
            borderBottom: "none",
          }}
        >
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>RAG Knowledge Assistant</div>
              <div style={{ fontSize: 13 }}>
                Ask questions about your past performance, proposals, compliance records, and capture plans.
              </div>
              <div style={{ fontSize: 12, marginTop: 12, color: "var(--color-text-muted)" }}>
                Try: "What past performance do we have for Army SETA work?"
              </div>
              <div style={{ fontSize: 11, marginTop: 4, color: "var(--color-text-muted)" }}>
                Powered by n8n (GDA.api.agentic-chat + GDA.api.rag-query)
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    background: msg.role === "user" ? "#3b82f6" : "rgba(139,92,246,0.1)",
                    color: msg.role === "user" ? "#fff" : "var(--color-text)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ maxWidth: "80%", marginTop: 6 }}>
                    <button
                      onClick={() => setExpandedSources(expandedSources === msg.id ? null : msg.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#8b5cf6",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      {expandedSources === msg.id ? "Hide" : "View"} {msg.sources.length} source{msg.sources.length === 1 ? "" : "s"}
                    </button>
                    {expandedSources === msg.id && (
                      <div style={{ marginTop: 6 }}>
                        {msg.sources.map((src, i) => (
                          <div
                            key={i}
                            style={{
                              background: "rgba(139,92,246,0.06)",
                              border: "1px solid rgba(139,92,246,0.15)",
                              borderRadius: 6,
                              padding: 8,
                              marginTop: 4,
                              fontSize: 11,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: "#8b5cf6" }}>{src.document_title}</span>
                              <span style={{ color: "var(--color-text-muted)" }}>
                                {src.page !== null && `p${src.page} · `}
                                {Math.round(src.relevance * 100)}%
                              </span>
                            </div>
                            <div style={{ color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                              {src.chunk_text.slice(0, 200)}...
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 12,
            background: "var(--color-surface)",
            borderRadius: "0 0 8px 8px",
            border: "1px solid var(--color-border)",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about your knowledge base..."
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg, #1a1a2e)",
              color: "var(--color-text)",
              fontSize: 13,
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#8b5cf6",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: sending || !input.trim() ? 0.5 : 1,
            }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Knowledge Page
// ---------------------------------------------------------------------------

type TabKey = "documents" | "search" | "collections" | "chat";

export default function Knowledge() {
  const [summary, setSummary] = useState<KnowledgeSummaryData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("documents");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKnowledgeSummary()
      .then((env) => {
        if (env.success && env.data) setSummary(env.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ margin: "0 0 8px" }}>Knowledge Base</h2>
        <p style={{ color: "var(--color-text-muted)" }}>Loading knowledge base...</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "documents", label: "Documents", count: summary?.total_documents },
    { key: "search", label: "Semantic Search" },
    { key: "collections", label: "Collections", count: summary?.collection_count },
    { key: "chat", label: "RAG Chat" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Knowledge Base</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
            Unified past performance, proposals, compliance, and capture plans — searchable by meaning
          </p>
        </div>
        <div style={{
          fontSize: 11,
          padding: "4px 10px",
          borderRadius: 6,
          background: "rgba(139,92,246,0.1)",
          color: "#8b5cf6",
          fontWeight: 600,
          border: "1px solid rgba(139,92,246,0.2)",
        }}>
          Live DB
        </div>
      </div>

      {summary && <SummaryStrip summary={summary} />}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)", marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #8b5cf6" : "2px solid transparent",
              background: "transparent",
              color: activeTab === tab.key ? "#8b5cf6" : "var(--color-text-muted)",
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "documents" && <DocumentsTab />}
      {activeTab === "search" && <SearchTab />}
      {activeTab === "collections" && <CollectionsTab />}
      {activeTab === "chat" && <ChatTab />}
    </div>
  );
}
