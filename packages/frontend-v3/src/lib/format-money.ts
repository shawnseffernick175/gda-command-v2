/**
 * Compact money formatter for KPI tiles: $xx.xB/M/K (one decimal, abbreviated).
 * G3 rule — KPI tiles use compact format.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Full money formatter for table/detail cells: $xx,xxx,xxx (comma-grouped, whole dollars).
 * G3 rule — input/detail cells use comma-grouped whole dollars.
 */
export function formatMoneyFull(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
