"use client";

import { useState, useCallback } from "react";
import {
  usePricingScenarios,
  useCreatePricingScenario,
  useBibleActive,
  type PricingScenarioSummary,
} from "@/hooks/use-financial-bible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MARGIN_FLOOR = 8;

function MarginGauge({ marginPct, pass }: { marginPct: number; pass: boolean }) {
  const clamped = Math.min(Math.max(marginPct, 0), 30);
  const widthPct = (clamped / 30) * 100;
  const floorPct = (MARGIN_FLOOR / 30) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">Margin</span>
        <span className={cn("font-mono font-bold", pass ? "text-gda-green" : "text-gda-red")}>
          {marginPct.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2 w-full rounded bg-card overflow-hidden">
        <div
          className={cn("absolute inset-y-0 left-0 rounded", pass ? "bg-gda-green" : "bg-gda-red")}
          style={{ width: `${widthPct}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${floorPct}%` }}
          title={`${MARGIN_FLOOR}% floor`}
        />
      </div>
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className={cn(
            "text-[12px]",
            pass ? "border-gda-green text-gda-green" : "border-gda-red text-gda-red",
          )}
        >
          {pass ? "PASS" : "FAIL"}
        </Badge>
        <span className="text-[12px] text-muted-foreground">
          {MARGIN_FLOOR}% floor (F-303)
        </span>
      </div>
    </div>
  );
}

function ScenarioRow({ s }: { s: PricingScenarioSummary }) {
  return (
    <div className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
      <div className="space-y-0.5 min-w-0">
        <p className="font-mono text-foreground truncate">{s.title}</p>
        <p className="text-[12px] text-muted-foreground">
          ${s.total_price.toLocaleString()} total |{" "}
          {new Date(s.created_at).toLocaleDateString()}
        </p>
      </div>
      <MarginGauge marginPct={s.margin_pct} pass={s.doctrine_pass} />
    </div>
  );
}

interface LaborRow {
  labor_category: string;
  clearance: string;
  hours: number;
  rate_override?: number;
}

