import { useState, useEffect, useRef } from "react";

interface ProbeResult {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms: number;
  detail: string;
}

interface SentinelData {
  overall_status: "healthy" | "degraded" | "down" | "unknown";
  reason: string | null;
  taken_at: string | null;
  components: ProbeResult[];
  failing_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
  unknown: "#6b7280",
};

const STATUS_BG: Record<string, string> = {
  healthy: "rgba(34,197,94,0.08)",
  degraded: "rgba(245,158,11,0.08)",
  down: "rgba(239,68,68,0.08)",
  unknown: "rgba(107,114,128,0.08)",
};

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1h ago";
  return `${hours}h ago`;
}

function toEST(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " ET";
  } catch {
    return new Date(isoStr).toLocaleTimeString();
  }
}

export default function SystemStatusStrip() {
  const [data, setData] = useState<SentinelData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/sentinel/current");
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && body?.data) {
          setData(body.data as SentinelData);
        }
      } catch {
        // non-critical
      }
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  if (!data) return null;

  const color = STATUS_COLORS[data.overall_status] ?? STATUS_COLORS.unknown;
  const bg = STATUS_BG[data.overall_status] ?? STATUS_BG.unknown;
  const reason = data.reason
    ? data.reason.length > 120
      ? data.reason.slice(0, 117) + "..."
      : data.reason
    : "no status available";

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          background: bg,
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          color: "#374151",
          userSelect: "none",
        }}
        title="Click to expand system health details"
      >
        <span
          data-testid="sentinel-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ textTransform: "capitalize" }}>{data.overall_status}</span>
        <span style={{ color: "#6b7280", marginLeft: 4 }}>{reason}</span>
        {data.taken_at && (
          <span style={{ color: "#9ca3af", marginLeft: "auto", fontSize: 11, whiteSpace: "nowrap" }}>
            {formatTimeAgo(data.taken_at)}
          </span>
        )}
      </div>

      {expanded && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 100,
            padding: 12,
            maxWidth: 500,
          }}
        >
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
            {data.taken_at ? `Last checked: ${toEST(data.taken_at)}` : "No data"}
          </div>
          {data.components.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No component data available</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {data.components.map((c) => (
                <div
                  key={c.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    padding: "3px 0",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: STATUS_COLORS[c.status] ?? "#6b7280",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 600, minWidth: 120 }}>{c.name}</span>
                  <span style={{ color: "#6b7280", flex: 1 }}>{c.detail}</span>
                  <span style={{ color: "#9ca3af", fontSize: 11, whiteSpace: "nowrap" }}>
                    {c.latency_ms}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
