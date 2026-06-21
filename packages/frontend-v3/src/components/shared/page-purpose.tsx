import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PagePurposeProps {
  /** Page title shown as the heading. */
  title: string;
  /**
   * One or two plain-language sentences describing what the page is for
   * and how to use it.
   */
  purpose: string;
  /** Optional trailing content (counts, actions) rendered on the same row. */
  children?: ReactNode;
  className?: string;
}

/**
 * Standard page header: a title plus a short "what this page is for"
 * subtitle. Used at the top of every page so users always know the
 * purpose of the surface they're looking at.
 */
export function PagePurpose({
  title,
  purpose,
  children,
  className,
}: PagePurposeProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-mono text-lg font-bold text-foreground">{title}</h1>
        <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {purpose}
        </p>
      </div>
      {children != null && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}
