import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _nextId = 0;

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: "rgba(34,197,94,0.12)", border: "#22c55e", icon: "\u2713" },
  error: { bg: "rgba(239,68,68,0.12)", border: "#ef4444", icon: "\u2717" },
  info: { bg: "rgba(59,130,246,0.12)", border: "#01696F", icon: "\u2139" },
  warning: { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", icon: "\u26A0" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const ctx: ToastContextValue = {
    toast: addToast,
    success: (m) => addToast(m, "success"),
    error: (m) => addToast(m, "error"),
    info: (m) => addToast(m, "info"),
    warning: (m) => addToast(m, "warning"),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        pointerEvents: "none",
      }}>
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [exiting, setExiting] = useState(false);
  const s = TYPE_STYLES[item.type];

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), item.duration - 300);
    const removeTimer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [item.id, item.duration, onDismiss]);

  return (
    <div style={{
      pointerEvents: "auto",
      background: "#FFFFFF",
      border: `1px solid ${s.border}`,
      borderRadius: 8,
      padding: "10px 16px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 280,
      maxWidth: 420,
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      opacity: exiting ? 0 : 1,
      transform: exiting ? "translateX(20px)" : "translateX(0)",
      transition: "opacity 0.3s, transform 0.3s",
    }}>
      <span style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: s.bg,
        color: s.border,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {s.icon}
      </span>
      <span style={{ fontSize: 13, color: "#e4e4e7", flex: 1, lineHeight: 1.4 }}>
        {item.message}
      </span>
      <button
        onClick={() => onDismiss(item.id)}
        style={{
          background: "transparent",
          border: "none",
          color: "#6b7280",
          cursor: "pointer",
          fontSize: 14,
          padding: "2px 4px",
          flexShrink: 0,
        }}
      >
        &times;
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
