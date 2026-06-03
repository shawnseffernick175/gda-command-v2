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
    <div className={cn("border-b border-border", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gda-panel/50"
      >
        <span
          className={cn(
            "text-xs text-muted-foreground transition-transform",
            isOpen && "rotate-90",
          )}
        >
          ▸
        </span>
        <span className="font-mono text-sm font-medium text-foreground">
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
