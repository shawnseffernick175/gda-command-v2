import { useEffect, useState } from "react";
import InfoBadge from "../components/InfoBadge";

interface PipelineRow {
  id: string;
  title: string;
  stage: string;
  value_estimated: number;
  probability_of_win: number;
  agency: string;
}

interface GDAEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { message: string } | null;
}

async function fetchPipeline(): Promise<PipelineRow[]> {
  try {
    const r = await fetch("/api/pipeline");
    const env: GDAEnvelope<{ rows: PipelineRow[] }> = await r.json();
    return env.data?.rows ?? [];
  } catch {
    return [];
  }
}

const STAGE_COLORS: Record<string, string> = {
  discovery: "#f59e0b",
  qualified: "#3b82f6",
  pipeline: "#8b5cf6",
  proposal: "#ec4899",
  submitted: "#06b6d4",
  won: "#22c55e",
  lost: "#ef4444",
};

const STAGE_ORDER = ["discovery", "qualified", "pipeline", "proposal", "submitted", "won", "lost"];

function fmtCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

type ChartTab = "phase" | "pwin" | "agency" | "value";

export default function Charts() {
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ChartTab>("phase");

  useEffect(() => {
    fetchPipeline()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#8b949e", padding: 24 }}>Loading charts...</p>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Charts & Analytics</h1>
      <p style={{ color: "#8b949e", fontSize: 14, marginBottom: 20 }}>
        Visual analytics across your pipeline. {rows.length} opportunities loaded.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid #30363d", paddingBottom: 8 }}>
        {([
          { key: "phase" as ChartTab, label: "Pipeline by Phase" },
          { key: "pwin" as ChartTab, label: "Pwin Distribution" },
          { key: "agency" as ChartTab, label: "By Agency" },
          { key: "value" as ChartTab, label: "Value Analysis" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? "#3b82f6" : "#8b949e",
              background: tab === t.key ? "rgba(59,130,246,0.1)" : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "phase" && <PipelineByPhase rows={rows} />}
      {tab === "pwin" && <PwinDistribution rows={rows} />}
      {tab === "agency" && <ByAgency rows={rows} />}
      {tab === "value" && <ValueAnalysis rows={rows} />}
    </div>
  );
}

function PipelineByPhase({ rows }: { rows: PipelineRow[] }) {
  const stageData = STAGE_ORDER.map((stage) => {
    const stageRows = rows.filter((r) => r.stage === stage);
    return {
      stage,
      count: stageRows.length,
      value: stageRows.reduce((s, r) => s + (r.value_estimated ?? 0), 0),
    };
  }).filter((d) => d.count > 0);

  const maxCount = Math.max(...stageData.map((d) => d.count), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Pipeline by Phase</h2>
        <InfoBadge
          whatItIs="Horizontal bar chart showing opportunity count per pipeline stage."
          whatItMeans="Shows where your opportunities are concentrated in the pipeline."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stageData.map((d) => (
          <div key={d.stage} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 90, fontSize: 13, fontWeight: 600, color: STAGE_COLORS[d.stage] ?? "#6b7280", textTransform: "capitalize" }}>
              {d.stage}
            </div>
            <div style={{ flex: 1, background: "#161b22", borderRadius: 6, height: 32, position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  height: "100%",
                  background: (STAGE_COLORS[d.stage] ?? "#6b7280") + "55",
                  borderRadius: 6,
                  borderLeft: `3px solid ${STAGE_COLORS[d.stage] ?? "#6b7280"}`,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                  minWidth: 50,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e5e5" }}>
                  {d.count} opp{d.count !== 1 ? "s" : ""} &middot; {fmtCurrency(d.value)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 24 }}>
        <SummaryCard label="Total Opportunities" value={String(rows.length)} />
        <SummaryCard label="Total Value" value={fmtCurrency(rows.reduce((s, r) => s + (r.value_estimated ?? 0), 0))} />
        <SummaryCard label="Active Stages" value={String(stageData.length)} />
      </div>
    </div>
  );
}

function PwinDistribution({ rows }: { rows: PipelineRow[] }) {
  const buckets = [
    { label: "0-20%", min: 0, max: 0.2 },
    { label: "21-40%", min: 0.2, max: 0.4 },
    { label: "41-60%", min: 0.4, max: 0.6 },
    { label: "61-80%", min: 0.6, max: 0.8 },
    { label: "81-100%", min: 0.8, max: 1.01 },
  ];

  const bucketColors = ["#ef4444", "#f59e0b", "#eab308", "#3b82f6", "#22c55e"];

  const data = buckets.map((b, i) => ({
    ...b,
    count: rows.filter((r) => {
      const p = r.probability_of_win ?? 0;
      return p >= b.min && p < b.max;
    }).length,
    color: bucketColors[i],
  }));

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const total = rows.length || 1;
  const avgPwin = rows.length
    ? rows.reduce((s, r) => s + (r.probability_of_win ?? 0), 0) / rows.length
    : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Pwin Distribution</h2>
        <InfoBadge
          whatItIs="Distribution of win probabilities across all opportunities."
          whatItMeans="Shows portfolio risk profile. Clustering in high Pwin = strong positioning."
          howCalculated="Each opportunity's probability_of_win bucketed into 20% ranges."
        />
      </div>

      {/* Bar chart */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 200, marginBottom: 16 }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e5e5" }}>{d.count}</span>
            <div
              style={{
                width: "100%",
                maxWidth: 60,
                height: `${(d.count / maxCount) * 160}px`,
                minHeight: d.count > 0 ? 8 : 0,
                background: d.color + "55",
                borderTop: `3px solid ${d.color}`,
                borderRadius: "4px 4px 0 0",
              }}
            />
            <span style={{ fontSize: 11, color: "#8b949e" }}>{d.label}</span>
            <span style={{ fontSize: 10, color: "#6b7280" }}>{((d.count / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <SummaryCard label="Average Pwin" value={`${(avgPwin * 100).toFixed(0)}%`} />
        <SummaryCard label="High Confidence (>60%)" value={String(rows.filter((r) => (r.probability_of_win ?? 0) > 0.6).length)} />
        <SummaryCard label="At Risk (<30%)" value={String(rows.filter((r) => (r.probability_of_win ?? 0) < 0.3).length)} />
      </div>
    </div>
  );
}

function ByAgency({ rows }: { rows: PipelineRow[] }) {
  const agencyMap = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const agency = r.agency || "Unknown";
    const prev = agencyMap.get(agency) ?? { count: 0, value: 0 };
    agencyMap.set(agency, { count: prev.count + 1, value: prev.value + (r.value_estimated ?? 0) });
  }

  const sorted = [...agencyMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const maxCount = Math.max(...sorted.map(([, v]) => v.count), 1);
  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4", "#22c55e", "#ef4444", "#14b8a6", "#a855f7", "#6b7280"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Top Agencies</h2>
        <InfoBadge
          whatItIs="Opportunity count by agency, sorted by volume."
          whatItMeans="Shows which agencies you have the most opportunities with."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(([agency, data], i) => (
          <div key={agency} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 160, fontSize: 13, fontWeight: 500, color: "#c9d1d9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agency}
            </div>
            <div style={{ flex: 1, background: "#161b22", borderRadius: 6, height: 28, position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  width: `${(data.count / maxCount) * 100}%`,
                  height: "100%",
                  background: (colors[i % colors.length]) + "44",
                  borderLeft: `3px solid ${colors[i % colors.length]}`,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                  minWidth: 70,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: "#e5e5e5" }}>
                  {data.count} &middot; {fmtCurrency(data.value)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueAnalysis({ rows }: { rows: PipelineRow[] }) {
  const totalValue = rows.reduce((s, r) => s + (r.value_estimated ?? 0), 0);
  const avgValue = rows.length ? totalValue / rows.length : 0;
  const maxValue = Math.max(...rows.map((r) => r.value_estimated ?? 0), 0);
  const medianValue = (() => {
    const vals = rows.map((r) => r.value_estimated ?? 0).sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  })();

  const weightedPipeline = rows.reduce((s, r) => s + (r.value_estimated ?? 0) * (r.probability_of_win ?? 0), 0);

  const valueBuckets = [
    { label: "<$1M", filter: (v: number) => v < 1_000_000 },
    { label: "$1M-$5M", filter: (v: number) => v >= 1_000_000 && v < 5_000_000 },
    { label: "$5M-$20M", filter: (v: number) => v >= 5_000_000 && v < 20_000_000 },
    { label: "$20M-$100M", filter: (v: number) => v >= 20_000_000 && v < 100_000_000 },
    { label: ">$100M", filter: (v: number) => v >= 100_000_000 },
  ];

  const bucketData = valueBuckets.map((b) => ({
    label: b.label,
    count: rows.filter((r) => b.filter(r.value_estimated ?? 0)).length,
  }));

  const maxBucket = Math.max(...bucketData.map((d) => d.count), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Value Analysis</h2>
        <InfoBadge
          whatItIs="Financial analysis of your pipeline by contract value."
          whatItMeans="Shows deal size distribution and weighted pipeline value."
          howCalculated="Weighted pipeline = sum of (value x Pwin) across all opportunities."
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Total Pipeline" value={fmtCurrency(totalValue)} />
        <SummaryCard label="Weighted Pipeline" value={fmtCurrency(weightedPipeline)} />
        <SummaryCard label="Average Deal" value={fmtCurrency(avgValue)} />
        <SummaryCard label="Median Deal" value={fmtCurrency(medianValue)} />
        <SummaryCard label="Largest Deal" value={fmtCurrency(maxValue)} />
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Deal Size Distribution</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 160, marginBottom: 16 }}>
        {bucketData.map((d, i) => {
          const colors = ["#6b7280", "#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e"];
          return (
            <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e5e5" }}>{d.count}</span>
              <div
                style={{
                  width: "100%",
                  maxWidth: 60,
                  height: `${(d.count / maxBucket) * 120}px`,
                  minHeight: d.count > 0 ? 8 : 0,
                  background: colors[i] + "55",
                  borderTop: `3px solid ${colors[i]}`,
                  borderRadius: "4px 4px 0 0",
                }}
              />
              <span style={{ fontSize: 11, color: "#8b949e", textAlign: "center" }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#161b22",
      border: "1px solid #30363d",
      borderRadius: 8,
      padding: "12px 16px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#8b949e", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{value}</div>
    </div>
  );
}
