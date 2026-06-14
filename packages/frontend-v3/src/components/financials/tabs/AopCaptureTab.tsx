"use client";

import { useAopCapture } from "@/hooks/use-financial-bible";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";

const STAGE_LABELS: Record<string, string> = {
  interest: "Investigating",
  qualify: "Qualify",
  pursue: "Pursue",
  proposal: "Proposal",
  post_submittal: "Submitted",
};

export function AopCaptureTab({ fy }: { fy: string }) {
  const { data, isLoading, error } = useAopCapture(fy);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading {fy} capture pipeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load capture data: {error.message}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No capture plans active. Move opportunities from Opportunities to
          Pursue to populate this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        {data.items.length} active capture{data.items.length !== 1 ? "s" : ""}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 text-left font-medium">Title</th>
              <th className="py-2 pr-4 text-left font-medium">Agency</th>
              <th className="py-2 pr-4 text-left font-medium">Stage</th>
              <th className="py-2 pr-4 text-right font-medium">Value</th>
              <th className="py-2 pr-4 text-right font-medium">pWin</th>
              <th className="py-2 pr-4 text-left font-medium">Owner</th>
              <th className="py-2 text-left font-medium">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-border/50"
              >
                <td className="max-w-[300px] truncate py-2 pr-4 font-medium text-foreground">
                  {item.title}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {item.agency ?? <span className="italic">N/A</span>}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded bg-fin-navy/30 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {STAGE_LABELS[item.stage] ?? item.stage}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={item.value} format="money" />
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={item.pwin} format="percent" />
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {item.capture_owner}
                </td>
                <td className="py-2 text-muted-foreground">
                  {item.response_due_at ?? <span className="italic">N/A</span>}
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
