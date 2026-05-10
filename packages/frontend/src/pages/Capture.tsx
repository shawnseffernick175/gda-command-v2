import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types (matching backend response shapes)
// ---------------------------------------------------------------------------

interface GDAEnvelope<T> {
  success: boolean;
  workflow: string;
  action: string;
  dryRun: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: { code: string; message: string; detail: string | null } | null;
}

interface TeamingPartner {
  name: string;
  role: "prime" | "sub" | "mentor" | "jv_partner";
  capability: string;
  status: "confirmed" | "negotiating" | "identified";
  past_performance_score: number | null;
}

interface CaptureMilestone {
  id: string;
  title: string;
  due_date: string;
  status: "completed" | "on_track" | "at_risk" | "overdue";
  owner: string;
  notes: string | null;
}

interface CaptureGateReview {
  gate: string;
  status: "passed" | "failed" | "pending" | "waived";
  reviewer: string;
  reviewed_at: string | null;
  notes: string | null;
}

interface CaptureRisk {
  description: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

interface CapturePlan {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  agency: string;
  phase: string;
  pwin: number;
  value_estimated: number;
  capture_manager: string;
  bid_decision: "bid" | "no_bid" | "pending";
  teaming_partners: TeamingPartner[];
  milestones: CaptureMilestone[];
  gate_reviews: CaptureGateReview[];
  win_themes: string[];
  discriminators: string[];
  risks: CaptureRisk[];
  created_at: string;
  updated_at: string;
}

interface CaptureActivity {
  id: string;
  capture_plan_id: string;
  opportunity_title: string;
  activity_type: string;
  description: string;
  performed_by: string;
  performed_at: string;
  outcome: string | null;
}

interface UpcomingMilestone {
  id: string;
  title: string;
  due_date: string;
  status: string;
  owner: string;
  notes: string | null;
}

interface PlansData {
  plans: CapturePlan[];
  total: number;
  filtered: number;
  totalValue: number;
  avgPwin: number;
  phases: Record<string, number>;
  decisions: Record<string, number>;
  atRiskMilestones: number;
  upcomingMilestones: UpcomingMilestone[];
  source: string;
}

interface ActivitiesData {
  activities: CaptureActivity[];
  total: number;
  filtered: number;
  returned: number;
  typeCounts: Record<string, number>;
  source: string;
}

interface GateReviewResult {
  capture_plan_id: string;
  opportunity_title: string;
  gate: string;
  correlationId: string;
  overallStatus: "approved" | "conditional" | "blocked";
  checks: { name: string; status: "pass" | "warn" | "fail"; message: string }[];
  passed: number;
  total: number;
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`http://localhost:3001${path}`, init);
    const env: GDAEnvelope<T> = await r.json();
    return env.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(iso: string): string {
  const safe = iso.length === 10 ? `${iso}T12:00:00` : iso;
  return new Date(safe).toLocaleDateString("en-US", {
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

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    pre_rfp: "Pre-RFP",
    rfp_released: "RFP Released",
    proposal_prep: "Proposal Prep",
    submitted: "Submitted",
    evaluation: "Evaluation",
    awarded: "Awarded",
  };
  return labels[phase] ?? phase;
}

function phaseColor(phase: string): string {
  const colors: Record<string, string> = {
    pre_rfp: "#6b7280",
    rfp_released: "#f59e0b",
    proposal_prep: "#3b82f6",
    submitted: "#8b5cf6",
    evaluation: "#ec4899",
    awarded: "#10b981",
  };
  return colors[phase] ?? "#6b7280";
}

function bidColor(decision: string): string {
  if (decision === "bid") return "#10b981";
  if (decision === "no_bid") return "#ef4444";
  return "#f59e0b";
}

function milestoneStatusColor(status: string): string {
  const colors: Record<string, string> = {
    completed: "#10b981",
    on_track: "#3b82f6",
    at_risk: "#f59e0b",
    overdue: "#ef4444",
  };
  return colors[status] ?? "#6b7280";
}

function gateStatusColor(status: string): string {
  const colors: Record<string, string> = {
    passed: "#10b981",
    failed: "#ef4444",
    pending: "#f59e0b",
    waived: "#6b7280",
  };
  return colors[status] ?? "#6b7280";
}

function partnerRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    prime: "Prime",
    sub: "Sub",
    mentor: "Mentor",
    jv_partner: "JV Partner",
  };
  return labels[role] ?? role;
}

