import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNotifications, type NotificationItem } from "../api/client";

const TYPE_ICONS: Record<string, string> = {
  deadline: "⏰",
  milestone: "🏁",
  approval: "✓",
  intel: "🔍",
  risk: "⚠",
  system: "⚙",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#01696F",
};

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationCenter({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications()
      .then((env) => {
        if (env.success && env.data) {
          setNotifications(env.data.notifications);
          setUnread(env.data.unread);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleClick(n: NotificationItem) {
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const bellStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    fontSize: 16,
    padding: collapsed ? "8px 0" : "8px 12px",
    width: collapsed ? "100%" : "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    gap: 8,
    position: "relative" as const,
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={bellStyle} title="Notifications">
        <span style={{ position: "relative" }}>
          🔔
          {unread > 0 && (
            <span style={{
              position: "absolute",
              top: -4,
              right: -6,
              background: "#ef4444",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              borderRadius: "50%",
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {unread}
            </span>
          )}
        </span>
        {!collapsed && <span style={{ fontSize: 12 }}>Notifications</span>}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          bottom: collapsed ? 0 : "auto",
          top: collapsed ? "auto" : "100%",
          left: collapsed ? 52 : 0,
          width: 360,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          maxHeight: 480,
          overflowY: "auto",
          zIndex: 300,
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {unread > 0 && (
              <span style={{
                fontSize: 11,
                color: "#ef4444",
                fontWeight: 600,
              }}>
                {unread} unread
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 16px",
                  width: "100%",
                  background: n.read ? "transparent" : "rgba(59,130,246,0.04)",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--color-text)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(59,130,246,0.04)"; }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICONS[n.type] ?? "📎"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: n.read ? 400 : 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {n.title}
                    </span>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: SEVERITY_COLORS[n.severity],
                      flexShrink: 0,
                    }} />
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                    {timeAgo(n.timestamp)} · {n.source.replace("GDA.", "")}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
