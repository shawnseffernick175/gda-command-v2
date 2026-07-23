/**
 * Shared aging-bucket ordering + risk-semantic colors for AR/AP views.
 *
 * Buckets are rendered current → most-overdue with a green → red risk ramp so a
 * healthy (mostly-current) book reads instantly. Bucket labels are taken from
 * the ingested `age_bucket` field verbatim; only ordering/coloring is applied.
 */

const BUCKET_ORDER: string[] = [
  "Current",
  "1 to 30",
  "1-30",
  "31 to 60",
  "31-60",
  "61 to 90",
  "61-90",
  "Over 90",
  "90+",
];

/** CSS custom-property colors, current → overdue. */
const RISK_RAMP = [
  "var(--color-gda-green-muted)", // current / healthy
  "var(--color-fin-chart-green)",
  "var(--color-fin-chart-orange)", // watch
  "var(--color-fin-chart-orange)",
  "var(--color-fin-chart-red)", // at-risk / overdue
];

function orderIndex(bucket: string): number {
  const i = BUCKET_ORDER.findIndex(
    (b) => b.toLowerCase() === bucket.toLowerCase(),
  );
  return i === -1 ? BUCKET_ORDER.length : i;
}

/** True when a bucket represents overdue (anything past "Current"). */
export function isOverdue(bucket: string): boolean {
  return bucket.toLowerCase() !== "current";
}

/** Sort bucket entries current → most-overdue; unknown buckets sort last. */
export function orderBuckets<T>(
  entries: Array<[string, T]>,
): Array<[string, T]> {
  return [...entries].sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]));
}

/**
 * Risk color for an ordered bucket. `rank` is the bucket's position within the
 * ordered set and `total` the number of buckets, so the ramp scales to however
 * many buckets the source actually produced.
 */
export function bucketColor(bucket: string, rank: number, total: number): string {
  if (bucket.toLowerCase() === "current") return RISK_RAMP[0];
  if (total <= 1) return RISK_RAMP[RISK_RAMP.length - 1];
  // Map non-current buckets across the ramp's watch → risk segment.
  const idx = Math.min(
    RISK_RAMP.length - 1,
    1 + Math.round((rank / (total - 1)) * (RISK_RAMP.length - 2)),
  );
  return RISK_RAMP[idx];
}
