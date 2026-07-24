"use client";

import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

// Gap 2 — per-contract cost composition & indirect rate variance from the
// authoritative "Revenue Summary by Cost Pool" book. A null value means the
// element is not sourced for this row ("not available", R1); a real 0 is a
// genuine $0 of that element and is shown as $0, never as "—".
function cell(v: number | null): string {
  return v == null ? "—" : formatMoney(v);
}

function Row({
  label,
  value,
  indent,
  strong,
}: {
  label: string;
  value: number | null;
  indent?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-0.5 text-[12px]",
        strong && "font-medium text-fin-ink",
        !strong && "text-muted-foreground",
      )}
    >
      <span className={cn(indent && "pl-3")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          value == null ? "text-muted-foreground" : "text-fin-ink",
        )}
      >
        {cell(value)}
      </span>
    </div>
  );
}

export function CostCompositionCard({ project }: { project: ProjectFullRow }) {
  const directRows: Array<[string, number | null]> = [
    ["Direct Labor — Offsite", project.dc_dl_offsite],
    ["Direct Labor — Onsite", project.dc_dl_onsite],
    ["Direct Travel", project.dc_direct_travel],
    ["Subcontract Labor", project.dc_subk_labor],
    ["Subcontract Travel", project.dc_subk_travel],
    ["Subcontract Material", project.dc_subk_material],
    ["Consultant Labor", project.dc_consultant_labor],
    ["Consultant Travel", project.dc_consultant_travel],
    ["Direct Material", project.dc_direct_material],
    ["Direct ODC", project.dc_direct_odc],
  ];
  const indirectRows: Array<[string, number | null]> = [
    ["Overhead — Offsite", project.ind_oh_offsite],
    ["Overhead — Onsite", project.ind_oh_onsite],
    ["Material Handling (MHx)", project.ind_mhx],
    ["G&A", project.ind_gna],
  ];

  const hasAny =
    directRows.some(([, v]) => v != null) ||
    indirectRows.some(([, v]) => v != null) ||
    project.gross_profit != null ||
    project.rate_variance != null;

  if (!hasAny) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">
          No cost-composition data for this period yet
        </p>
      </div>
    );
  }

  const rateVar = project.rate_variance;

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-fin-ink">Cost Composition</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Direct-cost mix, indirect split, and rate variance — Revenue Summary by
        Cost Pool
        {project.source_doc_id != null ? ` (doc ${project.source_doc_id})` : ""}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Direct Cost
          </div>
          {directRows.map(([label, v]) => (
            <Row key={label} label={label} value={v} indent />
          ))}
          <div className="mt-1 border-t border-border pt-1">
            <Row label="Total Direct Cost" value={project.direct_cost} strong />
          </div>
          <div className="mt-1">
            <Row label="Gross Profit" value={project.gross_profit} strong />
          </div>
        </div>

        <div>
          <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Indirect Cost
          </div>
          {indirectRows.map(([label, v]) => (
            <Row key={label} label={label} value={v} indent />
          ))}
          <div className="mt-1 border-t border-border pt-1">
            <Row
              label="Total Indirect (Actual)"
              value={project.indirect_cost}
              strong
            />
          </div>
          <Row
            label="Total Indirect (Target)"
            value={project.total_indirect_tgt}
          />
          {/* Rate Variance = actual indirect − target: negative means actual
              underran target (favorable → green); positive overran (red). */}
          <div className="mt-1 flex items-center justify-between py-0.5 text-[12px] font-medium">
            <span className="text-fin-ink">Rate Variance</span>
            <span
              className={cn(
                "tabular-nums",
                rateVar == null || rateVar === 0
                  ? "text-muted-foreground"
                  : rateVar < 0
                    ? "text-gda-green"
                    : "text-gda-red",
              )}
            >
              {cell(rateVar)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
