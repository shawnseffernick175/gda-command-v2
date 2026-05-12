import { Link } from "react-router-dom";
import SourceBadge from "./SourceBadge";
import type { OpportunityRow as OppRow } from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  discovery: "#f59e0b",
  qualified: "#3b82f6",
  pipeline: "#8b5cf6",
  won: "#22c55e",
  lost: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  discovery: "Interest",
  qualified: "Qualify",
  pipeline: "Pursue",
  won: "Won",
  lost: "Lost",
};

function formatCurrency(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPwin(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--color-border)",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--color-border)",
  fontSize: 14,
};

interface OpportunityTableProps {
  opportunities: OppRow[];
  from?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (col: string) => void;
  emptyMessage?: string;
  showActions?: boolean;
  onAction?: (opp: OppRow) => void;
  actionLabel?: string;
}

export function OpportunityTableHead({
  sortBy,
  sortDir,
  onSort,
  showActions,
}: {
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (col: string) => void;
  showActions?: boolean;
}) {
  function sortArrow(col: string) {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const clickable = onSort ? { cursor: "pointer" as const } : {};

  return (
    <thead>
      <tr>
        <th style={thStyle}>ID</th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("title")}>
          Title{sortArrow("title")}
        </th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("department")}>
          Dept{sortArrow("department")}
        </th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("value_estimated")}>
          Value{sortArrow("value_estimated")}
        </th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("probability_of_win")}>
          Pwin{sortArrow("probability_of_win")}
        </th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("score")}>
          Score{sortArrow("score")}
        </th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("status")}>
          Status{sortArrow("status")}
        </th>
        <th style={thStyle}>NAICS Size</th>
        <th style={{ ...thStyle, ...clickable }} onClick={() => onSort?.("due_date")}>
          Due{sortArrow("due_date")}
        </th>
        {showActions && <th style={thStyle}>Actions</th>}
      </tr>
    </thead>
  );
}

export function OpportunityTableRow({
  opp,
  from,
  onAction,
  actionLabel,
}: {
  opp: OppRow;
  from?: string;
  onAction?: (opp: OppRow) => void;
  actionLabel?: string;
}) {
  const stageColor = STATUS_COLORS[opp.status] ?? "#6b7280";

  return (
    <tr
      style={{ transition: "background 0.15s", cursor: "pointer" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "var(--color-text-muted)" }}>
        <Link
          to={`/opportunities/${opp.id}`}
          state={{ from: from ?? "/" }}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {opp.id.length > 12 ? opp.id.slice(0, 12) : opp.id}
        </Link>
      </td>
      <td style={{ ...tdStyle, maxWidth: 320 }}>
        <Link
          to={`/opportunities/${opp.id}`}
          state={{ from: from ?? "/" }}
          style={{ color: "inherit", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{opp.title}</span>
          <SourceBadge source={opp.data_source} />
        </Link>
      </td>
      <td style={{ ...tdStyle, fontSize: 13, color: "var(--color-text-muted)", maxWidth: 180 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {opp.department ?? "—"}
        </div>
      </td>
      <td style={{ ...tdStyle, fontFamily: "monospace" }}>
        {formatCurrency(opp.value_estimated)}
      </td>
      <td style={tdStyle}>{formatPwin(opp.probability_of_win)}</td>
      <td
        style={{
          ...tdStyle,
          fontWeight: 700,
          color: opp.score >= 80 ? "#22c55e" : opp.score >= 60 ? "#f59e0b" : "#ef4444",
        }}
      >
        {opp.score.toFixed(1)}
      </td>
      <td style={tdStyle}>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 600,
            background: `${stageColor}20`,
            color: stageColor,
          }}
        >
          {STATUS_LABELS[opp.status] ?? opp.status}
        </span>
      </td>
      <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)" }}>
        {opp.naics_size === "small" ? "Small" : opp.naics_size === "large" ? "Large" : "—"}
      </td>
      <td style={{ ...tdStyle, color: "var(--color-text-muted)" }}>
        {formatDate(opp.due_date)}
      </td>
      {onAction && (
        <td style={tdStyle}>
          <button
            onClick={(e) => { e.stopPropagation(); onAction(opp); }}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-primary)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {actionLabel ?? "Action"}
          </button>
        </td>
      )}
    </tr>
  );
}

export default function OpportunityTable({
  opportunities,
  from,
  sortBy,
  sortDir,
  onSort,
  emptyMessage,
  showActions,
  onAction,
  actionLabel,
}: OpportunityTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <OpportunityTableHead
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          showActions={showActions}
        />
        <tbody>
          {opportunities.length === 0 ? (
            <tr>
              <td
                colSpan={showActions ? 10 : 9}
                style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-muted)", padding: "40px 12px" }}
              >
                {emptyMessage ?? "No opportunities found."}
              </td>
            </tr>
          ) : (
            opportunities.map((opp) => (
              <OpportunityTableRow
                key={opp.id}
                opp={opp}
                from={from}
                onAction={onAction}
                actionLabel={actionLabel}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
