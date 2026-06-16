"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { useVehicleDetail } from "@/hooks/use-vehicles";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreTooltip } from "@/components/shared/score-tooltip";
import { cn } from "@/lib/utils";

function formatCurrency(val: number | null): string {
  if (val == null) return "---";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "---";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export default function VehicleDetailPanel({
  vehicleId,
  onClose,
}: {
  vehicleId: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useVehicleDetail(vehicleId);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (isLoading) {
    return (
      <div className="w-[380px] shrink-0 rounded border border-border bg-white p-4 space-y-3">
        <Skeleton className="h-6 w-48 bg-gda-panel" />
        <Skeleton className="h-4 w-32 bg-gda-panel" />
        <Skeleton className="h-20 bg-gda-panel" />
      </div>
    );
  }

  if (!data) return null;

  const fields: [string, string | null][] = [
    ["Contract #", data.contract_number],
    ["Sponsor Agency", data.sponsor_agency ?? data.agency],
    ["Prime/Sub", data.prime_or_sub],
    ["Prime Contractor", data.prime_contractor],
    ["Ceiling", data.ceiling_value ? formatCurrency(data.ceiling_value) : null],
    ["PoP Start", formatDate(data.period_of_performance_start)],
    ["PoP End", formatDate(data.period_of_performance_end)],
    ["Expires", formatDate(data.expiration_date)],
    ["NAICS", data.naics_codes?.join(", ") ?? data.naics_primary],
    ["Set-Aside", data.set_aside_type],
    ["Vehicle Type", data.vehicle_type],
    ["Extraction Confidence", data.extraction_confidence],
  ];

  const isActive = data.status === "active";
  const isExpired = data.status === "expired";

  return (
    <div
      ref={panelRef}
      className="w-[380px] shrink-0 rounded border border-border bg-white p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]"
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-section font-semibold text-foreground">
            {data.short_name}
          </h2>
          <p className="text-xs text-muted-foreground">{data.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ×
        </button>
      </div>

      {data.needs_review && (
        <div className="rounded border border-amber-400/50 bg-amber-400/10 p-2 text-xs text-amber-600">
          Low extraction confidence — verify extracted fields against source
          document(s).
        </div>
      )}

      {data.extraction_confidence && (
        <ScoreTooltip
          label="Extraction Confidence"
          explanation="How many fields were successfully extracted. High = most fields found; Medium = some missing; Low = significant gaps."
          score={data.extraction_confidence}
        >
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
              data.extraction_confidence === "high" &&
                "border border-gda-green/30 text-gda-green bg-gda-green/10",
              data.extraction_confidence === "medium" &&
                "border border-amber-400/50 text-amber-600 bg-amber-400/10",
              data.extraction_confidence === "low" &&
                "border border-critical/30 text-critical bg-critical/10",
            )}
          >
            {data.extraction_confidence.toUpperCase()}
          </span>
        </ScoreTooltip>
      )}

      <div className="space-y-2">
        {fields.map(
          ([label, value]) =>
            value && (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-foreground font-mono text-right max-w-[200px] truncate tabular-nums">
                  {value}
                </span>
              </div>
            ),
        )}
      </div>

      {data.source_docs && data.source_docs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Source Documents
          </h3>
          {data.source_docs.map((doc) => (
            <Link
              key={doc.id}
              href={`/vault?doc=${doc.id}`}
              className="block rounded border border-border p-2 text-xs hover:bg-gda-bg-base transition-colors"
            >
              <span className="text-gda-green font-medium">{doc.filename}</span>
              <span className="ml-2 text-muted-foreground">
                {doc.doc_type}
              </span>
            </Link>
          ))}
        </div>
      )}

      {data.status && (
        <ScoreTooltip
          label="Status"
          explanation="Active if today is before Expires; Expired otherwise. Pending if no expiration date is available."
          score={data.status}
        >
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
              isActive && "border border-gda-green/30 text-gda-green bg-gda-green/10",
              isExpired && "bg-critical text-white",
              !isActive && !isExpired && "border border-border text-muted-foreground",
            )}
          >
            {data.status.toUpperCase()}
          </span>
        </ScoreTooltip>
      )}
    </div>
  );
}
