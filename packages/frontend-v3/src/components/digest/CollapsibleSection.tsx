"use client";

import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  id: string;
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

function getStoredState(id: string, defaultVal: boolean): boolean {
  if (typeof window === "undefined") return defaultVal;
  const stored = localStorage.getItem(`digest-section-${id}`);
  if (stored === null) return defaultVal;
  return stored === "1";
}

function setStoredState(id: string, expanded: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`digest-section-${id}`, expanded ? "1" : "0");
}

export default function CollapsibleSection({
  id,
  title,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(getStoredState(id, defaultExpanded));
  }, [id, defaultExpanded]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    setStoredState(id, next);
  }

  return (
    <div className="rounded border border-border bg-gda-panel">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-gda-panel-alt"
      >
        <h2 className="font-mono text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          {title}
        </h2>
        <span
          className={cn(
            "font-mono text-muted-foreground transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        >
          &#x25BE;
        </span>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
