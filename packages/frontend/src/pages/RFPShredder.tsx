import { useEffect, useState, useRef } from "react";
import {
  fetchShredJobs,
  fetchShredRequirements,
  fetchComplianceMap,
  fetchResponseOutline,
  initiateShred,
  type ShredJobRow,
  type ShredJobsData,
  type ExtractedRequirementRow,
  type RequirementsData,
  type ComplianceMapData,
  type ComplianceMapEntryRow,
  type ResponseOutlineData,
  type ResponseOutlineSectionRow,
} from "../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  processing: "#3b82f6",
  failed: "#ef4444",
  queued: "#f59e0b",
};

const MATCH_COLORS: Record<string, string> = {
  full: "#22c55e",
  partial: "#f59e0b",
  none: "#ef4444",
};

const MATCH_LABELS: Record<string, string> = {
  full: "Full Match",
  partial: "Partial",
  none: "Gap",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "#22c55e",
  moderate: "#f59e0b",
  complex: "#ef4444",
};

const OUTLINE_STATUS_COLORS: Record<string, string> = {
  reuse_available: "#22c55e",
  draft_available: "#3b82f6",
  needs_new_content: "#ef4444",
};

const OUTLINE_STATUS_LABELS: Record<string, string> = {
  reuse_available: "Reuse Available",
  draft_available: "Draft Available",
  needs_new_content: "New Content Needed",
};

