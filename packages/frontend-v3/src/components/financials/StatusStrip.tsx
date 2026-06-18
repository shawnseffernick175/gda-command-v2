"use client";

import { useIngestionStatus } from "@/hooks/use-financial-bible";

const MONTH_ABBR: Record<string, string> = {
  jan: "JAN",
  feb: "FEB",
  mar: "MAR",
  apr: "APR",
  may: "MAY",
  jun: "JUN",
  jul: "JUL",
  aug: "AUG",
  sep: "SEP",
  oct: "OCT",
  nov: "NOV",
  dec: "DEC",
};

// Derive a "MON-YY" label from any "FY<yy> <Mon>" / "CY<yy> <Mon>" period
// string, reading the year from the data rather than assuming a fixed FY.
function formatPeriodLabel(period: string | null): string {
  if (!period) return "N/A";
  const yearMatch = period.match(/(?:FY|CY)\s*(\d{2,4})/i);
  const year = yearMatch ? yearMatch[1].slice(-2) : null;
  const monthMatch = period.match(/\b([A-Za-z]{3,})\b/g);
  // Find the first token that maps to a month abbreviation.
  const month = monthMatch
    ?.map((t) => MONTH_ABBR[t.slice(0, 3).toLowerCase()])
    .find(Boolean);
  if (month && year) return `${month}-${year}`;
  return period;
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
