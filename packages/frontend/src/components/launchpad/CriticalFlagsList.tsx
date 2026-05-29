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

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};

function formatDateEST(dateStr: string): string {
  try {
    // Extract date-only portion to avoid UTC midnight → EST date-shift
    const datePart = dateStr.slice(0, 10); // "2026-04-29"
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
      <div
        style={{
          padding: 24,
          background: "#F7F6F2",
          borderRadius: 8,
          border: "1px solid #D4D1CA",
          color: "#6b7280",
          fontSize: 15,
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        No active flags.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {flags.map((flag) => {
        const accentColor = SEVERITY_COLORS[flag.severity] ?? SEVERITY_COLORS.info;
        const isExpanded = expanded[flag.id] ?? false;
        const detailText = flag.detail.replace(/⚠️/g, "");
        const truncated = detailText.length > 200 && !isExpanded;

        return (
          <div
            key={flag.id}
            style={{
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #D4D1CA",
              borderLeft: `4px solid ${accentColor}`,
              padding: 24,
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: accentColor,
                  flexShrink: 0,
                  marginTop: 6,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#28251D",
                      lineHeight: 1.3,
                    }}
                  >
                    {flag.title}
                  </span>
                  {flag.due_date && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        fontFeatureSettings: '"tnum"',
                        whiteSpace: "nowrap",
                      }}
                    >
                      Due: {formatDateEST(flag.due_date)}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    color: "#374151",
                    lineHeight: 1.5,
                  }}
                >
                  {truncated ? detailText.slice(0, 200) + "..." : detailText}
                  {detailText.length > 200 && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [flag.id]: !isExpanded }))}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#01696F",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 500,
                        marginLeft: 4,
                        padding: 0,
                      }}
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {flag.doctrine_anchor && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        fontStyle: "italic",
                      }}
                    >
                      {flag.doctrine_anchor}
                    </span>
                  )}
                  <button
                    onClick={() => handleDismiss(flag.id)}
                    disabled={dismissing === flag.id}
                    style={{
                      background: "none",
                      border: "1px solid #D4D1CA",
                      borderRadius: 4,
                      color: "#6b7280",
                      cursor: dismissing === flag.id ? "not-allowed" : "pointer",
                      fontSize: 12,
                      padding: "4px 12px",
                      marginLeft: "auto",
                      opacity: dismissing === flag.id ? 0.5 : 1,
                    }}
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
