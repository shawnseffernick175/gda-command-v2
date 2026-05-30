export type SourceKind =
  | "sam_gov"
  | "fpds"
  | "usaspending"
  | "govwin"
  | "news"
  | "doctrine"
  | "partner_site"
  | "internal";

export interface SourceUrlChipProps {
  url: string;
  source_kind: SourceKind;
  retrieved_at: string;
  label?: string | undefined;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Retrieved just now";
  if (hours < 24) return `Retrieved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Retrieved ${days}d ago`;
}

export function SourceUrlChip({ url, retrieved_at, label }: SourceUrlChipProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={relativeTime(retrieved_at)}
      className={[
        "inline-flex items-center gap-1 h-6 px-2 rounded-full",
        "border border-border bg-surface-raised",
        "text-xs font-medium text-ink-primary",
        "hover:border-border-strong transition-colors duration-[var(--duration-state)]",
      ].join(" ")}
    >
      <span>{label || extractDomain(url)}</span>
      <span className="text-ink-muted">→</span>
    </a>
  );
}
