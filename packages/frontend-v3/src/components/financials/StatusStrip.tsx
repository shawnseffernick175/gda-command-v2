"use client";

import { useIngestionStatus } from "@/hooks/use-financial-bible";

function formatPeriodLabel(period: string | null): string {
  if (!period) return "N/A";
  const parts = period.replace("FY26 ", "").trim();
  const monthMap: Record<string, string> = {
    Jan: "JAN-26",
    Feb: "FEB-26",
    Mar: "MAR-26",
    Apr: "APR-26",
    May: "MAY-26",
    Jun: "JUN-26",
    Jul: "JUL-26",
    Aug: "AUG-26",
    Sep: "SEP-26",
    Oct: "OCT-26",
    Nov: "NOV-26",
    Dec: "DEC-26",
  };
  return monthMap[parts] ?? period;
}

function formatRefreshTime(ts: string | null): string {
  if (!ts) return "N/A";
  try {
    const d = new Date(ts);
    return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return ts;
  }
}

export function StatusStrip() {
  const { data, isLoading } = useIngestionStatus();

  if (isLoading) {
    return (
      <div className="rounded border border-border bg-card px-4 py-2 text-[12px] text-muted-foreground">
        Loading ingestion status...
      </div>
    );
  }

  if (!data || (data.docs_ingested === 0 && data.docs_total === 0 && !data.max_period)) {
    return (
      <div className="rounded border border-gda-amber/40 bg-gda-amber/10 px-4 py-3 text-[13px] text-gda-amber">
        No financial data ingested. Upload your monthly close package via Vault.
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-card px-4 py-2 text-[12px] text-muted-foreground">
      As of {formatPeriodLabel(data.max_period)}
      {" · "}
      {data.docs_ingested} of {data.docs_total} financial docs ingested
      {" · "}
      last refresh {formatRefreshTime(data.last_refresh)}
    </div>
  );
}
