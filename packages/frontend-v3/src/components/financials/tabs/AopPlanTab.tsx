"use client";

import { useState } from "react";
import { useAopPlan, useSaveAopPlan } from "@/hooks/use-financial-bible";
import type { AopPlanData } from "@/lib/types";

type FieldKey =
  | "plan_orders"
  | "plan_sales"
  | "plan_ebit"
  | "plan_gross_margin"
  | "plan_ros";

const DOLLAR_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "plan_orders", label: "Orders (annual $)" },
  { key: "plan_sales", label: "Sales (annual $)" },
  { key: "plan_ebit", label: "EBIT (annual $)" },
];

const PERCENT_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "plan_gross_margin", label: "Gross Margin (%)" },
  { key: "plan_ros", label: "Return on Sales (%)" },
];

type FormState = Record<FieldKey, string>;

const EMPTY_FORM: FormState = {
  plan_orders: "",
  plan_sales: "",
  plan_ebit: "",
  plan_gross_margin: "",
  plan_ros: "",
};

function fmtMoney(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function planToForm(plan: AopPlanData["plan"]): FormState {
  if (!plan) return EMPTY_FORM;
  return {
    plan_orders: String(plan.plan_orders),
    plan_sales: String(plan.plan_sales),
    plan_ebit: String(plan.plan_ebit),
    plan_gross_margin: String(plan.plan_gross_margin),
    plan_ros: String(plan.plan_ros),
  };
}

export function AopPlanTab({ fy }: { fy: string }) {
  const { data, isLoading } = useAopPlan(fy);
  const save = useSaveAopPlan();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [justSaved, setJustSaved] = useState(false);

  // Sync the form to the loaded plan during render (React's recommended pattern
  // for resetting state on prop change), keyed on fy + which dataset is loaded.
  const loadKey = `${fy}:${data ? (data.has_plan ? "plan" : "empty") : "loading"}`;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (data && seenKey !== loadKey) {
    setSeenKey(loadKey);
    setForm(planToForm(data.plan));
    setJustSaved(false);
  }

  const setField = (key: FieldKey, value: string) => {
    setJustSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const parsed: Record<FieldKey, number | null> = {
    plan_orders: toNum(form.plan_orders),
    plan_sales: toNum(form.plan_sales),
    plan_ebit: toNum(form.plan_ebit),
    plan_gross_margin: toNum(form.plan_gross_margin),
    plan_ros: toNum(form.plan_ros),
  };

  const allValid =
    parsed.plan_orders !== null &&
    parsed.plan_sales !== null &&
    parsed.plan_ebit !== null &&
    parsed.plan_gross_margin !== null &&
    parsed.plan_ros !== null &&
    (parsed.plan_gross_margin as number) >= 0 &&
    (parsed.plan_gross_margin as number) <= 100 &&
    (parsed.plan_ros as number) >= 0 &&
    (parsed.plan_ros as number) <= 100;

  const handleSave = () => {
    if (!allValid) return;
    save.mutate(
      {
        fy,
        plan_orders: parsed.plan_orders as number,
        plan_sales: parsed.plan_sales as number,
        plan_ebit: parsed.plan_ebit as number,
        plan_gross_margin: parsed.plan_gross_margin as number,
        plan_ros: parsed.plan_ros as number,
      },
      { onSuccess: () => setJustSaved(true) },
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          AOP Plan Input {"—"} {fy}
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Enter your board-approved annual operating plan for {fy}. Enter ONE
          annual number per metric. On save, dollar targets (Orders, Sales,
          EBIT) are split evenly across 12 months (annual {"÷"} 12);
          percentages (Gross Margin, ROS) apply the same value to every month.
          These are your real numbers {"—"} not seeded benchmarks.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading {fy} plan...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {DOLLAR_FIELDS.map((f) => (
              <label key={f.key} className="space-y-1">
                <span className="block text-[12px] font-medium text-foreground">
                  {f.label}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder="0"
                  className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground tabular-nums focus:border-gda-cyan focus:outline-none"
                />
              </label>
            ))}
            {PERCENT_FIELDS.map((f) => (
              <label key={f.key} className="space-y-1">
                <span className="block text-[12px] font-medium text-foreground">
                  {f.label}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  max="100"
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder="0"
                  className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground tabular-nums focus:border-gda-cyan focus:outline-none"
                />
              </label>
            ))}
          </div>

          {/* Live preview of the flat monthly division */}
          {allValid && (
            <div className="rounded border border-border bg-card p-4 text-[12px] text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">
                Monthly breakdown (each of the 12 months)
              </p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <span>
                  Orders / month:{" "}
                  <span className="tabular-nums text-foreground">
                    {fmtMoney((parsed.plan_orders as number) / 12)}
                  </span>
                </span>
                <span>
                  Sales / month:{" "}
                  <span className="tabular-nums text-foreground">
                    {fmtMoney((parsed.plan_sales as number) / 12)}
                  </span>
                </span>
                <span>
                  EBIT / month:{" "}
                  <span className="tabular-nums text-foreground">
                    {fmtMoney((parsed.plan_ebit as number) / 12)}
                  </span>
                </span>
                <span>
                  Gross Margin:{" "}
                  <span className="tabular-nums text-foreground">
                    {(parsed.plan_gross_margin as number).toLocaleString(
                      "en-US",
                      { maximumFractionDigits: 1 },
                    )}
                    % (every month)
                  </span>
                </span>
                <span>
                  Return on Sales:{" "}
                  <span className="tabular-nums text-foreground">
                    {(parsed.plan_ros as number).toLocaleString("en-US", {
                      maximumFractionDigits: 1,
                    })}
                    % (every month)
                  </span>
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!allValid || save.isPending}
              onClick={handleSave}
              className="rounded bg-fin-navy px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-fin-navy-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save.isPending
                ? "Saving..."
                : data?.has_plan
                  ? `Update ${fy} AOP Plan`
                  : `Save ${fy} AOP Plan`}
            </button>
            {justSaved && !save.isPending && (
              <span className="text-[13px] text-gda-green">
                Saved {"—"} 12 monthly rows written. AOP Execution now uses
                this plan.
              </span>
            )}
            {save.isError && (
              <span className="text-[13px] text-gda-red">
                {save.error instanceof Error
                  ? save.error.message
                  : "Failed to save plan."}
              </span>
            )}
          </div>

          {!allValid && (
            <p className="text-[12px] text-muted-foreground italic">
              Enter all five values to save. Percentages must be between 0 and
              100.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function toNum(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
