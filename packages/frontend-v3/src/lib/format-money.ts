/**
 * Compact money formatter for KPI tiles: $xxx.xxB/M/K (two decimals, abbreviated).
 * G3 rule — KPI tiles use compact format. Two decimals keep tiles legible at a
 * glance while still resolving to $10K, which one decimal rounds away at
 * millions scale ($19.0M hid the difference between $19.03M and $19.04M).
 */
export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
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
