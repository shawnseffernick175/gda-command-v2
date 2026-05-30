import { type ReactNode } from "react";

export interface FieldProps {
  label: string;
  value: ReactNode;
  sourceUrl: string;
}

export function Field({ label, value, sourceUrl }: FieldProps) {
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-0.5 group"
    >
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-sm text-ink-primary group-hover:text-accent transition-colors duration-[var(--duration-state)]">
        {value}
      </span>
    </a>
  );
}
