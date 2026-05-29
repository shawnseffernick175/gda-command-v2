import { useState } from "react";
import { authenticatedFetch } from "../../api/auth";

interface Flag {
  id: number;
  ou_tag: string;
  flag_key: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  due_date: string | null;
  doctrine_anchor: string | null;
  source_url: string | null;
  is_dismissed: boolean;
}

interface CriticalFlagsListProps {
  flags: Flag[];
  onRefresh: () => void;
}

function formatDateEST(dateStr: string): string {
  try {
    const datePart = dateStr.slice(0, 10);
    const d = new Date(datePart + "T12:00:00Z");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function SeverityBadge({ severity, title, dueDate }: { severity: string; title: string; dueDate: string | null }) {
  if (severity === "critical") {
    let label: string;
    if (dueDate) {
      const d = new Date(dueDate.slice(0, 10) + "T12:00:00Z");
      const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
      label = days > 0
        ? `CRITICAL — ${days} DAYS`
        : `EXPIRED ${formatDateEST(dueDate)}`;
    } else {
      label = title.toUpperCase().includes("EXPIRED") ? "EXPIRED" : title;
    }
    return (
      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-critical text-white">
        {label}
      </span>
    );
  }
  if (severity === "warning" && dueDate) {
    const d = new Date(dueDate.slice(0, 10) + "T12:00:00Z");
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    const label = days > 0 ? `EXPIRES IN ${days} DAYS` : `EXPIRED`;
    return (
      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold border border-amber-700 text-amber-700">
        {label}
      </span>
    );
  }
  return null;
}

export default function CriticalFlagsList({ flags, onRefresh }: CriticalFlagsListProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [dismissing, setDismissing] = useState<number | null>(null);

  const handleDismiss = async (flagId: number) => {
    setDismissing(flagId);
    try {
      await authenticatedFetch(`/api/launchpad/flags/${flagId}/dismiss`, {
        method: "POST",
      });
      onRefresh();
    } catch {
      // Silently fail — refresh will show current state
    } finally {
      setDismissing(null);
    }
  };

  if (flags.length === 0) {
    return (
      <div className="card text-muted text-body">
        No active flags.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {flags.map((flag) => {
        const isCritical = flag.severity === "critical";
        const isExpanded = expanded[flag.id] ?? false;
        const detailText = flag.detail.replace(/⚠️/g, "");
        const truncated = detailText.length > 200 && !isExpanded;

        return (
          <div
            key={flag.id}
            className={`card ${isCritical ? "border-l-4 border-l-critical" : "border-l-4 border-l-accent"}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <span className="text-[16px] font-semibold text-ink leading-tight">
                    {flag.title}
                  </span>
                  <SeverityBadge severity={flag.severity} title={flag.title} dueDate={flag.due_date} />
                  {flag.due_date && (
                    <span className="caption num whitespace-nowrap">
                      Due: {formatDateEST(flag.due_date)}
                    </span>
                  )}
                </div>
                <p className="m-0 text-body text-ink leading-relaxed">
                  {truncated ? detailText.slice(0, 200) + "..." : detailText}
                  {detailText.length > 200 && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [flag.id]: !isExpanded }))}
                      className="bg-transparent border-none text-accent cursor-pointer text-[13px] font-medium ml-1 p-0"
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </p>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {flag.doctrine_anchor && (
                    <span className="doctrine-tag">
                      {flag.doctrine_anchor}
                    </span>
                  )}
                  <button
                    onClick={() => handleDismiss(flag.id)}
                    disabled={dismissing === flag.id}
                    className={`btn ml-auto ${dismissing === flag.id ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {dismissing === flag.id ? "Dismissing..." : "Dismiss"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
