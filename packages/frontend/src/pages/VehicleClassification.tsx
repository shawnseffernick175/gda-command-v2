import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchVehicles,
  fetchVehicleOpportunities,
  classifyVehicles,
  type VehicleData,
  type VehicleSummaryRow,
  type OpportunityRow,
} from "../api/client";

function formatCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "$0";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  contract: "#3b82f6",
  agreement: "#8b5cf6",
  schedule: "#06b6d4",
  competition: "#22c55e",
  set_aside: "#f59e0b",
  order: "#ef4444",
  other: "#6b7280",
};

export default function VehicleClassification() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [summary, setSummary] = useState<VehicleSummaryRow[]>([]);
  const [totalOpps, setTotalOpps] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehicleOpps, setVehicleOpps] = useState<OpportunityRow[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchVehicles();
      if (env.success && env.data) {
        setVehicles(env.data.vehicles);
        setSummary(env.data.summary);
        setTotalOpps(env.data.total_opportunities);
      } else {
        setError(env.error?.message ?? "Failed to load vehicles");
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleVehicleClick = async (vehicleType: string) => {
    setSelectedVehicle(vehicleType);
    setVehicleLoading(true);
    try {
      const env = await fetchVehicleOpportunities(vehicleType);
      if (env.success && env.data) {
        setVehicleOpps(env.data.opportunities);
      }
    } catch {
      setVehicleOpps([]);
    } finally {
      setVehicleLoading(false);
    }
  };

  const handleClassify = async () => {
    setClassifying(true);
    try {
      await classifyVehicles();
      await load();
    } finally {
      setClassifying(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
        Loading vehicle classification...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ color: "#ef4444", marginBottom: 16 }}>Error: {error}</div>
        <button onClick={load} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
            Vehicle Classification
          </h1>
          <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 14 }}>
            {totalOpps} opportunities across {summary.length} vehicle types
          </p>
        </div>
        <button
          onClick={handleClassify}
          disabled={classifying}
          style={{
            padding: "8px 16px",
            background: classifying ? "#475569" : "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: classifying ? "default" : "pointer",
            fontSize: 13,
          }}
        >
          {classifying ? "Classifying..." : "Auto-Classify All"}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        {summary.slice(0, 6).map((s) => (
          <div
            key={s.vehicle_type}
            onClick={() => handleVehicleClick(s.vehicle_type)}
            style={{
              background: selectedVehicle === s.vehicle_type ? "#1e293b" : "#0f172a",
              border: selectedVehicle === s.vehicle_type ? "1px solid #3b82f6" : "1px solid #1e293b",
              borderRadius: 8,
              padding: 16,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: CATEGORY_COLORS[s.category] ?? "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>
                {s.category.replace("_", " ")}
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{s.count}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {formatCurrency(s.total_value)} total · {s.avg_score.toFixed(0)} avg score
            </div>
          </div>
        ))}
      </div>

      {/* Vehicle Type Table */}
      <div style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b" }}>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Vehicle Type</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Category</th>
              <th style={{ textAlign: "right", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Opps</th>
              <th style={{ textAlign: "right", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Total Value</th>
              <th style={{ textAlign: "right", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Avg Score</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => {
              const s = summary.find((x) => x.vehicle_type === v.key);
              return (
                <tr
                  key={v.key}
                  onClick={() => handleVehicleClick(v.key)}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    cursor: "pointer",
                    background: selectedVehicle === v.key ? "#1e293b" : "transparent",
                  }}
                >
                  <td style={{ padding: "10px 16px", color: "#e2e8f0" }}>
                    <span style={{ fontWeight: 600 }}>{v.label}</span>
                    {v.description && <span style={{ color: "#64748b", marginLeft: 8, fontSize: 12 }}>{v.description}</span>}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ color: CATEGORY_COLORS[v.category] ?? "#6b7280", fontSize: 12, fontWeight: 500 }}>
                      {v.category.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#f1f5f9", fontWeight: 600 }}>{s?.count ?? 0}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#94a3b8" }}>{formatCurrency(s?.total_value ?? 0)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#94a3b8" }}>{s?.avg_score?.toFixed(0) ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Vehicle Detail Panel */}
      {selectedVehicle && (
        <div style={{ marginTop: 24, background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", margin: 0 }}>
              {vehicles.find((v) => v.key === selectedVehicle)?.label ?? selectedVehicle} Opportunities
            </h2>
            <button
              onClick={() => setSelectedVehicle(null)}
              style={{ padding: "4px 12px", background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              Close
            </button>
          </div>
          {vehicleLoading ? (
            <div style={{ color: "#64748b", padding: 16, textAlign: "center" }}>Loading...</div>
          ) : vehicleOpps.length === 0 ? (
            <div style={{ color: "#64748b", padding: 16, textAlign: "center" }}>No opportunities classified under this vehicle type.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#94a3b8" }}>ID</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#94a3b8" }}>Title</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#94a3b8" }}>Agency</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Value</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Score</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#94a3b8" }}>Due</th>
                </tr>
              </thead>
              <tbody>
                {vehicleOpps.map((opp) => (
                  <tr
                    key={opp.id}
                    onClick={() => navigate(`/opportunities/${opp.id}`)}
                    style={{ borderBottom: "1px solid #1e293b", cursor: "pointer" }}
                  >
                    <td style={{ padding: "8px 12px", color: "#64748b", fontSize: 12 }}>{opp.id}</td>
                    <td style={{ padding: "8px 12px", color: "#e2e8f0" }}>{opp.title}</td>
                    <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{opp.agency ?? "—"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#94a3b8" }}>{formatCurrency(opp.value_estimated)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: opp.score >= 70 ? "#22c55e" : opp.score >= 40 ? "#f59e0b" : "#ef4444" }}>{opp.score}</td>
                    <td style={{ padding: "8px 12px", color: "#94a3b8", fontSize: 12 }}>{opp.due_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
