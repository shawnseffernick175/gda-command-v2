"use client";

import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

export function ItdBurnChart({ project }: { project: ProjectFullRow }) {
  const funded = project.itd_funding;
  const billed = project.itd_billed_amount;
  const contractValue = project.itd_value;
  const remaining = Math.max(contractValue - billed, 0);
  const burnPct = contractValue > 0 ? (billed / contractValue) * 100 : 0;

  const hasData = contractValue > 0 || funded > 0 || billed > 0;

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No ITD contract data yet</p>
      </div>
    );
  }

  const billedPct = contractValue > 0 ? Math.min((billed / contractValue) * 100, 100) : 0;
  const fundedPct = contractValue > 0 ? Math.min((funded / contractValue) * 100, 100) : 0;

  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-fin-ink">ITD Contract Burn</h3>
        <span className="text-xs text-muted-foreground">{burnPct.toFixed(1)}% consumed</span>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Billed vs Contract Value</span>
            <span>{formatMoney(billed)} / {formatMoney(contractValue)}</span>
          </div>
          <div className="relative h-7 overflow-hidden rounded bg-fin-sand/30">
            <div
              className="absolute inset-y-0 left-0 flex items-center rounded-l bg-fin-teal px-2"
              style={{ width: `${Math.max(billedPct, 1)}%` }}
            >
              {billedPct > 15 && (
                <span className="text-[11px] font-semibold text-white">{formatMoney(billed)}</span>
              )}
            </div>
            {billedPct < 85 && (
              <div
                className="absolute inset-y-0 flex items-center px-2 text-[11px] text-fin-ink"
                style={{ left: `${billedPct + 1}%` }}
              >
                {formatMoney(remaining)} remaining
              </div>
            )}
          </div>
        </div>

        {funded > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Funded</span>
              <span>{formatMoney(funded)}</span>
            </div>
            <div className="relative h-4 overflow-hidden rounded bg-fin-sand/30">
              <div
                className="absolute inset-y-0 left-0 rounded bg-fin-stone/40"
                style={{ width: `${Math.max(fundedPct, 1)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-4 text-center text-xs">
        <div>
          <p className="text-muted-foreground">Contract Value</p>
          <p className="font-medium text-foreground">{formatMoney(contractValue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Funded</p>
          <p className="font-medium text-foreground">{formatMoney(funded)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Billed</p>
          <p className="font-medium text-foreground">{formatMoney(billed)}</p>
        </div>
      </div>
    </div>
  );
}
