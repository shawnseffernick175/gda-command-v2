import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../api/auth";

interface Opportunity {
  id: number;
  ou_tag: string;
  source: string;
  sam_notice_id: string | null;
  naics: string | null;
  agency: string | null;
  title: string;
  description: string | null;
  set_aside: string | null;
  response_due_at: string | null;
  value_min: number | null;
  value_max: number | null;
  grade: string | null;
  grade_evidence: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  is_partner_teaming_required: boolean;
  teaming_partner: string | null;
  teaming_flags: TeamingFlag[];
}

interface TeamingFlag {
  id: number;
  reason: string;
  suggested_partner: string;
  detail: string;
}

function formatDateEST(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatValueRange(min: number | null, max: number | null): string {
  const fmt = (v: number) => {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  if (max != null) return `Up to ${fmt(max)}`;
  return "—";
}

const FLAG_COLORS: Record<string, string> = {
  hubzone: "border-amber-600 text-amber-700",
  v3_veteran: "border-accent text-accent",
  ic_clearance: "border-purple-600 text-purple-700",
  training_depth: "border-accent text-accent",
  de_confliction: "border-critical text-critical",
};

const FLAG_LABELS: Record<string, string> = {
  hubzone: "HUBZone",
  v3_veteran: "V3 Veteran",
  ic_clearance: "IC Clearance",
  training_depth: "Training Depth",
  scope_overflow: "Scope Overflow",
  de_confliction: "De-Confliction",
};

const GRADE_CLASSES: Record<string, string> = {
  A: "bg-green-700 text-white",
  B: "bg-amber-600 text-white",
  C: "bg-red-700 text-white",
};

const SET_ASIDE_OPTIONS = [
  "HUBZone SB", "WOSB", "8(a)", "SDVOSB", "Total SB", "Unrestricted",
];

function QualifyModal({
  opp,
  onClose,
  onQualified,
}: {
  opp: Opportunity;
  onClose: () => void;
  onQualified: () => void;
}) {
  const [qualifierName, setQualifierName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultFlags, setResultFlags] = useState<TeamingFlag[]>([]);
  const [done, setDone] = useState(false);

  async function handleQualify() {
    if (!qualifierName.trim()) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/v2/opportunities/${opp.id}/qualify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gda-key": "header" },
        body: JSON.stringify({ qualified_by: qualifierName.trim() }),
      });
      if (res.ok) {
        const body = await res.json();
        setResultFlags(body.data?.teaming_flags ?? []);
        setDone(true);
        onQualified();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded border border-border p-6 max-w-[480px] w-full">
        <h3 className="text-section font-semibold text-ink mb-4">Qualify Opportunity</h3>
        <p className="text-body text-ink mb-4">{opp.title}</p>
        {!done ? (
          <>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Qualifier Name</label>
            <input
              type="text"
              value={qualifierName}
              onChange={(e) => setQualifierName(e.target.value)}
              placeholder="e.g. Shawn Seffernick"
              className="w-full h-8 px-4 rounded border border-border text-body text-ink bg-white mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="btn h-8 px-4 rounded border border-border bg-white text-ink text-[13px] font-medium">Cancel</button>
              <button
                onClick={handleQualify}
                disabled={loading || !qualifierName.trim()}
                className="btn h-8 px-4 rounded border border-accent bg-accent text-white text-[13px] font-medium hover:bg-[#015C61] disabled:opacity-50"
              >
                {loading ? "Qualifying…" : "Confirm"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body text-accent font-medium mb-3">Qualified successfully.</p>
            {resultFlags.length > 0 && (
              <div className="mb-4">
                <p className="text-caption text-muted uppercase tracking-wider mb-2">Teaming Flags Detected</p>
                {resultFlags.map((f, i) => (
                  <div key={i} className="text-caption text-ink mb-1">
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold border mr-2 ${FLAG_COLORS[f.reason] ?? "border-border text-muted"}`}>
                      {FLAG_LABELS[f.reason] ?? f.reason}
                    </span>
                    {f.detail}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="btn h-8 px-4 rounded border border-accent bg-accent text-white text-[13px] font-medium">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GradePopover({
  opp,
  onClose,
  onGraded,
}: {
  opp: Opportunity;
  onClose: () => void;
  onGraded: () => void;
}) {
  const [grade, setGrade] = useState(opp.grade ?? "");
  const [evidence, setEvidence] = useState(opp.grade_evidence ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!grade) return;
    if (!evidence.trim()) {
      setError("Evidence is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authenticatedFetch(`/api/v2/opportunities/${opp.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gda-key": "header" },
        body: JSON.stringify({ grade, grade_evidence: evidence.trim() }),
      });
      if (res.ok) {
        onGraded();
        onClose();
      } else {
        const body = await res.json();
        setError(body.error?.message ?? "Failed to grade");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded border border-border p-6 max-w-[400px] w-full">
        <h3 className="text-section font-semibold text-ink mb-4">Grade Opportunity</h3>
        <div className="flex gap-2 mb-4">
          {(["A", "B", "C"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGrade(g)}
              className={`h-8 w-12 rounded border text-[13px] font-semibold ${grade === g ? GRADE_CLASSES[g] : "border-border text-ink bg-white"}`}
            >
              {g}
            </button>
          ))}
        </div>
        <label className="block text-caption text-muted uppercase tracking-wider mb-1">Evidence (required)</label>
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={3}
          className="w-full rounded border border-border text-body text-ink bg-white p-3 mb-2"
          placeholder="NAICS alignment, set-aside match, past performance fit…"
        />
        {error && <p className="text-caption text-critical mb-2">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn h-8 px-4 rounded border border-border bg-white text-ink text-[13px] font-medium">Cancel</button>
          <button
            onClick={handleSave}
            disabled={loading || !grade}
            className="btn h-8 px-4 rounded border border-accent bg-accent text-white text-[13px] font-medium hover:bg-[#015C61] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OpportunitiesV2() {
  const [searchParams] = useSearchParams();
  const hotFilter = searchParams.get("hot");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [naicsFilter, setNaicsFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [setAsideFilter, setSetAsideFilter] = useState<string[]>([]);
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [dueBefore, setDueBefore] = useState("");
  const [dueAfter, setDueAfter] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);

  // Modals
  const [qualifyTarget, setQualifyTarget] = useState<Opportunity | null>(null);
  const [gradeTarget, setGradeTarget] = useState<Opportunity | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "50");
      if (naicsFilter) params.set("naics", naicsFilter);
      if (agencyFilter) params.set("agency", agencyFilter);
      if (setAsideFilter.length === 1) params.set("set_aside", setAsideFilter[0]);
      if (minValue) params.set("min_value", minValue);
      if (maxValue) params.set("max_value", maxValue);
      if (dueBefore) params.set("due_before", dueBefore);
      if (dueAfter) params.set("due_after", dueAfter);
      if (gradeFilter.length === 1) params.set("grade", gradeFilter[0]);
      if (hotFilter === "1") params.set("hot", "1");

      const res = await authenticatedFetch(`/api/v2/opportunities?${params.toString()}`);
      if (res.ok) {
        const body = await res.json();
        setOpportunities(body.data?.opportunities ?? []);
        setTotal(body.data?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, naicsFilter, agencyFilter, setAsideFilter, minValue, maxValue, dueBefore, dueAfter, gradeFilter, hotFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function clearFilters() {
    setNaicsFilter("");
    setAgencyFilter("");
    setSetAsideFilter([]);
    setMinValue("");
    setMaxValue("");
    setDueBefore("");
    setDueAfter("");
    setGradeFilter([]);
    setPage(1);
  }

  const hasFilters = naicsFilter || agencyFilter || setAsideFilter.length > 0 || minValue || maxValue || dueBefore || dueAfter || gradeFilter.length > 0;

  const activeChips: { label: string; onClear: () => void }[] = [];
  if (naicsFilter) activeChips.push({ label: `NAICS: ${naicsFilter}`, onClear: () => setNaicsFilter("") });
  if (agencyFilter) activeChips.push({ label: `Agency: ${agencyFilter}`, onClear: () => setAgencyFilter("") });
  for (const sa of setAsideFilter) {
    activeChips.push({ label: `Set-Aside: ${sa}`, onClear: () => setSetAsideFilter((prev) => prev.filter((s) => s !== sa)) });
  }
  if (minValue) activeChips.push({ label: `Min: $${minValue}`, onClear: () => setMinValue("") });
  if (maxValue) activeChips.push({ label: `Max: $${maxValue}`, onClear: () => setMaxValue("") });
  if (dueBefore) activeChips.push({ label: `Due before: ${dueBefore}`, onClear: () => setDueBefore("") });
  if (dueAfter) activeChips.push({ label: `Due after: ${dueAfter}`, onClear: () => setDueAfter("") });
  for (const g of gradeFilter) {
    activeChips.push({ label: `Grade: ${g}`, onClear: () => setGradeFilter((prev) => prev.filter((x) => x !== g)) });
  }

  return (
    <div className="container-page">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-display font-semibold text-ink">Opportunities</h1>
        <span className="inline-block rounded px-2 py-0.5 text-caption font-semibold border border-border text-muted num">
          {total}
        </span>
      </div>

      {/* Filter chip strip */}
      <div className="card mb-6 p-4">
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">NAICS</label>
            <input type="text" value={naicsFilter} onChange={(e) => { setNaicsFilter(e.target.value); setPage(1); }} placeholder="e.g. 541512" className="h-8 px-3 rounded border border-border text-body text-ink bg-white w-[120px]" />
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Agency</label>
            <input type="text" value={agencyFilter} onChange={(e) => { setAgencyFilter(e.target.value); setPage(1); }} placeholder="e.g. Army" className="h-8 px-3 rounded border border-border text-body text-ink bg-white w-[160px]" />
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Set-Aside</label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !setAsideFilter.includes(e.target.value)) {
                  setSetAsideFilter((prev) => [...prev, e.target.value]);
                  setPage(1);
                }
              }}
              className="h-8 px-3 rounded border border-border text-body text-ink bg-white"
            >
              <option value="">Add…</option>
              {SET_ASIDE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Value Min</label>
            <input type="number" value={minValue} onChange={(e) => { setMinValue(e.target.value); setPage(1); }} placeholder="0" className="h-8 px-3 rounded border border-border text-body text-ink bg-white w-[120px] num" />
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Value Max</label>
            <input type="number" value={maxValue} onChange={(e) => { setMaxValue(e.target.value); setPage(1); }} placeholder="999999999" className="h-8 px-3 rounded border border-border text-body text-ink bg-white w-[120px] num" />
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Due After</label>
            <input type="date" value={dueAfter} onChange={(e) => { setDueAfter(e.target.value); setPage(1); }} className="h-8 px-3 rounded border border-border text-body text-ink bg-white" />
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Due Before</label>
            <input type="date" value={dueBefore} onChange={(e) => { setDueBefore(e.target.value); setPage(1); }} className="h-8 px-3 rounded border border-border text-body text-ink bg-white" />
          </div>
          <div>
            <label className="block text-caption text-muted uppercase tracking-wider mb-1">Grade</label>
            <div className="flex gap-1">
              {(["A", "B", "C"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setGradeFilter((prev) =>
                      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
                    );
                    setPage(1);
                  }}
                  className={`h-8 w-8 rounded border text-[13px] font-semibold ${gradeFilter.includes(g) ? GRADE_CLASSES[g] : "border-border text-ink bg-white"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {activeChips.map((chip, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border text-caption text-ink">
                {chip.label}
                <button onClick={chip.onClear} className="text-muted hover:text-ink ml-1">×</button>
              </span>
            ))}
            {hasFilters && (
              <button onClick={clearFilters} className="text-caption text-accent hover:underline">Clear all</button>
            )}
          </div>
        )}
      </div>

      {/* Opportunity list */}
      {loading ? (
        <p className="text-muted text-body">Loading…</p>
      ) : opportunities.length === 0 ? (
        <p className="text-muted text-body">No opportunities found.</p>
      ) : (
        <div className="space-y-2">
          {opportunities.map((opp) => (
            <div key={opp.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-body font-semibold text-ink truncate">{opp.title}</span>
                    {opp.grade && (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${GRADE_CLASSES[opp.grade]}`}>
                        {opp.grade}
                      </span>
                    )}
                    {opp.qualified_at && (
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-accent text-white">
                        QUALIFIED
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-caption text-muted">
                    {opp.agency && <span>{opp.agency}</span>}
                    {opp.set_aside && (
                      <span className="rounded px-1.5 py-0.5 border border-border text-[11px]">{opp.set_aside}</span>
                    )}
                    {opp.naics && <span className="num">NAICS {opp.naics}</span>}
                    <span className="num">{formatValueRange(opp.value_min, opp.value_max)}</span>
                    <span>Due {formatDateEST(opp.response_due_at)}</span>
                  </div>
                  {/* Teaming flag badges */}
                  {opp.teaming_flags && opp.teaming_flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {opp.teaming_flags.map((f, i) => (
                        <span
                          key={i}
                          className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold border ${FLAG_COLORS[f.reason] ?? "border-border text-muted"}`}
                          title={f.detail}
                        >
                          {FLAG_LABELS[f.reason] ?? f.reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setGradeTarget(opp)}
                    className="btn h-8 px-4 rounded border border-border bg-white text-ink text-[13px] font-medium hover:bg-bg"
                  >
                    Grade
                  </button>
                  {!opp.qualified_at && (
                    <button
                      onClick={() => setQualifyTarget(opp)}
                      className="btn h-8 px-4 rounded border border-accent bg-accent text-white text-[13px] font-medium hover:bg-[#015C61]"
                    >
                      Qualify
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex gap-2 items-center justify-center mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn h-8 px-4 rounded border border-border bg-white text-ink text-[13px] font-medium disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-caption text-muted num">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage((p) => p + 1)}
            className="btn h-8 px-4 rounded border border-border bg-white text-ink text-[13px] font-medium disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Modals */}
      {qualifyTarget && (
        <QualifyModal
          opp={qualifyTarget}
          onClose={() => setQualifyTarget(null)}
          onQualified={fetchData}
        />
      )}
      {gradeTarget && (
        <GradePopover
          opp={gradeTarget}
          onClose={() => setGradeTarget(null)}
          onGraded={fetchData}
        />
      )}
    </div>
  );
}
