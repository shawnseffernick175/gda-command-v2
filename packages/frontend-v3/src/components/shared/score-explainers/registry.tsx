import type { ReactNode } from "react";

/* ── Score types enum ─────────────────────────────────────────── */

export type ScoreType =
  | "pwin"
  | "pwin_band"
  | "fastrac_match"
  | "mission_fit"
  | "technical_fit"
  | "timing_fit"
  | "relevance"
  | "doctrine_score"
  | "pipeline_value"
  | "orders"
  | "sales"
  | "ebit"
  | "gross_margin"
  | "ros"
  | "signal_strength"
  | "urgency";

/* ── Inputs type (union of all possible input shapes) ─────────── */

export type ScoreInputs = Record<string, unknown>;

/* ── Explainer definition ─────────────────────────────────────── */

export interface Explainer {
  description: string;
  renderFormula: (inputs?: ScoreInputs) => ReactNode;
  renderInputs?: (inputs: ScoreInputs, score: number | string | null) => ReactNode;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function Bullet({ children }: { children: ReactNode }) {
  return <li className="ml-3 list-disc">{children}</li>;
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  return String(v);
}

/* ── Explainers ───────────────────────────────────────────────── */

const EXPLAINERS: Record<ScoreType, Explainer> = {
  /* ── 1. Pwin ────────────────────────────────────────────────── */
  pwin: {
    description:
      "Likelihood Envision wins the opportunity if pursued. Deterministic rules-based model (v1).",
    renderFormula: () => (
      <ul className="space-y-0.5">
        <Bullet>Base score: 30</Bullet>
        <Bullet>Incumbency bonus: +30 if incumbent</Bullet>
        <Bullet>Recompete bonus: +8</Bullet>
        <Bullet>Capability match: scope_match × 0.3</Bullet>
        <Bullet>Vehicle access: +10</Bullet>
        <Bullet>Clearance fit: +5</Bullet>
        <Bullet>Doctrine alignment: (score/40) × 10</Bullet>
        <Bullet>Margin penalty: −20 if below floor</Bullet>
        <Bullet>Teaming: +5 partner found / −10 partner needed but missing</Bullet>
        <Bullet>NAICS size: +20 (SB set-aside) / +10 (SB full-open)</Bullet>
        <Bullet>Existing customer: +5</Bullet>
        <Bullet>Exclusion kill: clamps to 0</Bullet>
      </ul>
    ),
    renderInputs: (inputs) => {
      const drivers = (inputs.top_drivers as string[] | undefined) ?? [];
      if (drivers.length === 0) return <p className="text-muted-foreground">No driver data available.</p>;
      return (
        <ul className="space-y-0.5">
          {drivers.map((d, i) => (
            <Bullet key={i}>{d}</Bullet>
          ))}
        </ul>
      );
    },
  },

  /* ── 2. Pwin Band ───────────────────────────────────────────── */
  pwin_band: {
    description:
      "Qualitative bucket for the numeric Pwin, used for pipeline triage.",
    renderFormula: () => (
      <ul className="space-y-0.5">
        <Bullet>Forecast: Pwin ≥ 67</Bullet>
        <Bullet>Signal: Pwin ≥ 45 and &lt; 67</Bullet>
        <Bullet>Discovery: Pwin &lt; 45</Bullet>
        <Bullet>Pass: response due within 30 days or past due</Bullet>
      </ul>
    ),
    renderInputs: (inputs) => (
      <p>
        Numeric Pwin:{" "}
        <span className="font-mono">{fmt(inputs.pwin_score)}</span>
        {inputs.days_to_due != null && (
          <>
            {" "}· Days to due:{" "}
            <span className="font-mono">{fmt(inputs.days_to_due)}</span>
          </>
        )}
      </p>
    ),
  },

  /* ── 3. FasTrac Match Score ─────────────────────────────────── */
  fastrac_match: {
    description:
      "How well a technology signal pairs with a requirement signal. Average of three sub-scores.",
    renderFormula: () => (
      <p>Overall = (Mission Fit + Technical Fit + Timing) / 3 × 100</p>
    ),
    renderInputs: (inputs) => (
      <ul className="space-y-0.5">
        <Bullet>
          Mission Fit:{" "}
          <span className="font-mono">{fmt(inputs.mission_fit)}</span>
        </Bullet>
        <Bullet>
          Technical Fit:{" "}
          <span className="font-mono">{fmt(inputs.technical_fit)}</span>
        </Bullet>
        <Bullet>
          Timing:{" "}
          <span className="font-mono">{fmt(inputs.timing)}</span>
        </Bullet>
      </ul>
    ),
  },

  /* ── 4. Mission Fit ─────────────────────────────────────────── */
  mission_fit: {
    description:
      "How well a technology/capability addresses a requirement's mission area. LLM-scored overlap between mission tags.",
    renderFormula: () => (
      <p>
        Scored 0.0–1.0 by the AI match engine comparing mission tag overlap and
        semantic alignment between the technology and requirement signals.
      </p>
    ),
    renderInputs: (inputs) => {
      const tags = inputs.mission_tags as string[] | undefined;
      return tags && tags.length > 0 ? (
        <p>
          Shared tags:{" "}
          <span className="font-mono">{tags.join(", ")}</span>
        </p>
      ) : null;
    },
  },

  /* ── 5. Technical Fit ───────────────────────────────────────── */
  technical_fit: {
    description:
      "How closely the technology's attributes match what the requirement needs. LLM-scored technical overlap.",
    renderFormula: () => (
      <p>
        Scored 0.0–1.0 by the AI match engine comparing technical domain tags,
        readiness level proximity, and capability alignment.
      </p>
    ),
  },

  /* ── 6. Timing Fit ──────────────────────────────────────────── */
  timing_fit: {
    description:
      "How well a technology's maturity horizon aligns with a requirement's procurement window.",
    renderFormula: () => (
      <p>
        Scored 0.0–1.0 by comparing tech horizon (0–6 mo, 6–12 mo, 12–24 mo) against the
        requirement&rsquo;s procurement window. Higher when windows overlap.
      </p>
    ),
  },

  /* ── 7. Relevance ───────────────────────────────────────────── */
  relevance: {
    description:
      "Whether the opportunity is in Envision's wheelhouse — NAICS allowlist plus title/keyword filter.",
    renderFormula: () => (
      <ul className="space-y-0.5">
        <Bullet>Check NAICS against Envision&rsquo;s 18-code allowlist</Bullet>
        <Bullet>Title/keyword filter for commodity exclusion</Bullet>
        <Bullet>Result: on-profile or off-profile with reason code</Bullet>
      </ul>
    ),
    renderInputs: (inputs) => {
      const naics = inputs.naics as string | undefined;
      const reason = inputs.reason as string | undefined;
      const status = inputs.status as string | undefined;
      return (
        <ul className="space-y-0.5">
          {naics && (
            <Bullet>
              NAICS: <span className="font-mono">{naics}</span>
            </Bullet>
          )}
          {reason && (
            <Bullet>
              Reason: <span className="font-mono">{reason}</span>
            </Bullet>
          )}
          {status && (
            <Bullet>
              Status: <span className="font-mono">{status}</span>
            </Bullet>
          )}
        </ul>
      );
    },
  },

  /* ── 8. Doctrine Score ──────────────────────────────────────── */
  doctrine_score: {
    description:
      "How well the opportunity aligns with Envision's 8 doctrine principles. Scored 0–40, with exclusion hard-fails.",
    renderFormula: () => (
      <ul className="space-y-0.5">
        <Bullet>8 principles scored 0–5 each (max 40)</Bullet>
        <Bullet>Strong fit: ≥ 30/40</Bullet>
        <Bullet>Moderate fit: 18–29/40</Bullet>
        <Bullet>Weak fit: 6–17/40</Bullet>
        <Bullet>No fit: &lt; 6/40</Bullet>
        <Bullet>6 exclusion rules — any triggered = hard fail</Bullet>
      </ul>
    ),
    renderInputs: (inputs) => {
      const matched = inputs.matchedPrinciples as string[] | undefined;
      const label = inputs.label as string | undefined;
      const rationale = inputs.rationale as string | undefined;
      return (
        <ul className="space-y-0.5">
          {inputs.alignment_total != null && (
            <Bullet>
              Alignment total:{" "}
              <span className="font-mono">{fmt(inputs.alignment_total)}/40</span>
            </Bullet>
          )}
          {label && (
            <Bullet>
              Fit: <span className="font-mono">{label}</span>
            </Bullet>
          )}
          {matched && matched.length > 0 && (
            <Bullet>
              Matched principles: {matched.join(", ")}
            </Bullet>
          )}
          {rationale && (
            <Bullet>{rationale}</Bullet>
          )}
        </ul>
      );
    },
  },

  /* ── 9. Pipeline Value ──────────────────────────────────────── */
  pipeline_value: {
    description:
      "Risk-adjusted pipeline dollar value — total contract value weighted by win probability.",
    renderFormula: () => (
      <p>
        Weighted Pipeline = Σ (opportunity_value × pwin / 100) for all non-lost
        pipeline items.
      </p>
    ),
    renderInputs: (inputs) => {
      const items = inputs.top_contributors as
        | Array<{ title: string; value: number }>
        | undefined;
      if (!items || items.length === 0) return null;
      return (
        <ul className="space-y-0.5">
          {items.map((item, i) => (
            <Bullet key={i}>
              {item.title}: <span className="font-mono">${(item.value / 1e6).toFixed(1)}M</span>
            </Bullet>
          ))}
        </ul>
      );
    },
  },

  /* ── 10. KPI: Orders ────────────────────────────────────────── */
  orders: {
    description:
      "Total contract value of awards received in the reporting period.",
    renderFormula: () => (
      <p>
        Source: USAspending.gov + capture records. Period: current reporting window.
      </p>
    ),
    renderInputs: (inputs) =>
      inputs.delta != null ? (
        <p>
          Period Δ:{" "}
          <span className="font-mono">
            {Number(inputs.delta) >= 0 ? "+" : ""}
            {fmt(inputs.delta)}%
          </span>
        </p>
      ) : null,
  },

  /* ── 10. KPI: Sales ─────────────────────────────────────────── */
  sales: {
    description: "Revenue recognized from active contracts.",
    renderFormula: () => (
      <p>Source: Financial planning system. Period: current reporting window.</p>
    ),
    renderInputs: (inputs) =>
      inputs.delta != null ? (
        <p>
          Period Δ:{" "}
          <span className="font-mono">
            {Number(inputs.delta) >= 0 ? "+" : ""}
            {fmt(inputs.delta)}%
          </span>
        </p>
      ) : null,
  },

  /* ── 10. KPI: EBIT ──────────────────────────────────────────── */
  ebit: {
    description: "Earnings before interest and taxes.",
    renderFormula: () => (
      <p>Derived: Sales − direct costs − overhead.</p>
    ),
    renderInputs: (inputs) =>
      inputs.delta != null ? (
        <p>
          Period Δ:{" "}
          <span className="font-mono">
            {Number(inputs.delta) >= 0 ? "+" : ""}
            {fmt(inputs.delta)}%
          </span>
        </p>
      ) : null,
  },

  /* ── 10. KPI: Gross Margin ──────────────────────────────────── */
  gross_margin: {
    description: "Gross Margin percentage = (Sales − COGS) / Sales × 100.",
    renderFormula: () => (
      <p>Source: Financial planning system. Standard accounting formula.</p>
    ),
    renderInputs: (inputs) =>
      inputs.delta != null ? (
        <p>
          Period Δ:{" "}
          <span className="font-mono">
            {Number(inputs.delta) >= 0 ? "+" : ""}
            {fmt(inputs.delta)}%
          </span>
        </p>
      ) : null,
  },

  /* ── 10. KPI: Return on Sales ───────────────────────────────── */
  ros: {
    description: "Return on Sales = Net Income / Sales × 100.",
    renderFormula: () => (
      <p>Derived from financial inputs. Standard accounting formula.</p>
    ),
    renderInputs: (inputs) =>
      inputs.delta != null ? (
        <p>
          Period Δ:{" "}
          <span className="font-mono">
            {Number(inputs.delta) >= 0 ? "+" : ""}
            {fmt(inputs.delta)}%
          </span>
        </p>
      ) : null,
  },

  /* ── 11. Signal Strength ────────────────────────────────────── */
  signal_strength: {
    description:
      "Dot rating (1–5) on each FasTrac signal, representing overall signal quality.",
    renderFormula: () => (
      <ul className="space-y-0.5">
        <Bullet>Composite of source authority, signal recency, corroboration count, and specificity</Bullet>
        <Bullet>5/5 = high-authority, recent, corroborated, specific</Bullet>
        <Bullet>1/5 = single-source, dated, generic</Bullet>
      </ul>
    ),
    renderInputs: (inputs) =>
      inputs.source ? (
        <p>
          Source: <span className="font-mono">{fmt(inputs.source)}</span>
        </p>
      ) : null,
  },

  /* ── 12. Urgency ────────────────────────────────────────────── */
  urgency: {
    description:
      "How time-sensitive a signal is for Envision to act on.",
    renderFormula: () => (
      <ul className="space-y-0.5">
        <Bullet>Based on procurement window proximity, Envision readiness, and competitive density</Bullet>
        <Bullet>Critical / High / Medium / Low</Bullet>
      </ul>
    ),
    renderInputs: (inputs) =>
      inputs.horizon ? (
        <p>
          Horizon: <span className="font-mono">{fmt(inputs.horizon)}</span>
        </p>
      ) : null,
  },
};

/* ── Public accessor ──────────────────────────────────────────── */

export function getExplainer(scoreType: ScoreType): Explainer {
  return EXPLAINERS[scoreType];
}
