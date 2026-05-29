import { useState } from "react";
import { authenticatedFetch } from "../../api/auth";

interface PricingAssumptions {
  labor_rate?: number;
  overhead_pct?: number;
  fringe_pct?: number;
  fee_pct?: number;
  margin_pct?: number;
  notes?: string;
}

interface Props {
  captureId: number;
  initialAssumptions: PricingAssumptions;
}

export default function PricingGuardrail({
  captureId,
  initialAssumptions,
}: Props) {
  const [marginPct, setMarginPct] = useState<string>(
    initialAssumptions.margin_pct?.toString() ?? "",
  );
  const [guardrailResult, setGuardrailResult] = useState<{
    pass: boolean | null;
    alert: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const marginValue = marginPct.trim() === "" ? null : Number(marginPct);

  const liveStatus =
    marginValue == null
      ? "empty"
      : marginValue >= 10
        ? "pass"
        : "fail";

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authenticatedFetch(`/api/captures/${captureId}`, {
        method: "PATCH",
        body: JSON.stringify({
          pricing_assumptions: {
            ...initialAssumptions,
            margin_pct: marginValue,
          },
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.pricing_guardrail) {
        setGuardrailResult(json.data.pricing_guardrail);
      }
    } catch {
      // non-fatal
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-section text-ink mb-4">Pricing Guardrail</h3>
      <p className="text-caption text-muted italic mb-4">
        Doctrine: 10% gross margin floor (FY26 board plan minimum)
      </p>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-body text-ink">Margin %</label>
        <input
          type="number"
          value={marginPct}
          onChange={(e) => setMarginPct(e.target.value)}
          className="w-24 px-3 py-1 text-body border border-border rounded bg-white text-ink num"
          placeholder="—"
        />

        <span
          className={`text-caption font-semibold ${
            liveStatus === "pass"
              ? "text-accent"
              : liveStatus === "fail"
                ? "text-critical"
                : "text-muted"
          }`}
        >
          {liveStatus === "pass"
            ? "Above floor"
            : liveStatus === "fail"
              ? `Below 10% floor`
              : "Not entered"}
        </span>
      </div>

      <button
        className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save"}
      </button>

      {guardrailResult && guardrailResult.alert && (
        <p
          className={`mt-4 text-body ${
            guardrailResult.pass === false ? "text-critical" : "text-muted"
          }`}
        >
          {guardrailResult.alert}
        </p>
      )}
    </div>
  );
}
