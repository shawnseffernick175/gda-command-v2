/**
 * Shared formatting utilities used across pages.
 */

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatCurrency(v: number | null): string {
  if (v == null) return "-";
  const neg = v < 0;
  const abs = Math.abs(v);
  let str: string;
  if (abs >= 1_000_000_000) str = `$${(abs / 1_000_000_000).toFixed(1)}B`;
  else if (abs >= 1_000_000) str = `$${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) str = `$${(abs / 1_000).toFixed(0)}K`;
  else str = `$${abs.toLocaleString()}`;
  return neg ? `-${str}` : str;
}

export function formatPwin(v: number | null): string {
  if (v == null) return "-";
  return `${Math.round(v * 100)}%`;
}

export function formatDate(d: string | null): string {
  if (!d) return "-";
  const dt = new Date(d.includes("T") ? d : `${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function formatNumber(v: number | null): string {
  if (v == null) return "-";
  return v.toLocaleString();
}

export function formatPercent(v: number | null, decimals = 0): string {
  if (v == null) return "-";
  return `${v.toFixed(decimals)}%`;
}

export function getTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (Number.isNaN(diff)) return "";
  const absDiff = Math.abs(diff);
  const hrs = Math.floor(absDiff / 3_600_000);
  const days = Math.floor(hrs / 24);
  const suffix = diff < 0 ? " overdue" : "";
  if (days > 0) return `${days}d${suffix}`;
  return `${hrs}h${suffix}`;
}
