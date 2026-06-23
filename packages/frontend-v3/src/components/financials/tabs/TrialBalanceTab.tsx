"use client";

import { useTrialBalance } from "@/hooks/use-financial-bible";
import { formatMoney } from "@/lib/format-money";

export function TrialBalanceTab() {
  const { data, isLoading } = useTrialBalance();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Trial balance data not yet ingested. Upload a Trail Balance report to
        populate.
      </p>
    );
  }

  const totalDebit = items.reduce((s, r) => s + r.debit, 0);
  const totalCredit = items.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} account{items.length !== 1 ? "s" : ""} &middot; Debits{" "}
          {formatMoney(totalDebit)} &middot; Credits {formatMoney(totalCredit)}
        </p>
      </div>

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-left font-medium">Acct Code</th>
              <th className="px-3 py-2 text-left font-medium">Account Name</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 text-right font-medium">Net Balance</th>
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
                <td className="px-3 py-2 text-left text-muted-foreground font-mono">
                  {r.account_code}
                </td>
                <td className="px-3 py-2 text-left text-foreground">
                  {r.account_name}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {r.debit > 0 ? formatMoney(r.debit) : "—"}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {r.credit > 0 ? formatMoney(r.credit) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatMoney(r.net_balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
