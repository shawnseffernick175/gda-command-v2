import * as RadixToast from "@radix-ui/react-toast";
import { type ReactNode, createContext, useContext, useState, useCallback } from "react";

export interface ToastData {
  id: string;
  severity: "info" | "success" | "warning" | "error";
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toast: (data: Omit<ToastData, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);

const severityBar: Record<ToastData["severity"], string> = {
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-critical",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((data: Omit<ToastData, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-2), { ...data, id }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      <RadixToast.Provider>
        {children}
        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            duration={t.severity === "error" ? Infinity : (t.duration ?? 5000)}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }}
            className={[
              "rounded-md border border-border bg-surface-raised",
              "flex items-center gap-3 px-4 py-3 max-w-sm",
            ].join(" ")}
          >
            <div className={`w-[3px] h-6 rounded-full ${severityBar[t.severity]}`} />
            <RadixToast.Description className="text-sm text-ink-primary flex-1">
              {t.message}
            </RadixToast.Description>
            {t.action && (
              <RadixToast.Action altText={t.action.label} asChild>
                <button
                  onClick={t.action.onClick}
                  className="text-xs text-accent font-medium hover:text-accent-hover"
                >
                  {t.action.label}
                </button>
              </RadixToast.Action>
            )}
            <RadixToast.Close className="text-ink-muted hover:text-ink-primary text-sm">
              ×
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