type Tab = "jobs" | "requirements" | "compliance" | "outline";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RFPShredder() {
  const [tab, setTab] = useState<Tab>("jobs");

  // Jobs
  const [jobsData, setJobsData] = useState<ShredJobsData | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<ShredJobRow | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState("");
  const [jobSearch, setJobSearch] = useState("");

  // Requirements
  const [reqData, setReqData] = useState<RequirementsData | null>(null);
  const [reqJobFilter, setReqJobFilter] = useState("");
  const [reqTypeFilter, setReqTypeFilter] = useState("");
  const [reqMatchFilter, setReqMatchFilter] = useState("");
  const [reqSearch, setReqSearch] = useState("");
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);

  // Compliance Map
  const [compMapData, setCompMapData] = useState<ComplianceMapData | null>(null);
  const [compJobId, setCompJobId] = useState("SJ-001");
  const [expandedCompId, setExpandedCompId] = useState<string | null>(null);

  // Response Outline
  const [outlineData, setOutlineData] = useState<ResponseOutlineData | null>(null);
  const [outlineJobId, setOutlineJobId] = useState("SJ-001");
  const [expandedOutlineId, setExpandedOutlineId] = useState<string | null>(null);

  // Shred modal
  const [showShredModal, setShowShredModal] = useState(false);
  const [shredFile, setShredFile] = useState<File | null>(null);
  const [shredDocText, setShredDocText] = useState("");
  const [shredTitle, setShredTitle] = useState("");
  const [shredAgency, setShredAgency] = useState("");
  const [shredResult, setShredResult] = useState<string | null>(null);
  const [shredError, setShredError] = useState<string | null>(null);
  const shredFileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [allCompletedJobs, setAllCompletedJobs] = useState<ShredJobRow[]>([]);

  // ---- Fetch all completed jobs (unfiltered, for dropdowns) ----
  useEffect(() => {
    fetchShredJobs({})
      .then((env) => {
        if (env.success && env.data)
          setAllCompletedJobs(env.data.jobs.filter((j) => j.status === "completed"));
      })
      .catch(() => {});
  }, []);

  // ---- Fetch jobs (filtered) ----
  useEffect(() => {
    setLoading(true);
    fetchShredJobs({ status: jobStatusFilter || undefined, search: jobSearch || undefined })
      .then((env) => {
        if (env.success && env.data) setJobsData(env.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobStatusFilter, jobSearch]);

  // ---- Select job detail ----
  useEffect(() => {
    if (!selectedJobId || !jobsData) return;
    const job = jobsData.jobs.find((j) => j.id === selectedJobId) ?? null;
    setSelectedJob(job);
  }, [selectedJobId, jobsData]);

  // ---- Fetch requirements ----
  useEffect(() => {
    if (tab !== "requirements") return;
    fetchShredRequirements({
      job_id: reqJobFilter || undefined,
      type: reqTypeFilter || undefined,
      match: reqMatchFilter || undefined,
      search: reqSearch || undefined,
    })
      .then((env) => {
        if (env.success && env.data) setReqData(env.data);
      })
      .catch(() => {});
  }, [tab, reqJobFilter, reqTypeFilter, reqMatchFilter, reqSearch]);

  // ---- Fetch compliance map ----
  useEffect(() => {
    if (tab !== "compliance") return;
    fetchComplianceMap(compJobId)
      .then((env) => {
        if (env.success && env.data) setCompMapData(env.data);
      })
      .catch(() => {});
  }, [tab, compJobId]);

  // ---- Fetch response outline ----
  useEffect(() => {
    if (tab !== "outline") return;
    fetchResponseOutline(outlineJobId)
      .then((env) => {
        if (env.success && env.data) setOutlineData(env.data);
      })
      .catch(() => {});
  }, [tab, outlineJobId]);

  // ---- Shred action ----
  function handleShred() {
    if (!shredTitle || (!shredFile && !shredDocText.trim())) return;
    setShredError(null);
    setShredResult(null);
    initiateShred(shredTitle, shredAgency || undefined, shredFile || undefined, shredDocText.trim() || undefined)
      .then((env) => {
        if (env.success && env.data) {
          setShredResult(`Job queued: ${env.data.correlation_id}\n${env.data.message}`);
        } else if (env.error) {
          setShredError(env.error.message);
        }
      })
      .catch((err) => setShredError(String(err)));
  }

  const summary = jobsData?.summary;

  // ---- Tabs ----
  const tabs: { key: Tab; label: string }[] = [
    { key: "jobs", label: `Shred Jobs${summary ? ` (${summary.total})` : ""}` },
    { key: "requirements", label: `Requirements${reqData ? ` (${reqData.summary.total})` : ""}` },
    { key: "compliance", label: "Compliance Map" },
    { key: "outline", label: "Response Outline" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>RFP Shredder</h1>
        <button
          onClick={() => { setShowShredModal(true); setShredResult(null); setShredError(null); }}
          style={{
            background: "#7c3aed",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Shred New RFP
        </button>
      </div>

      {/* Summary strip */}
      {summary && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
          marginBottom: 20,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: 16,
        }}>
          {[
            { label: "Total Jobs", value: summary.total, color: "var(--color-text)" },
            { label: "Completed", value: summary.completed, color: "#22c55e" },
            { label: "Processing", value: summary.processing, color: "#3b82f6" },
            { label: "Failed", value: summary.failed, color: summary.failed > 0 ? "#ef4444" : "var(--color-text)" },
            { label: "Requirements", value: summary.total_requirements, color: "#8b5cf6" },
            { label: "Pages Parsed", value: summary.total_pages, color: "var(--color-text)" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 18px",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #7c3aed" : "2px solid transparent",
              background: "transparent",
              color: tab === t.key ? "#7c3aed" : "var(--color-text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "jobs" && <JobsTab
        jobsData={jobsData}
        loading={loading}
        selectedJobId={selectedJobId}
        selectedJob={selectedJob}
        onSelectJob={setSelectedJobId}
        statusFilter={jobStatusFilter}
        onStatusFilter={setJobStatusFilter}
        search={jobSearch}
        onSearch={setJobSearch}
        onViewRequirements={(jobId) => { setReqJobFilter(jobId); setTab("requirements"); }}
        onViewCompliance={(jobId) => { setCompJobId(jobId); setTab("compliance"); }}
        onViewOutline={(jobId) => { setOutlineJobId(jobId); setTab("outline"); }}
      />}
      {tab === "requirements" && <RequirementsTab
        data={reqData}
        jobFilter={reqJobFilter}
        onJobFilter={setReqJobFilter}
        typeFilter={reqTypeFilter}
        onTypeFilter={setReqTypeFilter}
        matchFilter={reqMatchFilter}
        onMatchFilter={setReqMatchFilter}
        search={reqSearch}
        onSearch={setReqSearch}
        expandedId={expandedReqId}
        onToggleExpand={(id) => setExpandedReqId(expandedReqId === id ? null : id)}
      />}
      {tab === "compliance" && <ComplianceMapTab
        data={compMapData}
        jobId={compJobId}
        onJobChange={setCompJobId}
        expandedId={expandedCompId}
        onToggleExpand={(id) => setExpandedCompId(expandedCompId === id ? null : id)}
        completedJobs={allCompletedJobs}
      />}
      {tab === "outline" && <ResponseOutlineTab
        data={outlineData}
        jobId={outlineJobId}
        onJobChange={setOutlineJobId}
        expandedId={expandedOutlineId}
        onToggleExpand={(id) => setExpandedOutlineId(expandedOutlineId === id ? null : id)}
        completedJobs={allCompletedJobs}
      />}

      {/* Shred Modal */}
      {showShredModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowShredModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--color-surface)", borderRadius: 12, padding: 24,
            width: 520, maxWidth: "90vw", border: "1px solid var(--color-border)",
          }}>
            <h3 style={{ margin: "0 0 16px" }}>Shred New RFP</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Solicitation Title *</label>
                <input value={shredTitle} onChange={(e) => setShredTitle(e.target.value)}
                  placeholder="e.g., Army SETA Support Services IDIQ"
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", marginTop: 4, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>RFP Document (PDF, DOCX, XLSX, PPTX, DOC, TXT, CSV)</label>
                <div
                  onClick={() => shredFileRef.current?.click()}
                  style={{
                    border: "2px dashed var(--color-border)",
                    borderRadius: 8,
                    padding: 16,
                    textAlign: "center",
                    cursor: "pointer",
                    marginTop: 4,
                  }}
                >
                  <input
                    ref={shredFileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xlsx,.xls,.pptx,.txt,.csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setShredFile(f);
                    }}
                  />
                  {shredFile ? (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{shredFile.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {shredFile.size >= 1_000_000 ? `${(shredFile.size / 1_000_000).toFixed(1)} MB` : `${(shredFile.size / 1_000).toFixed(0)} KB`}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Click to select an RFP document</div>
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Or Paste Document Text</label>
                <textarea
                  value={shredDocText}
                  onChange={(e) => setShredDocText(e.target.value)}
                  placeholder="Paste the full solicitation text here for AI extraction..."
                  rows={4}
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", marginTop: 4, fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Agency</label>
                <input value={shredAgency} onChange={(e) => setShredAgency(e.target.value)}
                  placeholder="e.g., US Army Corps of Engineers"
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", marginTop: 4, boxSizing: "border-box" }} />
              </div>
              {shredResult && (
                <div style={{ padding: 12, background: "#22c55e15", border: "1px solid #22c55e40", borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>{shredResult}</div>
              )}
              {shredError && (
                <div style={{ padding: 12, background: "#ef444415", border: "1px solid #ef444440", borderRadius: 8, fontSize: 13, color: "#ef4444" }}>{shredError}</div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => setShowShredModal(false)} style={{ padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, background: "transparent", color: "var(--color-text)", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleShred} disabled={!shredTitle || (!shredFile && !shredDocText.trim())} style={{
                  padding: "8px 16px", border: "none", borderRadius: 6,
                  background: (!shredTitle || (!shredFile && !shredDocText.trim())) ? "#6b7280" : "#7c3aed",
                  color: "#fff", cursor: (!shredTitle || (!shredFile && !shredDocText.trim())) ? "not-allowed" : "pointer", fontWeight: 600,
                }}>Shred RFP</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jobs Tab
// ---------------------------------------------------------------------------

function JobsTab({
  jobsData, loading, selectedJobId, selectedJob, onSelectJob,
  statusFilter, onStatusFilter, search, onSearch,
  onViewRequirements, onViewCompliance, onViewOutline,
}: {
  jobsData: ShredJobsData | null;
  loading: boolean;
  selectedJobId: string | null;
  selectedJob: ShredJobRow | null;
  onSelectJob: (id: string | null) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  onViewRequirements: (jobId: string) => void;
  onViewCompliance: (jobId: string) => void;
  onViewOutline: (jobId: string) => void;
}) {
  const jobs = jobsData?.jobs ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: selectedJob ? "1fr 1fr" : "1fr", gap: 20 }}>
      {/* Job list */}
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder="Search solicitations..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilter(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
          >
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </select>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>Loading...</div>}

        {!loading && jobs.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>No shred jobs found</div>
        )}

        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => onSelectJob(selectedJobId === job.id ? null : job.id)}
            style={{
              padding: 14,
              marginBottom: 8,
              borderRadius: 8,
              border: `1px solid ${selectedJobId === job.id ? "#7c3aed" : "var(--color-border)"}`,
              background: selectedJobId === job.id ? "#7c3aed10" : "var(--color-surface)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{job.solicitation_title}</span>
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: `${STATUS_COLORS[job.status]}20`,
                color: STATUS_COLORS[job.status],
              }}>{job.status}</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--color-text-muted)" }}>
              <span>{job.agency}</span>
              <span>{job.page_count} pages</span>
              <span>{formatBytes(job.file_size_bytes)}</span>
              {job.status === "completed" && <span style={{ color: "#7c3aed", fontWeight: 600 }}>{job.requirements_found} requirements</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Job detail panel */}
      {selectedJob && (
        <div style={{
          padding: 20,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          height: "fit-content",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{selectedJob.solicitation_title}</h3>
            <span style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              background: `${STATUS_COLORS[selectedJob.status]}20`,
              color: STATUS_COLORS[selectedJob.status],
            }}>{selectedJob.status}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, marginBottom: 16 }}>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Agency</div>
              <div>{selectedJob.agency}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>File</div>
              <div style={{ wordBreak: "break-all" }}>{selectedJob.file_name}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Pages</div>
              <div>{selectedJob.page_count}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>File Size</div>
              <div>{formatBytes(selectedJob.file_size_bytes)}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Requirements Found</div>
              <div style={{ fontWeight: 700, color: "#7c3aed" }}>{selectedJob.requirements_found}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Processing Time</div>
              <div>{selectedJob.processing_time_seconds ? formatDuration(selectedJob.processing_time_seconds) : "—"}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Started</div>
              <div>{timeAgo(selectedJob.started_at)}</div>
            </div>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 2 }}>Correlation ID</div>
              <div style={{ fontFamily: "monospace", fontSize: 11 }}>{selectedJob.correlation_id}</div>
            </div>
          </div>

          {/* Sections parsed */}
          {selectedJob.sections_parsed.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sections Parsed</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedJob.sections_parsed.map((s) => (
                  <span key={s} style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: 11,
                    background: "#7c3aed15", color: "#7c3aed", fontWeight: 600,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {selectedJob.error_message && (
            <div style={{
              padding: 12, borderRadius: 8, fontSize: 13,
              background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444",
              marginBottom: 16,
            }}>
              {selectedJob.error_message}
            </div>
          )}

          {/* Action buttons */}
          {selectedJob.status === "completed" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => onViewRequirements(selectedJob.id)} style={{
                padding: "8px 14px", borderRadius: 6, border: "none",
                background: "#7c3aed", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>View Requirements</button>
              <button onClick={() => onViewCompliance(selectedJob.id)} style={{
                padding: "8px 14px", borderRadius: 6, border: "1px solid #7c3aed",
                background: "transparent", color: "#7c3aed", cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>Compliance Map</button>
              <button onClick={() => onViewOutline(selectedJob.id)} style={{
                padding: "8px 14px", borderRadius: 6, border: "1px solid #7c3aed",
                background: "transparent", color: "#7c3aed", cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>Response Outline</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirements Tab
// ---------------------------------------------------------------------------

function RequirementsTab({
  data, jobFilter, onJobFilter, typeFilter, onTypeFilter,
  matchFilter, onMatchFilter, search, onSearch,
  expandedId, onToggleExpand,
}: {
  data: RequirementsData | null;
  jobFilter: string;
  onJobFilter: (v: string) => void;
  typeFilter: string;
  onTypeFilter: (v: string) => void;
  matchFilter: string;
  onMatchFilter: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const reqs = data?.requirements ?? [];
  const summary = data?.summary;

  return (
    <div>
      {/* Summary bar */}
      {summary && (
        <div style={{
          display: "flex", gap: 20, marginBottom: 16, padding: 12,
          background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.total}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Total</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{summary.full_match}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Full Match</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{summary.partial_match}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Partial</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{summary.no_match}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Gaps</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(summary.avg_confidence * 100)}%</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Avg Confidence</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Search requirements..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
        />
        <select value={jobFilter} onChange={(e) => onJobFilter(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}>
          <option value="">All Jobs</option>
          <option value="SJ-001">SJ-001: PEO IEW&S SETA</option>
          <option value="SJ-002">SJ-002: DEVCOM C5ISR</option>
        </select>
        <select value={typeFilter} onChange={(e) => onTypeFilter(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}>
          <option value="">All Types</option>
          <option value="technical">Technical</option>
          <option value="management">Management</option>
          <option value="past_performance">Past Performance</option>
          <option value="cost_price">Cost/Price</option>
          <option value="security">Security</option>
          <option value="compliance">Compliance</option>
          <option value="certifications">Certifications</option>
          <option value="staffing">Staffing</option>
          <option value="transition">Transition</option>
          <option value="small_business">Small Business</option>
        </select>
        <select value={matchFilter} onChange={(e) => onMatchFilter(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}>
          <option value="">All Match Levels</option>
          <option value="full">Full Match</option>
          <option value="partial">Partial</option>
          <option value="none">Gap</option>
        </select>
        {(jobFilter || typeFilter || matchFilter || search) && (
          <button onClick={() => { onJobFilter(""); onTypeFilter(""); onMatchFilter(""); onSearch(""); }}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text)", cursor: "pointer", fontSize: 12 }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Requirements list */}
      {reqs.map((req) => (
        <div key={req.id} style={{
          marginBottom: 6,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-surface)",
          overflow: "hidden",
        }}>
          <div
            onClick={() => onToggleExpand(req.id)}
            style={{
              padding: "12px 14px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--color-text-muted)" }}>{req.section}</span>
                <span style={{
                  padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: `${MATCH_COLORS[req.compliance_match]}20`,
                  color: MATCH_COLORS[req.compliance_match],
                }}>{MATCH_LABELS[req.compliance_match]}</span>
                <span style={{
                  padding: "1px 6px", borderRadius: 8, fontSize: 10,
                  background: `${COMPLEXITY_COLORS[req.complexity]}20`,
                  color: COMPLEXITY_COLORS[req.complexity],
                }}>{req.complexity}</span>
                <span style={{
                  padding: "1px 6px", borderRadius: 8, fontSize: 10,
                  background: "#7c3aed15", color: "#7c3aed",
                }}>{req.requirement_type.replace(/_/g, " ")}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#3b82f6" }}>{req.keyword}</span>{" "}
                {req.requirement_text.replace(/^.*?(SHALL|MUST|WILL)\s*/i, "")}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{Math.round(req.confidence * 100)}%</div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>confidence</div>
            </div>
          </div>

          {expandedId === req.id && (
            <div style={{
              padding: "0 14px 14px",
              borderTop: "1px solid var(--color-border)",
              paddingTop: 12,
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ color: "var(--color-text-muted)", marginBottom: 2 }}>Page</div>
                  <div>p. {req.page_number}</div>
                </div>
                <div>
                  <div style={{ color: "var(--color-text-muted)", marginBottom: 2 }}>FAR References</div>
                  <div>{req.far_references.length > 0 ? req.far_references.join(", ") : "—"}</div>
                </div>
              </div>

              {req.matched_evidence && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Matched Evidence</div>
                  <div style={{
                    padding: 10, borderRadius: 6, fontSize: 12,
                    background: `${MATCH_COLORS[req.compliance_match]}10`,
                    border: `1px solid ${MATCH_COLORS[req.compliance_match]}30`,
                  }}>{req.matched_evidence}</div>
                </div>
              )}

              {req.matched_document_title && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Source Document</div>
                  <div style={{
                    padding: 8, borderRadius: 6, fontSize: 12,
                    background: "#3b82f610", border: "1px solid #3b82f630",
                    color: "#3b82f6",
                  }}>{req.matched_document_title}</div>
                </div>
              )}

              {!req.matched_evidence && (
                <div style={{
                  padding: 10, borderRadius: 6, fontSize: 12,
                  background: "#ef444410", border: "1px solid #ef444430",
                  color: "#ef4444",
                }}>No existing compliance record found. New content must be developed.</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Map Tab
// ---------------------------------------------------------------------------

function ComplianceMapTab({
  data, jobId, onJobChange, expandedId, onToggleExpand, completedJobs,
}: {
  data: ComplianceMapData | null;
  jobId: string;
  onJobChange: (v: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  completedJobs: ShredJobRow[];
}) {
  const entries = data?.entries ?? [];
  const summary = data?.summary;

  return (
    <div>
      {/* Job selector */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Solicitation:</label>
        <select value={jobId} onChange={(e) => onJobChange(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", flex: 1, maxWidth: 400 }}>
          {completedJobs.map((j) => (
            <option key={j.id} value={j.id}>{j.solicitation_title}</option>
          ))}
        </select>
      </div>

      {/* Coverage summary */}
      {summary && (
        <div style={{
          display: "flex", gap: 20, marginBottom: 16, padding: 16,
          background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10,
          alignItems: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 32, fontWeight: 700,
              color: summary.coverage_score >= 80 ? "#22c55e" : summary.coverage_score >= 60 ? "#f59e0b" : "#ef4444",
            }}>{summary.coverage_score}%</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Coverage Score</div>
          </div>
          <div style={{ flex: 1, display: "flex", gap: 16, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{summary.full_match}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Full Match</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{summary.partial_match}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Partial</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{summary.no_match}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Gaps</div>
            </div>
          </div>
          {/* Visual bar */}
          <div style={{ width: 200 }}>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
              {summary.full_match > 0 && <div style={{ flex: summary.full_match, background: "#22c55e" }} />}
              {summary.partial_match > 0 && <div style={{ flex: summary.partial_match, background: "#f59e0b" }} />}
              {summary.no_match > 0 && <div style={{ flex: summary.no_match, background: "#ef4444" }} />}
            </div>
          </div>
        </div>
      )}

      {/* Entries */}
      {entries.map((entry) => (
        <div key={entry.requirement_id} style={{
          marginBottom: 6,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-surface)",
          overflow: "hidden",
        }}>
          <div
            onClick={() => onToggleExpand(entry.requirement_id)}
            style={{
              padding: "12px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderLeft: `4px solid ${MATCH_COLORS[entry.match_level]}`,
            }}
          >
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--color-text-muted)", width: 40 }}>{entry.section}</span>
            <span style={{
              padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600, flexShrink: 0,
              background: `${MATCH_COLORS[entry.match_level]}20`,
              color: MATCH_COLORS[entry.match_level],
            }}>{MATCH_LABELS[entry.match_level]}</span>
            <span style={{ fontSize: 13, flex: 1 }}>{entry.requirement_text.slice(0, 120)}{entry.requirement_text.length > 120 ? "..." : ""}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>
              {entry.matched_records.length} source{entry.matched_records.length !== 1 ? "s" : ""}
            </span>
          </div>

          {expandedId === entry.requirement_id && (
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 12 }}>{entry.requirement_text}</div>

              {entry.matched_records.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Matched Records</div>
                  {entry.matched_records.map((rec, i) => (
                    <div key={i} style={{
                      padding: 10, marginBottom: 6, borderRadius: 6,
                      background: "#22c55e08", border: "1px solid #22c55e30",
                      fontSize: 12,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: "#3b82f6" }}>{rec.document_title}</span>
                        <span style={{ color: "#22c55e", fontWeight: 600 }}>{Math.round(rec.relevance * 100)}%</span>
                      </div>
                      <div style={{ color: "var(--color-text-muted)" }}>{rec.excerpt}</div>
                    </div>
                  ))}
                </div>
              )}

              {entry.gap_notes && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Gap Notes</div>
                  <div style={{
                    padding: 10, borderRadius: 6, fontSize: 12,
                    background: entry.match_level === "none" ? "#ef444410" : "#f59e0b10",
                    border: `1px solid ${entry.match_level === "none" ? "#ef444430" : "#f59e0b30"}`,
                  }}>{entry.gap_notes}</div>
                </div>
              )}

              {entry.suggested_approach && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Suggested Approach</div>
                  <div style={{
                    padding: 10, borderRadius: 6, fontSize: 12,
                    background: "#3b82f610", border: "1px solid #3b82f630",
                  }}>{entry.suggested_approach}</div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Response Outline Tab
// ---------------------------------------------------------------------------

function ResponseOutlineTab({
  data, jobId, onJobChange, expandedId, onToggleExpand, completedJobs,
}: {
  data: ResponseOutlineData | null;
  jobId: string;
  onJobChange: (v: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  completedJobs: ShredJobRow[];
}) {
  const sections = data?.sections ?? [];
  const summary = data?.summary;

  return (
    <div>
      {/* Job selector */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Solicitation:</label>
        <select value={jobId} onChange={(e) => onJobChange(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", flex: 1, maxWidth: 400 }}>
          {completedJobs.map((j) => (
            <option key={j.id} value={j.id}>{j.solicitation_title}</option>
          ))}
        </select>
      </div>

      {/* Outline summary */}
      {summary && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12, marginBottom: 16, padding: 16,
          background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total_sections}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Sections</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total_page_estimate}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Est. Pages</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>{summary.reuse_available}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Reusable</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#3b82f6" }}>{summary.draft_available}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Drafts</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#ef4444" }}>{summary.needs_new_content}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>New Content</div>
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map((sec) => (
        <div key={sec.id} style={{
          marginBottom: 6,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-surface)",
          overflow: "hidden",
        }}>
          <div
            onClick={() => onToggleExpand(sec.id)}
            style={{
              padding: "12px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderLeft: `4px solid ${OUTLINE_STATUS_COLORS[sec.status]}`,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 13, width: 36, flexShrink: 0 }}>{sec.section_number}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{sec.title}</span>
            <span style={{
              padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600,
              background: `${OUTLINE_STATUS_COLORS[sec.status]}20`,
              color: OUTLINE_STATUS_COLORS[sec.status],
            }}>{OUTLINE_STATUS_LABELS[sec.status]}</span>
            <span style={{
              padding: "2px 8px", borderRadius: 8, fontSize: 10,
              background: `${COMPLEXITY_COLORS[sec.complexity]}20`,
              color: COMPLEXITY_COLORS[sec.complexity],
            }}>{sec.complexity}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>{sec.page_estimate} pg</span>
          </div>

          {expandedId === sec.id && (
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Recommended Approach</div>
                <div style={{
                  padding: 10, borderRadius: 6, fontSize: 12,
                  background: "#3b82f610", border: "1px solid #3b82f630",
                }}>{sec.recommended_approach}</div>
              </div>

              {sec.requirements_covered.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Requirements Covered</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {sec.requirements_covered.map((rid) => (
                      <span key={rid} style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 11,
                        background: "#7c3aed15", color: "#7c3aed", fontFamily: "monospace",
                      }}>{rid}</span>
                    ))}
                  </div>
                </div>
              )}

              {sec.past_performance_citations.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Past Performance Citations</div>
                  {sec.past_performance_citations.map((cite, i) => (
                    <div key={i} style={{
                      padding: 8, marginBottom: 4, borderRadius: 6, fontSize: 12,
                      background: "#22c55e08", border: "1px solid #22c55e30",
                      color: "#3b82f6",
                    }}>{cite}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
