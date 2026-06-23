"use client";

import { useArData } from "@/hooks/use-financial-bible";
import { formatMoney } from "@/lib/format-money";

export function ArTab() {
  const { data, isLoading } = useArData();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        AR data not yet ingested. Upload an Aged AR report to populate.
      </p>
    );
  }

  const total = items.reduce((s, r) => s + r.amount, 0);

  const buckets = new Map<string, number>();
  for (const r of items) {
    const key = r.age_bucket ?? "Unclassified";
    buckets.set(key, (buckets.get(key) ?? 0) + r.amount);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} receivable{items.length !== 1 ? "s" : ""} &middot;
          Total {formatMoney(total)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[...buckets.entries()].map(([bucket, amt]) => (
          <div
            key={bucket}
            className="rounded border border-border bg-gda-panel p-3 space-y-1"
          >
            <p className="text-[11px] text-muted-foreground">{bucket}</p>
            <p className="text-base font-bold tabular-nums text-foreground">
              {formatMoney(amt)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-left font-medium">Invoice #</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Age Bucket</th>
              <th className="px-3 py-2 text-left font-medium">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-foreground">
                  {r.period}
                </td>
                <td className="px-3 py-2 text-left text-foreground">
                  {r.customer_name}
                </td>
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {r.invoice_number ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {formatMoney(r.amount)}
                </td>
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {r.age_bucket ?? "—"}
                </td>
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {r.due_date ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