function ScenarioForm({
  entityId,
  entityKind,
  onClose,
}: {
  entityId: string | number;
  entityKind: "opportunity" | "capture";
  onClose: () => void;
}) {
  const create = useCreatePricingScenario();
  const [title, setTitle] = useState("");
  const [contractType, setContractType] = useState("T&M");
  const [periodMonths, setPeriodMonths] = useState(12);
  const [feePct, setFeePct] = useState<number | undefined>(undefined);
  const [odcAmount, setOdcAmount] = useState(0);
  const [rows, setRows] = useState<LaborRow[]>([
    { labor_category: "", clearance: "None", hours: 0 },
  ]);

  const updateRow = (idx: number, field: keyof LaborRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, { labor_category: "", clearance: "None", hours: 0 }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = useCallback(() => {
    if (!title.trim() || rows.length === 0) return;
    const validRows = rows.filter((r) => r.labor_category.trim() && r.hours > 0);
    if (validRows.length === 0) return;

    create.mutate(
      {
        title: title.trim(),
        ...(entityKind === "opportunity"
          ? { opportunity_id: Number(entityId) }
          : { capture_id: Number(entityId) }),
        labor_mix: validRows,
        period_months: periodMonths,
        contract_type: contractType,
        fee_pct: feePct,
        odc_amount: odcAmount || undefined,
      },
      { onSuccess: onClose },
    );
  }, [title, rows, entityKind, entityId, periodMonths, contractType, feePct, odcAmount, create, onClose]);

  return (
    <Card className="border-gda-cyan/30 bg-gda-panel">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Build Pricing Scenario
        </CardTitle>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-[12px] text-muted-foreground">Scenario Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
              placeholder="e.g. Option Year 1 baseline"
            />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground">Contract Type</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
            >
              <option value="T&M">T&M</option>
              <option value="FFP">FFP</option>
              <option value="CPFF">CPFF</option>
              <option value="CPAF">CPAF</option>
              <option value="CPIF">CPIF</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground">Period (months)</label>
            <input
              type="number"
              value={periodMonths}
              onChange={(e) => setPeriodMonths(Number(e.target.value) || 12)}
              className="mt-0.5 block w-full rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
            />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground">Fee % (blank = use Bible defaults)</label>
            <input
              type="number"
              step="0.1"
              value={feePct ?? ""}
              onChange={(e) => setFeePct(e.target.value ? Number(e.target.value) : undefined)}
              className="mt-0.5 block w-full rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
              placeholder="auto"
            />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground">ODC Amount ($)</label>
            <input
              type="number"
              value={odcAmount || ""}
              onChange={(e) => setOdcAmount(Number(e.target.value) || 0)}
              className="mt-0.5 block w-full rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground"
              placeholder="0"
            />
          </div>
        </div>

        {/* Labor Mix */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[12px] text-muted-foreground font-medium">Labor Mix</label>
            <button
              type="button"
              onClick={addRow}
              className="text-[12px] font-mono text-gda-green hover:underline"
            >
              + Add Row
            </button>
          </div>
          <div className="space-y-1">
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input
                  type="text"
                  value={row.labor_category}
                  onChange={(e) => updateRow(idx, "labor_category", e.target.value)}
                  placeholder="Labor Category"
                  className="flex-1 rounded border border-border bg-card px-1.5 py-1 text-[12px] text-foreground"
                />
                <input
                  type="text"
                  value={row.clearance}
                  onChange={(e) => updateRow(idx, "clearance", e.target.value)}
                  placeholder="Clearance"
                  className="w-24 rounded border border-border bg-card px-1.5 py-1 text-[12px] text-foreground"
                />
                <input
                  type="number"
                  value={row.hours || ""}
                  onChange={(e) => updateRow(idx, "hours", Number(e.target.value))}
                  placeholder="Hours"
                  className="w-20 rounded border border-border bg-card px-1.5 py-1 text-[12px] text-foreground"
                />
                <input
                  type="number"
                  value={row.rate_override ?? ""}
                  onChange={(e) => updateRow(idx, "rate_override", Number(e.target.value) || 0)}
                  placeholder="Rate $"
                  className="w-20 rounded border border-border bg-card px-1.5 py-1 text-[12px] text-foreground"
                  title="Leave blank to use Bible rate"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="text-[12px] text-muted-foreground hover:text-gda-red"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {create.isError && (
          <p className="text-[12px] text-gda-red">
            {(create.error as Error).message}
          </p>
        )}

        {create.isSuccess && create.data && (
          <MarginGauge marginPct={create.data.margin_pct} pass={create.data.doctrine_pass} />
        )}

        <button
          type="button"
          disabled={!title.trim() || rows.length === 0 || create.isPending}
          onClick={handleSubmit}
          className={cn(
            "rounded px-4 py-1.5 text-[13px] font-medium transition-colors",
            title.trim()
              ? "bg-gda-green text-black hover:bg-gda-green/90"
              : "bg-card text-muted-foreground cursor-not-allowed",
          )}
        >
          {create.isPending ? "Building..." : "Build Scenario"}
        </button>
      </CardContent>
    </Card>
  );
}

export function PricingScenarioCard({
  entityId,
  entityKind,
}: {
  entityId: string | number;
  entityKind: "opportunity" | "capture";
}) {
  const [showForm, setShowForm] = useState(false);
  const bibleActive = useBibleActive();
  const scenariosQ = usePricingScenarios(
    entityKind === "opportunity"
      ? { opportunity_id: String(entityId) }
      : { capture_id: String(entityId) },
  );

  const hasActiveBible = !!bibleActive.data?.active;
  const scenarios = scenariosQ.data?.items ?? [];

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase flex items-center justify-between">
          <span>Pricing Scenarios</span>
          {hasActiveBible && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-[12px] font-mono text-gda-green hover:underline normal-case"
            >
              + Build Scenario
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasActiveBible && (
          <p className="text-[12px] text-muted-foreground">
            No active Financial Bible. Upload and activate one on the Financials page to build pricing scenarios.
          </p>
        )}

        {showForm && (
          <ScenarioForm
            entityId={entityId}
            entityKind={entityKind}
            onClose={() => setShowForm(false)}
          />
        )}

        {scenarios.length === 0 && !showForm && hasActiveBible && (
          <p className="text-[12px] text-muted-foreground">
            No pricing scenarios yet. Click {"\u201C"}Build Scenario{"\u201D"} to create one.
          </p>
        )}

        {scenarios.map((s) => (
          <ScenarioRow key={s.id} s={s} />
        ))}
      </CardContent>
    </Card>
  );
}
