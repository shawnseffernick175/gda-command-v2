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
  unknown: "#7A7974",
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

  const dotColor = STATUS_COLORS[data.overall_status] ?? STATUS_COLORS.unknown;
  const allOk = data.overall_status === "healthy";
  const reason = data.reason
    ? data.reason.length > 120
      ? data.reason.slice(0, 117) + "..."
      : data.reason
    : "no status available";

  return (
    <div className="relative">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1 rounded cursor-pointer text-caption font-medium text-ink select-none bg-bg"
        title="Click to expand system health details"
      >
        {allOk ? (
          <span
            data-testid="sentinel-dot"
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: dotColor }}
          />
        ) : (
          <span className="text-[11px] font-semibold text-muted num">
            {data.failing_count} issue{data.failing_count !== 1 ? "s" : ""}
          </span>
        )}
        <span className="capitalize">{data.overall_status}</span>
        <span className="text-muted ml-1">{reason}</span>
        {data.taken_at && (
          <span className="text-muted ml-auto text-[11px] whitespace-nowrap num">
            {formatTimeAgo(data.taken_at)}
          </span>
        )}
      </div>

      {expanded && (
        <div
          ref={popoverRef}
          className="card absolute top-[calc(100%+4px)] left-0 right-0 z-[100] max-w-[500px]"
          style={{ padding: 16 }}
        >
          <div className="caption mb-2">
            {data.taken_at ? `Last checked: ${toEST(data.taken_at)}` : "No data"}
          </div>
          {data.components.length === 0 ? (
            <div className="text-caption text-muted">No component data available</div>
          ) : (
            <div className="flex flex-col gap-1">
              {data.components.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center gap-2 text-caption py-0.5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: STATUS_COLORS[c.status] ?? "#7A7974" }}
                  />
                  <span className="font-semibold min-w-[120px] text-ink">{c.name}</span>
                  <span className="text-muted flex-1">{c.detail}</span>
                  <span className="text-muted text-[11px] whitespace-nowrap num">
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
