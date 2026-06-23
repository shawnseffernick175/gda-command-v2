"use client";

import { useIngestionCoverage } from "@/hooks/use-financial-bible";
import { cn } from "@/lib/utils";

export function IngestionCoverageTab() {
  const { data, isLoading } = useIngestionCoverage();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  const coverage = data?.coverage ?? [];
  const summary = data?.summary ?? {
    total: 0,
    ingested: 0,
    no_handler: 0,
    extraction_failed: 0,
  };

  if (coverage.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No financial documents found in the Vault.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Total Docs</p>
          <p className="text-base font-bold tabular-nums text-foreground">
            {summary.total}
          </p>
        </div>
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Ingested</p>
          <p className="text-base font-bold tabular-nums text-gda-green">
            {summary.ingested}
          </p>
        </div>
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">No Handler</p>
          <p className="text-base font-bold tabular-nums text-amber-400">
            {summary.no_handler}
          </p>
        </div>
        <div className="rounded border border-border bg-gda-panel p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Extraction Failed
          </p>
          <p className="text-base font-bold tabular-nums text-red-400">
            {summary.extraction_failed}
          </p>
        </div>
      </div>

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Doc ID</th>
              <th className="px-3 py-2 text-left font-medium">Filename</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">
                Destination Tables
              </th>
              <th className="px-3 py-2 text-right font-medium">Total Rows</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((doc) => (
              <tr
                key={doc.doc_id}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {doc.doc_id}
                </td>
                <td className="px-3 py-2 text-left text-foreground">
                  {doc.filename}
                </td>
                <td className="px-3 py-2 text-left">
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                      doc.status === "ingested" &&
                        "bg-gda-green/15 text-gda-green",
                      doc.status === "no_handler" &&
                        "bg-amber-400/15 text-amber-400",
                      doc.status === "extraction_failed" &&
                        "bg-red-400/15 text-red-400",
                    )}
                  >
                    {doc.status === "ingested"
                      ? "Ingested"
                      : doc.status === "no_handler"
                        ? "No Handler"
                        : "Extract Failed"}
                  </span>
                </td>
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {doc.destinations.length > 0
                    ? doc.destinations
                        .map((d) => `${d.table} (${d.row_count})`)
                        .join(", ")
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {doc.destinations.reduce((s, d) => s + d.row_count, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
