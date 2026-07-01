"use client";

import { useState, useCallback } from "react";
import {
  useFinancialBibleRates,
  useFinancialBibleActive,
  useCreatePricingScenario,
  usePricingScenarios,
} from "@/hooks/use-financial-bible-upload";
import { MarginGauge } from "@/components/financials/MarginGauge";
import { cn } from "@/lib/utils";

function fmt$(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface LaborLine {
  labor_category: string;
  clearance: string;
  hours: number;
  rate_override?: number;
}

interface OdcLine {
  category: string;
  amount: number;
  description?: string;
}

interface Props {
  opportunityId?: number;
  captureId?: number;
  opportunityTitle?: string;
}

export function PricingScenarioPanel({
  opportunityId,
  captureId,
  opportunityTitle,
}: Props) {
  const activeQ = useFinancialBibleActive();
  const ratesQ = useFinancialBibleRates();
  const createMut = useCreatePricingScenario();
  const scenariosQ = usePricingScenarios(
    opportunityId
      ? { opportunity_id: opportunityId }
      : captureId
        ? { capture_id: captureId }
        : undefined,
  );

  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [contractType, setContractType] = useState("T&M");
  const [periodMonths, setPeriodMonths] = useState(12);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([
    { labor_category: "", clearance: "None", hours: 0 },
  ]);
  const [odcLines, setOdcLines] = useState<OdcLine[]>([]);

  const hasActive = !!activeQ.data?.active;
  const scenarios = scenariosQ.data?.items ?? [];

  const addLaborLine = useCallback(() => {
    setLaborLines((prev) => [
      ...prev,
      { labor_category: "", clearance: "None", hours: 0 },
    ]);
  }, []);

  const removeLaborLine = useCallback((idx: number) => {
    setLaborLines((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateLaborLine = useCallback(
    (idx: number, field: keyof LaborLine, value: string | number) => {
      setLaborLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

  const addOdcLine = useCallback(() => {
    setOdcLines((prev) => [...prev, { category: "", amount: 0 }]);
  }, []);

  const removeOdcLine = useCallback((idx: number) => {
    setOdcLines((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateOdcLine = useCallback(
    (idx: number, field: keyof OdcLine, value: string | number) => {
      setOdcLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    const validLabor = laborLines.filter(
      (l) => l.labor_category.trim() && l.hours > 0,
    );
    if (validLabor.length === 0) return;

    await createMut.mutateAsync({
      title: title.trim(),
      opportunity_id: opportunityId ?? null,
      capture_id: captureId ?? null,
      contract_type: contractType,
      period_months: periodMonths,
      labor_mix: validLabor,
      odc_items: odcLines.filter((o) => o.category.trim() && o.amount > 0),
    });

    setTitle("");
    setLaborLines([{ labor_category: "", clearance: "None", hours: 0 }]);
    setOdcLines([]);
    setExpanded(false);
  }, [
    title,
    laborLines,
    odcLines,
    contractType,
    periodMonths,
    opportunityId,
    captureId,
    createMut,
  ]);

  return (
    <div className="space-y-3">
      {/* Existing scenarios */}
      {scenarios.length > 0 && (
        <div className="space-y-2">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="rounded border border-border bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {s.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.contract_type} · {s.period_months}mo ·{" "}
                    {new Date(s.created_at).toLocaleDateString("en-US", {
                      timeZone: "America/New_York",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[13px] font-medium tabular-nums text-foreground">
                      {fmt$(s.total_price)}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      cost {fmt$(s.total_cost)}
                    </p>
                  </div>
                  <MarginGauge
                    marginPct={s.margin_pct}
                    doctrinePass={s.doctrine_pass}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Build new scenario */}
      {!hasActive ? (
        <p className="text-[13px] text-muted-foreground">
          No active Financial Bible version. Upload files from the Financial
          Bible page to build pricing scenarios.
        </p>
      ) : !expanded ? (
        <button
          type="button"
          className="rounded border border-accent bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#015C61]"
          onClick={() => {
            setExpanded(true);
            if (!title && opportunityTitle) {
              setTitle(`Pricing — ${opportunityTitle.slice(0, 60)}`);
            }
          }}
        >
          Build Pricing Scenario
        </button>
      ) : (
        <div className="rounded border border-border bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="text-[15px] font-semibold text-foreground">
            New Pricing Scenario
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-[12px] font-medium text-muted-foreground mb-1">
                Scenario Title
              </label>
              <input
                type="text"
                className="w-full rounded border border-border px-3 py-1.5 text-[13px] text-foreground"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-muted-foreground mb-1">
                Contract Type
              </label>
              <select
                className="w-full rounded border border-border px-3 py-1.5 text-[13px] text-foreground bg-white"
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
              >
                <option value="T&M">T&M</option>
                <option value="FFP">FFP</option>
                <option value="CPFF">CPFF</option>
                <option value="CPAF">CPAF</option>
                <option value="CPIF">CPIF</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-muted-foreground mb-1">
              Period (months)
            </label>
            <input
              type="number"
              className="w-24 rounded border border-border px-3 py-1.5 text-[13px] text-foreground tabular-nums"
              value={periodMonths}
              onChange={(e) =>
                setPeriodMonths(Math.max(1, parseInt(e.target.value) || 12))
              }
            />
          </div>

          {/* Labor lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                Labor Mix
              </span>
              <button
                type="button"
                className="text-[12px] font-medium text-accent hover:underline"
                onClick={addLaborLine}
              >
                + Add Line
              </button>
            </div>
            {laborLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Labor Category"
                  className="flex-1 rounded border border-border px-2 py-1 text-[13px] text-foreground"
                  value={line.labor_category}
                  onChange={(e) =>
                    updateLaborLine(idx, "labor_category", e.target.value)
                  }
                  list="rate-suggestions"
                />
                <input
                  type="text"
                  placeholder="Clearance"
                  className="w-28 rounded border border-border px-2 py-1 text-[13px] text-foreground"
                  value={line.clearance}
                  onChange={(e) =>
                    updateLaborLine(idx, "clearance", e.target.value)
                  }
                />
                <input
                  type="number"
                  placeholder="Hours"
                  className="w-20 rounded border border-border px-2 py-1 text-[13px] text-foreground tabular-nums"
                  value={line.hours || ""}
                  onChange={(e) =>
                    updateLaborLine(
                      idx,
                      "hours",
                      parseInt(e.target.value) || 0,
                    )
                  }
                />
                {laborLines.length > 1 && (
                  <button
                    type="button"
                    className="text-[12px] text-muted-foreground hover:text-critical"
                    onClick={() => removeLaborLine(idx)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {/* Datalist for rate suggestions */}
            <datalist id="rate-suggestions">
              {(ratesQ.data?.items ?? []).map((r, i) => (
                <option key={i} value={r.labor_category} />
              ))}
            </datalist>
          </div>

          {/* ODC lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                ODCs (optional)
              </span>
              <button
                type="button"
                className="text-[12px] font-medium text-accent hover:underline"
                onClick={addOdcLine}
              >
                + Add ODC
              </button>
            </div>
            {odcLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Category"
                  className="flex-1 rounded border border-border px-2 py-1 text-[13px] text-foreground"
                  value={line.category}
                  onChange={(e) =>
                    updateOdcLine(idx, "category", e.target.value)
                  }
                />
                <input
                  type="number"
                  placeholder="Amount"
                  className="w-28 rounded border border-border px-2 py-1 text-[13px] text-foreground tabular-nums"
                  value={line.amount || ""}
                  onChange={(e) =>
                    updateOdcLine(
                      idx,
                      "amount",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
                <button
                  type="button"
                  className="text-[12px] text-muted-foreground hover:text-critical"
                  onClick={() => removeOdcLine(idx)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Result preview (if mutation completed) */}
          {createMut.isSuccess && createMut.data && (
            <div className="rounded border border-border bg-gda-bg-deep p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">
                  Result
                </span>
                <MarginGauge
                  marginPct={createMut.data.margin_pct}
                  doctrinePass={createMut.data.doctrine_pass}
                />
              </div>
              <div className="grid grid-cols-4 gap-4 text-[13px]">
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Direct Labor
                  </p>
                  <p className="tabular-nums font-medium">
                    {fmt$(createMut.data.cost_breakdown.direct_labor)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Total Cost
                  </p>
                  <p className="tabular-nums font-medium">
                    {fmt$(createMut.data.cost_breakdown.total_cost)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Total Price
                  </p>
                  <p className="tabular-nums font-medium">
                    {fmt$(createMut.data.cost_breakdown.total_price)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Fee</p>
                  <p className="tabular-nums font-medium">
                    {fmt$(createMut.data.cost_breakdown.fee)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={
                !title.trim() ||
                laborLines.every((l) => !l.labor_category.trim() || !l.hours) ||
                createMut.isPending
              }
              className={cn(
                "rounded border px-4 py-1.5 text-[13px] font-medium transition-colors",
                title.trim() &&
                  laborLines.some(
                    (l) => l.labor_category.trim() && l.hours > 0,
                  ) &&
                  !createMut.isPending
                  ? "border-accent bg-accent text-white hover:bg-[#015C61]"
                  : "border-border bg-white text-muted-foreground cursor-not-allowed",
              )}
              onClick={handleCreate}
            >
              {createMut.isPending ? "Building..." : "Build Scenario"}
            </button>
            <button
              type="button"
              className="rounded border border-border bg-white px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
              onClick={() => setExpanded(false)}
            >
              Cancel
            </button>
            {createMut.isError && (
              <span className="text-[12px] text-critical">
                {(createMut.error as Error).message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
