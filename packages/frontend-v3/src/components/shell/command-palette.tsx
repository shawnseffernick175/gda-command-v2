"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

const ALL_COMMANDS = [
  ...NAV_ITEMS.map((n) => ({
    label: `Go to ${n.label}`,
    action: n.href,
    section: "Navigation",
  })),
  {
    label: "Run OODA on...",
    action: "/opportunities",
    section: "Tools",
  },
  {
    label: "Ask AI",
    action: "/opportunities",
    section: "Tools",
  },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const filtered = ALL_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = useCallback(
    (action: string) => {
      router.push(action);
      onClose();
      setQuery("");
    },
    [router, onClose],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else {
          /* parent sets open=true */
        }
      }
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-lg border border-border bg-gda-bg-raised shadow-2xl">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands, navigate..."
          className="w-full rounded-t-lg border-b border-border bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No results
            </p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={i}
                type="button"
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-foreground hover:bg-gda-panel"
                onClick={() => handleSelect(cmd.action)}
              >
                <span className="text-xs text-muted-foreground">
                  {cmd.section}
                </span>
                <span>{cmd.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
