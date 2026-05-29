import { useState, useEffect, useCallback } from "react";
import { authenticatedFetch } from "../api/auth";

interface PipelineItem {
  id: number;
  ou_tag: string;
  opportunity_id: number;
  capture_owner: string;
  milestones: Milestone[];
  win_prob_pct: number | null;
  win_prob_evidence: string;
  teaming_partners: string[];
  created_at: string;
  updated_at: string;
  opportunity_title: string;
  opportunity_agency: string | null;
  opportunity_naics: string | null;
  opportunity_set_aside: string | null;
  opportunity_due_at: string | null;
  opportunity_value_min: number | null;
  opportunity_value_max: number | null;
  opportunity_grade: string | null;
}

interface Milestone {
  label: string;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
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

const PARTNER_LABELS: Record<string, string> = {
  riverstone: "Riverstone",
  pd_systems: "PD Systems",
  teaming: "Teaming",
};

function WinProbBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-caption text-muted">—</span>;
  let colorClass = "bg-red-600";
  if (pct >= 70) colorClass = "bg-green-600";
  else if (pct >= 40) colorClass = "bg-amber-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded bg-border overflow-hidden">
        <div className={`h-full rounded ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption text-ink num font-medium">{pct}%</span>
    </div>
  );
}

function MilestoneStatus({ milestone }: { milestone: Milestone }) {
  const isDone = !!milestone.completed_at;
  const isPastDue = milestone.due_date && !isDone && new Date(milestone.due_date) < new Date();

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded bg-border overflow-hidden">
        <div className={`h-full rounded ${isDone ? "bg-accent" : isPastDue ? "bg-critical" : "bg-amber-400"}`} style={{ width: isDone ? "100%" : isPastDue ? "80%" : "30%" }} />
      </div>
      <span className={`text-caption ${isDone ? "text-accent" : isPastDue ? "text-critical" : "text-muted"}`}>
        {isDone ? "Done" : isPastDue ? "Overdue" : "Pending"}
      </span>
    </div>
  );
}

function CaptureEditor({
  item,
  onSaved,
  onCancel,
}: {
  item: PipelineItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [captureOwner, setCaptureOwner] = useState(item.capture_owner);
  const [winProbPct, setWinProbPct] = useState(String(item.win_prob_pct ?? ""));
  const [winProbEvidence, setWinProbEvidence] = useState(item.win_prob_evidence);
  const [teamingPartners, setTeamingPartners] = useState<string[]>(item.teaming_partners);
  const [milestones, setMilestones] = useState<Milestone[]>(item.milestones);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addMilestone() {
    setMilestones((prev) => [
      ...prev,
      { label: "", due_date: null, completed_at: null, notes: null },
    ]);
  }

  function updateMilestone(idx: number, field: keyof Milestone, value: string | null) {
    setMilestones((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value || null } : m)),
    );
  }

  async function handleSave() {
    const pct = winProbPct ? Number(winProbPct) : null;
    if (pct != null && (!winProbEvidence || !winProbEvidence.trim())) {
      setError("Evidence required when setting win probability");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await authenticatedFetch(`/api/v2/pipeline/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-gda-key": "header" },
        body: JSON.stringify({
          capture_owner: captureOwner,
          win_prob_pct: pct,
          win_prob_evidence: winProbEvidence,
          teaming_partners: teamingPartners,
          milestones,
        }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const body = await res.json();
        setError(body.error?.message ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border mt-3 pt-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-caption text-muted uppercase tracking-wider mb-1">Capture Owner</label>
          <input type="text" value={captureOwner} onChange={(e) => setCaptureOwner(e.target.value)} className="h-8 px-3 rounded border border-border text-body text-ink bg-white w-full" />
        </div>
        <div>
          <label className="block text-caption text-muted uppercase tracking-wider mb-1">Win Probability (%)</label>
          <input type="number" min={0} max={100} value={winProbPct} onChange={(e) => setWinProbPct(e.target.value)} className="h-8 px-3 rounded border border-border text-body text-ink bg-white w-full num" />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-caption text-muted uppercase tracking-wider mb-1">Win Probability Evidence (required)</label>
        <textarea value={winProbEvidence} onChange={(e) => setWinProbEvidence(e.target.value)} rows={2} className="w-full rounded border border-border text-body text-ink bg-white p-3" placeholder="Explain the evidence behind the win probability…" />
      </div>
      <div className="mb-4">
        <label className="block text-caption text-muted uppercase tracking-wider mb-1">Teaming Partners</label>
        <div className="flex gap-2">
          {(["riverstone", "pd_systems"] as const).map((p) => (
            <button
              key={p}
              onClick={() =>
                setTeamingPartners((prev) =>
                  prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                )
              }
              className={`h-8 px-3 rounded border text-[13px] font-medium ${teamingPartners.includes(p) ? "border-accent bg-accent text-white" : "border-border text-ink bg-white"}`}
            >
              {PARTNER_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Milestones table */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-caption text-muted uppercase tracking-wider">Milestones</label>
          <button onClick={addMilestone} className="btn h-8 px-3 rounded border border-border bg-white text-ink text-[13px] font-medium hover:bg-bg">Add Milestone</button>
        </div>
        {milestones.length > 0 && (
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Label</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Due Date</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Status</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2 pr-3">
                    <input type="text" value={m.label} onChange={(e) => updateMilestone(i, "label", e.target.value)} className="h-7 px-2 rounded border border-border text-body text-ink bg-white w-full" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="date" value={m.due_date ?? ""} onChange={(e) => updateMilestone(i, "due_date", e.target.value)} className="h-7 px-2 rounded border border-border text-body text-ink bg-white" />
                  </td>
                  <td className="py-2 pr-3">
                    <MilestoneStatus milestone={m} />
                  </td>
                  <td className="py-2">
                    <input type="text" value={m.notes ?? ""} onChange={(e) => updateMilestone(i, "notes", e.target.value)} className="h-7 px-2 rounded border border-border text-body text-ink bg-white w-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <p className="text-caption text-critical mb-2">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn h-8 px-4 rounded border border-border bg-white text-ink text-[13px] font-medium">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn h-8 px-4 rounded border border-accent bg-accent text-white text-[13px] font-medium hover:bg-[#015C61] disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function PipelineV2() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/v2/pipeline");
      if (res.ok) {
        const body = await res.json();
        setItems(body.data?.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="container-page">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-display font-semibold text-ink">Pipeline</h1>
        <span className="inline-block rounded px-2 py-0.5 text-caption font-semibold border border-border text-muted num">
          {items.length}
        </span>
      </div>

      {/* Add to Pipeline CTA */}
      <div className="mb-6">
        <a
          href="/opportunities-v2?qualified=true"
          className="btn inline-flex h-8 px-4 rounded border border-accent bg-accent text-white text-[13px] font-medium hover:bg-[#015C61] no-underline items-center"
        >
          Add to Pipeline
        </a>
        <span className="text-caption text-muted ml-3">Select a qualified opportunity to add</span>
      </div>

      {/* Pipeline item list */}
      {loading ? (
        <p className="text-muted text-body">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted text-body">No pipeline items yet. Qualify an opportunity first.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="card p-4">
              <div
                className="flex items-center justify-between gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-body font-semibold text-accent">{item.opportunity_title}</span>
                    {item.opportunity_grade && (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${item.opportunity_grade === "A" ? "bg-green-700 text-white" : item.opportunity_grade === "B" ? "bg-amber-600 text-white" : "bg-red-700 text-white"}`}>
                        {item.opportunity_grade}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-caption text-muted">
                    <span>Owner: <span className="text-ink font-medium">{item.capture_owner}</span></span>
                    <span>Due {formatDateEST(item.opportunity_due_at)}</span>
                    <span>Milestones: <span className="num">{item.milestones.length}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <WinProbBar pct={item.win_prob_pct} />
                  {item.teaming_partners.length > 0 && (
                    <div className="flex gap-1">
                      {item.teaming_partners.map((p) => (
                        <span key={p} className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold border border-accent text-accent">
                          {PARTNER_LABELS[p] ?? p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {expandedId === item.id && (
                <CaptureEditor
                  item={item}
                  onSaved={() => { setExpandedId(null); fetchData(); }}
                  onCancel={() => setExpandedId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
