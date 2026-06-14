"use client";

import { useContractWaterfall } from "@/hooks/use-financial-bible";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";

export function ContractWaterfallTab({ fy }: { fy: string }) {
  const { data, isLoading, error } = useContractWaterfall(fy);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading {fy} contract vehicles...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load contract data: {error.message}
      </div>
    );
  }

  if (!data || data.contracts.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No contract vehicles found. Add contract vehicles via the Vehicles door
          to populate this tab.
        </p>
      </div>
    );
  }

  const activeCount = data.contracts.filter((c) => c.is_active).length;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        {activeCount} active contract vehicles
        {data.contracts.length - activeCount > 0 &&
          ` · ${data.contracts.length - activeCount} inactive`}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 text-left font-medium">Vehicle</th>
              <th className="py-2 pr-4 text-left font-medium">Contract #</th>
              <th className="py-2 pr-4 text-left font-medium">Type</th>
              <th className="py-2 pr-4 text-left font-medium">Agency</th>
              <th className="py-2 pr-4 text-left font-medium">NAICS</th>
              <th className="py-2 pr-4 text-right font-medium">Ceiling</th>
              <th className="py-2 pr-4 text-left font-medium">Expiration</th>
              <th className="py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border/50"
              >
                <td className="py-2 pr-4 font-medium text-foreground">
                  <div>{c.short_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.name}
                  </div>
                </td>
                <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                  {c.contract_number ?? <span className="italic">N/A</span>}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {c.vehicle_type}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {c.agency ?? <span className="italic">N/A</span>}
                </td>
                <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                  {c.naics_primary ?? <span className="italic">N/A</span>}
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={c.ceiling_value} format="money" />
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {c.expiration_date ?? <span className="italic">N/A</span>}
                </td>
                <td className="py-2">
                  {c.is_active ? (
                    <span className="rounded bg-gda-green-muted/20 px-2 py-0.5 text-[11px] font-medium text-gda-green-muted">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-gda-red/20 px-2 py-0.5 text-[11px] font-medium text-gda-red">
                      Inactive
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceFooter meta={data.meta} />
    </div>
  );
}
