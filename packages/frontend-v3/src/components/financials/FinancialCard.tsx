"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SourceChip } from "@/components/shared/source-chip";

export function FinancialCard({
  label,
  value,
  plan,
  delta,
}: {
  label: string;
  value: string;
  plan: string | null;
  delta: number | null;
}) {
  return (
    <Card className="border-border bg-gda-panel">
      <CardContent className="py-4">
        <p className="text-[12px] text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
          {value}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[12px]">
          {plan !== null ? (
            <span className="text-muted-foreground">Plan: {plan}</span>
          ) : (
            <span className="text-muted-foreground italic">No plan data</span>
          )}
          {delta !== null && (
            <span
              className={
                delta >= 0 ? "text-gda-green-muted" : "text-gda-red"
              }
            >
              {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        <SourceChip
          label="Financial Bible"
          kind="real"
          className="mt-2"
        />
      </CardContent>
    </Card>
  );
}
