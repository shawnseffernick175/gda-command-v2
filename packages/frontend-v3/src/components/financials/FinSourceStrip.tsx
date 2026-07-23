"use client";

/**
 * Lightweight per-tab source/as-of strip for the AR/AP/Trial-Balance/Project-
 * Revenue views, whose API `meta` is just `{ table, row_count }`. Satisfies R1
 * (every view names the ingested table and period it was derived from).
 */
export function FinSourceStrip({
  table,
  rowCount,
  period,
  note,
}: {
  table: string;
  rowCount: number;
  period?: string | null;
  note?: string | null;
}) {
  return (
    <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
      Source: ingested table <code className="text-foreground">{table}</code>
      {" · "}
      {rowCount.toLocaleString()} rows
      {period ? <>{" · "}period {period}</> : null}
      {note ? <>{" · "}{note}</> : null}
    </div>
  );
}