function partnerStatusColor(status: string): string {
  const colors: Record<string, string> = {
    confirmed: "#10b981",
    negotiating: "#f59e0b",
    identified: "#6b7280",
  };
  return colors[status] ?? "#6b7280";
}

function riskColor(level: string): string {
  if (level === "high") return "#ef4444";
  if (level === "medium") return "#f59e0b";
  return "#10b981";
}

function activityIcon(type: string): string {
  const icons: Record<string, string> = {
    meeting: "\u{1F91D}",
    call: "\u{1F4DE}",
    email: "\u{2709}\uFE0F",
    site_visit: "\u{1F3D7}\uFE0F",
    research: "\u{1F50D}",
    gate_review: "\u{2705}",
    teaming_discussion: "\u{1F465}",
    proposal_work: "\u{1F4DD}",
  };
  return icons[type] ?? "\u{1F4CB}";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Tab = "plans" | "activity" | "milestones";

export default function Capture() {
  const [tab, setTab] = useState<Tab>("plans");
  const [plansData, setPlansData] = useState<PlansData | null>(null);
  const [activitiesData, setActivitiesData] = useState<ActivitiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  // Gate review modal state
  const [gateModal, setGateModal] = useState<{
    planId: string;
    gate: string;
  } | null>(null);
  const [gateResult, setGateResult] = useState<GateReviewResult | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (phaseFilter) params.set("phase", phaseFilter);
    if (search) params.set("search", search);

    const fetchPlans = fetchJson<PlansData>(`/api/capture/plans?${params}`);
    const fetchActivities = fetchJson<ActivitiesData>(
      `/api/capture/activities?${activityTypeFilter ? `type=${activityTypeFilter}` : ""}`
    );

    Promise.all([fetchPlans, fetchActivities]).then(([p, a]) => {
      setPlansData(p);
      setActivitiesData(a);
      setLoading(false);
    });
  }, [phaseFilter, search, activityTypeFilter]);

  async function runGateReview(planId: string, gate: string) {
    setGateLoading(true);
    const result = await fetchJson<GateReviewResult>("/api/capture/gate-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capture_plan_id: planId, gate }),
    });
    setGateResult(result);
    setGateLoading(false);
  }

  const plans = plansData?.plans ?? [];
  const activities = activitiesData?.activities ?? [];

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
        Capture Planner
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 16, fontSize: 14 }}>
        Capture plans, BD activities, milestones, gate reviews, and teaming management.
      </p>

      {plansData?.source === "mock" && (
        <span
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(251,191,36,0.15)",
            color: "#fbbf24",
            marginBottom: 16,
          }}
        >
          Mock data
        </span>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
        {(["plans", "activity", "milestones"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
              background: tab === t ? "rgba(59,130,246,0.1)" : "transparent",
            }}
          >
            {t === "plans" ? "Capture Plans" : t === "activity" ? "Activity Log" : "Milestones"}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Loading...</p>
      ) : tab === "plans" ? (
        <PlansTab
          plansData={plansData}
          plans={plans}
          phaseFilter={phaseFilter}
          setPhaseFilter={setPhaseFilter}
          search={search}
          setSearch={setSearch}
          expandedPlan={expandedPlan}
          setExpandedPlan={setExpandedPlan}
          expandedSection={expandedSection}
          setExpandedSection={setExpandedSection}
          onGateReview={(planId, gate) => {
            setGateModal({ planId, gate });
            setGateResult(null);
            runGateReview(planId, gate);
          }}
        />
      ) : tab === "activity" ? (
        <ActivityTab
          activitiesData={activitiesData}
          activities={activities}
          activityTypeFilter={activityTypeFilter}
          setActivityTypeFilter={setActivityTypeFilter}
        />
      ) : (
        <MilestonesTab plansData={plansData} plans={plans} />
      )}

      {/* Gate Review Modal */}
      {gateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setGateModal(null)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 560,
              width: "90%",
              border: "1px solid var(--color-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              Gate Review (Dry Run)
            </h3>
            {gateLoading ? (
              <p style={{ color: "var(--color-text-muted)" }}>Running gate checks...</p>
            ) : gateResult ? (
              <div>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  {gateResult.opportunity_title}
                </p>
                <p style={{ fontSize: 13, marginBottom: 4 }}>
                  <strong>{gateResult.gate}</strong>
                </p>
                <div
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 16,
                    background:
                      gateResult.overallStatus === "approved"
                        ? "rgba(16,185,129,0.15)"
                        : gateResult.overallStatus === "conditional"
                        ? "rgba(245,158,11,0.15)"
                        : "rgba(239,68,68,0.15)",
                    color:
                      gateResult.overallStatus === "approved"
                        ? "#10b981"
                        : gateResult.overallStatus === "conditional"
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                >
                  {gateResult.overallStatus.toUpperCase()} ({gateResult.passed}/
                  {gateResult.total} passed)
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {gateResult.checks.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "var(--color-bg)",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            c.status === "pass"
                              ? "#10b981"
                              : c.status === "warn"
                              ? "#f59e0b"
                              : "#ef4444",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-muted)",
                            marginLeft: 8,
                          }}
                        >
                          {c.message}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          color:
                            c.status === "pass"
                              ? "#10b981"
                              : c.status === "warn"
                              ? "#f59e0b"
                              : "#ef4444",
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  Correlation ID: {gateResult.correlationId}
                </p>
              </div>
            ) : null}
            <button
              onClick={() => setGateModal(null)}
              style={{
                marginTop: 16,
                padding: "8px 20px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "transparent",
                color: "var(--color-text)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plans Tab
// ---------------------------------------------------------------------------

function PlansTab({
  plansData,
  plans,
  phaseFilter,
  setPhaseFilter,
  search,
  setSearch,
  expandedPlan,
  setExpandedPlan,
  expandedSection,
  setExpandedSection,
  onGateReview,
}: {
  plansData: PlansData | null;
  plans: CapturePlan[];
  phaseFilter: string;
  setPhaseFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  expandedPlan: string | null;
  setExpandedPlan: (v: string | null) => void;
  expandedSection: string | null;
  setExpandedSection: (v: string | null) => void;
  onGateReview: (planId: string, gate: string) => void;
}) {
  if (!plansData) return null;

  return (
    <>
      {/* Summary strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard label="Active Plans" value={String(plansData.total)} />
        <StatCard label="Total Value" value={fmtCurrency(plansData.totalValue)} />
        <StatCard label="Avg Pwin" value={`${plansData.avgPwin}%`} />
        <StatCard label="Bid Decisions" value={String(plansData.decisions["bid"] ?? 0)} sub="bid" />
        <StatCard label="Pending" value={String(plansData.decisions["pending"] ?? 0)} sub="pending" />
        <StatCard
          label="At-Risk Milestones"
          value={String(plansData.atRiskMilestones)}
          color={plansData.atRiskMilestones > 0 ? "#f59e0b" : undefined}
        />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Search plans..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            minWidth: 180,
          }}
        />
        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Phases</option>
          {Object.entries(plansData.phases).map(([phase, count]) => (
            <option key={phase} value={phase}>
              {phaseLabel(phase)} ({count})
            </option>
          ))}
        </select>
      </div>

      {/* Plan cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {plans.map((plan) => {
          const isExpanded = expandedPlan === plan.id;
          return (
            <div
              key={plan.id}
              style={{
                background: "var(--color-surface)",
                borderRadius: 8,
                border: `1px solid ${isExpanded ? "var(--color-primary)" : "var(--color-border)"}`,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                style={{
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${phaseColor(plan.phase)}22`,
                    color: phaseColor(plan.phase),
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {phaseLabel(plan.phase)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${bidColor(plan.bid_decision)}22`,
                    color: bidColor(plan.bid_decision),
                    textTransform: "uppercase",
                  }}
                >
                  {plan.bid_decision.replace("_", " ")}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{plan.opportunity_title}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {plan.agency} &middot; {plan.capture_manager} &middot; Pwin {plan.pwin}% &middot;{" "}
                    {fmtCurrency(plan.value_estimated)}
                  </div>
                </div>
                <span style={{ color: "var(--color-text-muted)", fontSize: 18 }}>
                  {isExpanded ? "\u25B2" : "\u25BC"}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--color-border)" }}>
                  {/* Section toggles */}
                  <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 12, flexWrap: "wrap" }}>
                    {["win_themes", "teaming", "milestones", "gates", "risks"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setExpandedSection(expandedSection === `${plan.id}-${s}` ? null : `${plan.id}-${s}`)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--color-border)",
                          background:
                            expandedSection === `${plan.id}-${s}`
                              ? "rgba(59,130,246,0.1)"
                              : "transparent",
                          color:
                            expandedSection === `${plan.id}-${s}`
                              ? "var(--color-primary)"
                              : "var(--color-text-muted)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {s === "win_themes"
                          ? `Win Themes (${plan.win_themes.length})`
                          : s === "teaming"
                          ? `Teaming (${plan.teaming_partners.length})`
                          : s === "milestones"
                          ? `Milestones (${plan.milestones.length})`
                          : s === "gates"
                          ? `Gates (${plan.gate_reviews.length})`
                          : `Risks (${plan.risks.length})`}
                      </button>
                    ))}
                  </div>

                  {/* Win Themes & Discriminators */}
                  {expandedSection === `${plan.id}-win_themes` && (
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Win Themes</h4>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {plan.win_themes.map((t, i) => (
                          <li key={i} style={{ fontSize: 13, marginBottom: 4, color: "var(--color-text)" }}>
                            {t}
                          </li>
                        ))}
                      </ul>
                      {plan.discriminators.length > 0 && (
                        <>
                          <h4 style={{ fontSize: 14, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>
                            Discriminators
                          </h4>
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {plan.discriminators.map((d, i) => (
                              <li
                                key={i}
                                style={{ fontSize: 13, marginBottom: 4, color: "#10b981" }}
                              >
                                {d}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {/* Teaming Partners */}
                  {expandedSection === `${plan.id}-teaming` && (
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Teaming Partners</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {plan.teaming_partners.map((tp, i) => (
                          <div
                            key={i}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 6,
                              background: "var(--color-bg)",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: `${partnerStatusColor(tp.status)}22`,
                                color: partnerStatusColor(tp.status),
                                textTransform: "uppercase",
                              }}
                            >
                              {tp.status}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>
                                {tp.name}{" "}
                                <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>
                                  ({partnerRoleLabel(tp.role)})
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                                {tp.capability}
                              </div>
                            </div>
                            {tp.past_performance_score != null && (
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#3b82f6" }}>
                                PP: {tp.past_performance_score}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Milestones */}
                  {expandedSection === `${plan.id}-milestones` && (
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Milestones</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {plan.milestones.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 6,
                              background: "var(--color-bg)",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              borderLeft: `3px solid ${milestoneStatusColor(m.status)}`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: milestoneStatusColor(m.status),
                                textTransform: "uppercase",
                                minWidth: 70,
                              }}
                            >
                              {m.status.replace("_", " ")}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
                              {m.notes && (
                                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                                  {m.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                              {formatDate(m.due_date)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{m.owner}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gate Reviews */}
                  {expandedSection === `${plan.id}-gates` && (
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Gate Reviews</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {plan.gate_reviews.map((g, i) => (
                          <div
                            key={i}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 6,
                              background: "var(--color-bg)",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              borderLeft: `3px solid ${gateStatusColor(g.status)}`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: gateStatusColor(g.status),
                                textTransform: "uppercase",
                                minWidth: 55,
                              }}
                            >
                              {g.status}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{g.gate}</div>
                              {g.notes && (
                                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                                  {g.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                              {g.reviewed_at ? formatDate(g.reviewed_at) : "Pending"}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{g.reviewer}</div>
                          </div>
                        ))}
                      </div>
                      {/* Run gate review button for pending gates */}
                      {plan.gate_reviews.some((g) => g.status === "pending") && (
                        <button
                          onClick={() => {
                            const pending = plan.gate_reviews.find((g) => g.status === "pending");
                            if (pending) onGateReview(plan.id, pending.gate);
                          }}
                          style={{
                            marginTop: 12,
                            padding: "8px 16px",
                            borderRadius: 6,
                            border: "none",
                            background: "var(--color-primary)",
                            color: "#fff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          Run Gate Review (Dry Run)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Risks */}
                  {expandedSection === `${plan.id}-risks` && (
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Risks</h4>
                      {plan.risks.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No risks identified.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {plan.risks.map((r, i) => (
                            <div
                              key={i}
                              style={{
                                padding: "12px 16px",
                                borderRadius: 6,
                                background: "var(--color-bg)",
                                borderLeft: `3px solid ${riskColor(r.impact)}`,
                              }}
                            >
                              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: riskColor(r.likelihood),
                                  }}
                                >
                                  L: {r.likelihood.toUpperCase()}
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: riskColor(r.impact),
                                  }}
                                >
                                  I: {r.impact.toUpperCase()}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                                {r.description}
                              </div>
                              <div style={{ fontSize: 12, color: "#10b981" }}>
                                Mitigation: {r.mitigation}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Activity Log Tab
// ---------------------------------------------------------------------------

function ActivityTab({
  activitiesData,
  activities,
  activityTypeFilter,
  setActivityTypeFilter,
}: {
  activitiesData: ActivitiesData | null;
  activities: CaptureActivity[];
  activityTypeFilter: string;
  setActivityTypeFilter: (v: string) => void;
}) {
  if (!activitiesData) return null;

  return (
    <>
      {/* Summary */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <StatChip label="Total" value={activitiesData.total} />
        <StatChip label="Filtered" value={activitiesData.filtered} />
      </div>

      {/* Type filter */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={activityTypeFilter}
          onChange={(e) => setActivityTypeFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
          }}
        >
          <option value="">All Types</option>
          {Object.entries(activitiesData.typeCounts).map(([type, count]) => (
            <option key={type} value={type}>
              {type.replace("_", " ")} ({count})
            </option>
          ))}
        </select>
      </div>

      {/* Activity timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activities.map((a) => (
          <div
            key={a.id}
            style={{
              padding: "14px 20px",
              borderRadius: 8,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{activityIcon(a.activity_type)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(59,130,246,0.1)",
                    color: "var(--color-primary)",
                    textTransform: "uppercase",
                  }}
                >
                  {a.activity_type.replace("_", " ")}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {formatDateTime(a.performed_at)} &middot; {a.performed_by}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{a.description}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {a.opportunity_title}
              </div>
              {a.outcome && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#10b981",
                    marginTop: 6,
                    padding: "6px 10px",
                    borderRadius: 4,
                    background: "rgba(16,185,129,0.08)",
                  }}
                >
                  Outcome: {a.outcome}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Milestones Tab
// ---------------------------------------------------------------------------

function MilestonesTab({
  plansData,
  plans,
}: {
  plansData: PlansData | null;
  plans: CapturePlan[];
}) {
  if (!plansData) return null;

  const allMilestones = plans.flatMap((p) =>
    p.milestones.map((m) => ({ ...m, opportunity_title: p.opportunity_title, planId: p.id }))
  );

  const upcoming = allMilestones
    .filter((m) => m.status !== "completed")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const completed = allMilestones.filter((m) => m.status === "completed");

  const statusCounts: Record<string, number> = {};
  for (const m of allMilestones) {
    statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
  }

  return (
    <>
      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatChip label="Total" value={allMilestones.length} />
        <StatChip label="Completed" value={statusCounts["completed"] ?? 0} color="#10b981" />
        <StatChip label="On Track" value={statusCounts["on_track"] ?? 0} color="#3b82f6" />
        <StatChip label="At Risk" value={statusCounts["at_risk"] ?? 0} color="#f59e0b" />
        <StatChip label="Overdue" value={statusCounts["overdue"] ?? 0} color="#ef4444" />
      </div>

      {/* Upcoming milestones */}
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Upcoming Milestones</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
        {upcoming.map((m) => (
          <div
            key={m.id}
            style={{
              padding: "12px 16px",
              borderRadius: 6,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderLeft: `3px solid ${milestoneStatusColor(m.status)}`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: milestoneStatusColor(m.status),
                textTransform: "uppercase",
                minWidth: 70,
              }}
            >
              {m.status.replace("_", " ")}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                {m.opportunity_title}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {formatDate(m.due_date)}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{m.owner}</div>
          </div>
        ))}
      </div>

      {/* Completed milestones */}
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Completed</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {completed.map((m) => (
          <div
            key={m.id}
            style={{
              padding: "12px 16px",
              borderRadius: 6,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderLeft: "3px solid #10b981",
              opacity: 0.7,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "#10b981", minWidth: 70 }}>
              COMPLETED
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                {m.opportunity_title}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {formatDate(m.due_date)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
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
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--color-text)" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <span
      style={{
        padding: "6px 14px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 500,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: color ?? "var(--color-text)",
      }}
    >
      {label}{" "}
      <strong style={{ color: color ?? "var(--color-text)" }}>{value}</strong>
    </span>
  );
}
