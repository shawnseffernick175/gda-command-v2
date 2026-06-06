"use client";

import { useCollapseMemory } from "@/hooks/use-collapse-memory";
import { cn } from "@/lib/utils";

export function CollapseSection({
  id,
  title,
  count,
  defaultOpen = false,
  children,
  className,
}: {
  id: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { isOpen, toggle } = useCollapseMemory(id, defaultOpen);

  return (
    <div className={cn("rounded border border-border bg-gda-panel", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gda-panel/80"
      >
        <span className="font-mono text-sm font-medium text-foreground flex-1">
          {title}
        </span>
        {count !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">
            {count}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {isOpen ? "∧" : "∨"}
        </span>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
