"use client";

import { useState } from "react";
import { useSaveCapturePlan } from "@/hooks/use-capture-reviews";
import type { CapturePlan } from "@/lib/types";

interface DriversTabProps {
  captureId: number | string;
  plan: CapturePlan | null;
}

export function DriversTab({ captureId, plan }: DriversTabProps) {
  const savePlan = useSaveCapturePlan(captureId);

  const [customerScore, setCustomerScore] = useState<number | "">(plan?.customer_relationship_score ?? "");
  const [customerNotes, setCustomerNotes] = useState(plan?.customer_relationship_notes ?? "");
  const [budgetConfirmed, setBudgetConfirmed] = useState(plan?.customer_budget_confirmed ?? false);

  const [solutionScore, setSolutionScore] = useState<number | "">(plan?.solution_fit_score ?? "");
  const [solutionDiff, setSolutionDiff] = useState(plan?.solution_differentiators ?? "");
  const [solutionRisks, setSolutionRisks] = useState(plan?.solution_risks ?? "");

  const [competitiveScore, setCompetitiveScore] = useState<number | "">(plan?.competitive_position_score ?? "");
  const [ghosting, setGhosting] = useState(plan?.ghosting_strategy ?? "");

  const [pricingPosture, setPricingPosture] = useState(plan?.pricing_posture ?? "");
  const [marginTarget, setMarginTarget] = useState<number | "">(plan?.margin_target ?? "");
  const [ptwEstimate, setPtwEstimate] = useState<number | "">(plan?.ptw_estimate ?? "");

  const [primeOrSub, setPrimeOrSub] = useState(plan?.prime_or_sub ?? "");

  function handleSave() {
    savePlan.mutate({
      customer_relationship_score: customerScore === "" ? undefined : Number(customerScore),
      customer_relationship_notes: customerNotes || undefined,
      customer_budget_confirmed: budgetConfirmed,
      solution_fit_score: solutionScore === "" ? undefined : Number(solutionScore),
      solution_differentiators: solutionDiff || undefined,
      solution_risks: solutionRisks || undefined,
      competitive_position_score: competitiveScore === "" ? undefined : Number(competitiveScore),
      ghosting_strategy: ghosting || undefined,
      ptw_estimate: ptwEstimate === "" ? undefined : Number(ptwEstimate),
      pricing_posture: (pricingPosture as CapturePlan["pricing_posture"]) || undefined,
      margin_target: marginTarget === "" ? undefined : Number(marginTarget),
      prime_or_sub: (primeOrSub as CapturePlan["prime_or_sub"]) || undefined,
    } as Partial<CapturePlan>);
  }

  return (
    <div className="space-y-6">
      {/* Customer */}
      <DriverSection title="Customer Relationship">
        <ScoreInput label="Score (1-5)" value={customerScore} onChange={setCustomerScore} />
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={budgetConfirmed}
            onChange={(e) => setBudgetConfirmed(e.target.checked)}
            className="rounded border-border"
          />
          Budget confirmed
        </label>
        <TextArea label="Notes" value={customerNotes} onChange={setCustomerNotes} />
      </DriverSection>

      {/* Solution */}
      <DriverSection title="Solution Fit">
        <ScoreInput label="Score (1-5)" value={solutionScore} onChange={setSolutionScore} />
        <TextArea label="Differentiators" value={solutionDiff} onChange={setSolutionDiff} />
        <TextArea label="Risks" value={solutionRisks} onChange={setSolutionRisks} />
      </DriverSection>

      {/* Competitive */}
      <DriverSection title="Competitive Position">
        <ScoreInput label="Score (1-5)" value={competitiveScore} onChange={setCompetitiveScore} />
        <TextArea label="Ghosting strategy" value={ghosting} onChange={setGhosting} />
      </DriverSection>

      {/* Pricing */}
      <DriverSection title="Pricing">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] text-muted-foreground">Posture</span>
            <select
              value={pricingPosture}
              onChange={(e) => setPricingPosture(e.target.value)}
              className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
            >
              <option value="">—</option>
              <option value="aggressive">Aggressive</option>
              <option value="balanced">Balanced</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">Margin target (%)</span>
            <input
              type="number"
              step="0.01"
              value={marginTarget}
              onChange={(e) => setMarginTarget(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
            />
          </div>
        </div>
        <div>
          <span className="text-[11px] text-muted-foreground">PTW Estimate ($)</span>
          <input
            type="number"
            value={ptwEstimate}
            onChange={(e) => setPtwEstimate(e.target.value === "" ? "" : Number(e.target.value))}
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
          />
        </div>
      </DriverSection>

      {/* Teaming */}
      <DriverSection title="Teaming">
        <div>
          <span className="text-[11px] text-muted-foreground">Prime or Sub</span>
          <select
            value={primeOrSub}
            onChange={(e) => setPrimeOrSub(e.target.value)}
            className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
          >
            <option value="">—</option>
            <option value="PRIME">PRIME</option>
            <option value="SUB">SUB</option>
          </select>
        </div>
      </DriverSection>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={savePlan.isPending}
        className="rounded border border-gda-green/30 bg-gda-green/10 px-4 py-2 text-xs font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
      >
        {savePlan.isPending ? "Saving…" : "Save Drivers"}
      </button>

      {savePlan.isSuccess && (
        <p className="text-xs text-gda-green">Drivers saved. Pwin recomputed.</p>
      )}
    </div>
  );
}

function DriverSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded border border-border bg-gda-panel p-4">
      <h4 className="text-xs font-medium text-foreground uppercase">{title}</h4>
      {children}
    </div>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        min={1}
        max={5}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="mt-0.5 w-full rounded border border-border bg-gda-bg-deep px-2 py-1 text-xs text-foreground"
        placeholder="1-5"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="mt-0.5 w-full rounded border border-border bg-gda-bg-deep px-2 py-1 text-xs text-foreground resize-none"
      />
    </div>
  );
}
