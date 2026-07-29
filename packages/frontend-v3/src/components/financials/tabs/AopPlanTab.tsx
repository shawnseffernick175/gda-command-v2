"use client";

import { useState } from "react";
import {
  useAopPlan,
  useSaveAopPlan,
  useAdjustAopMonth,
} from "@/hooks/use-financial-bible";
import type { AopPlanData, AopPlanMonth } from "@/lib/types";

type FieldKey =
  | "plan_orders"
  | "plan_sales"
  | "plan_ebit"
  | "plan_gross_margin"
  | "plan_ros";

const DOLLAR_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "plan_orders", label: "Orders (annual $)" },
  { key: "plan_sales", label: "Sales (annual $)" },
  { key: "plan_ebit", label: "Operating Income (annual $)" },
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
          Operating Income) are split evenly across 12 months (annual {"÷"} 12);
          percentages (Gross Margin, ROS) apply the same value to every month.
          You can then fine-tune any individual month below {"—"} the annual AOP
          is always the sum of the 12 months, and it updates the Pipeline
          Coverage targets everywhere. These are your real numbers {"—"} not
          seeded benchmarks.
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
                  Operating Income / month:{" "}
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

          {data?.has_plan && data.months.length > 0 && (
            <MonthlyAdjust fy={fy} months={data.months} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Per-month AOP sales editor. Each month can be adjusted independently; the
 * annual AOP shown is the live sum of the 12 months and is what Pipeline
 * Coverage reads. Saving a month re-derives that canonical annual value.
 */
function MonthlyAdjust({ fy, months }: { fy: string; months: AopPlanMonth[] }) {
  const adjust = useAdjustAopMonth();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedPeriod, setSavedPeriod] = useState<string | null>(null);

  const valueFor = (m: AopPlanMonth): string =>
    drafts[m.period] ?? (m.plan_sales != null ? String(m.plan_sales) : "");

  const annualSum = months.reduce((sum, m) => {
    const draft = drafts[m.period];
    const n = draft != null ? toNum(draft) : m.plan_sales;
    return sum + (n ?? 0);
  }, 0);

  const saveMonth = (m: AopPlanMonth) => {
    const parsed = toNum(valueFor(m));
    if (parsed === null || parsed < 0) return;
    setSavedPeriod(null);
    adjust.mutate(
      { fy, period: m.period, plan_sales: parsed },
      {
        onSuccess: () => {
          setSavedPeriod(m.period);
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[m.period];
            return next;
          });
        },
      },
    );
  };

  return (
    <div className="space-y-3 border-t border-border pt-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Adjust monthly AOP sales {"—"} {fy}
        </h3>
        <span className="text-[12px] text-muted-foreground">
          Annual AOP (sum):{" "}
          <span className="tabular-nums font-medium text-foreground">
            {fmtMoney(annualSum)}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((m) => (
          <div key={m.period} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[12px] font-medium text-muted-foreground">
              {m.month}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={valueFor(m)}
              onChange={(e) =>
                setDrafts((prev) => ({ ...prev, [m.period]: e.target.value }))
              }
              className="w-full rounded border border-border bg-card px-2 py-1 text-[13px] text-foreground tabular-nums focus:border-gda-cyan focus:outline-none"
            />
            <button
              type="button"
              disabled={adjust.isPending}
              onClick={() => saveMonth(m)}
              className="shrink-0 rounded border border-border px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ))}
      </div>
      {savedPeriod && !adjust.isPending && (
        <span className="text-[13px] text-gda-green">
          {savedPeriod} updated {"—"} annual AOP and Pipeline Coverage now reflect
          the new total.
        </span>
      )}
      {adjust.isError && (
        <span className="text-[13px] text-gda-red">
          {adjust.error instanceof Error
            ? adjust.error.message
            : "Failed to update month."}
        </span>
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
