import { type ReactNode } from "react";

export interface PanelProps {
  children: ReactNode;
  className?: string;
}

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <div className={`rounded-md border border-border bg-surface p-6 ${className}`}>
      {children}
    </div>
  );
}
