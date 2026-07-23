"use client";

import type { FinancialMeta } from "@/lib/types";

function formatTimestamp(ts: string | number | null): string {
  if (!ts) return "N/A";
  try {
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
    return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return String(ts);
  }
}

export function SourceFooter({ meta }: { meta: FinancialMeta | undefined }) {
  if (!meta) return null;

  const sourceLabels = meta.sources.map((s) => {
    if (s.filename) return s.filename;
    if (s.table) return s.table;
    if (s.label) return s.label;
    return "unknown";
  });

  const parsers = meta.sources
    .filter((s) => s.parser)
    .map((s) => s.parser);
  const uniqueParsers = [...new Set(parsers)];

  return (
    <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
      Source: {sourceLabels.join(", ")}
      {uniqueParsers.length > 0 && (
        <>
          {" · "}parser: {uniqueParsers.join(", ")}
        </>
      )}
      {meta.last_refresh && (
        <>
          {" · "}refreshed {formatTimestamp(meta.last_refresh)}
        </>
      )}
      {meta.period && (
        <>
          {" · "}{meta.period}
        </>
      )}
    </div>
  );
}
