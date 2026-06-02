/**
 * F-421 formatting helpers for the unified opportunities list.
 * Pure functions, unit-tested directly.
 */

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Cents → "$1.2M" / "$850K" / "$1,200" style compact USD. */
export function formatValueCents(cents: number | null): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`;
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

/**
 * Whole days from `now` until the due date. Negative = overdue.
 * Returns null when there is no due date.
 */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const ms = due.getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** Human countdown label for a solicitation due date. */
export function dueCountdownLabel(iso: string | null, now: Date = new Date()): string | null {
  const days = daysUntil(iso, now);
  if (days == null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d left`;
}
