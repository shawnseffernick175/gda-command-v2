/**
 * Canonical stage model -- tool-wide.
 * Active: Interest -> Qualify (staging) -> Qualified -> Pursue -> Solicitation -> Post-Submittal
 * Terminal: Won, Lost, No Bid, Government Cancelled
 *
 * 'qualify' is a pre-pipeline staging state (not counted in metrics).
 * 'qualified' is the first counted pipeline stage.
 */

/* ---- DB key constants --------------------------------------------------- */

export const CANONICAL_STAGE_KEYS = [
  "interest",
  "qualify",
  "qualified",
  "pursue",
  "solicitation",
  "post_submittal",
  "won",
  "lost",
  "no_bid",
  "gov_cancelled",
] as const;

export type CanonicalStageKey = (typeof CANONICAL_STAGE_KEYS)[number];

export const ACTIVE_STAGE_KEYS: readonly CanonicalStageKey[] = [
  "interest",
  "qualify",
  "qualified",
  "pursue",
  "solicitation",
  "post_submittal",
] as const;

/** Staging stages: pre-pipeline, not counted in metrics. */
export const STAGING_STAGE_KEYS: readonly CanonicalStageKey[] = [
  "qualify",
] as const;

export function isStagingStage(key: string): boolean {
  return (STAGING_STAGE_KEYS as readonly string[]).includes(key);
}

/**
 * Human-readable message for a failed stage move. A forward move on an
 * opportunity that hasn't cleared assessment returns 409 (state conflict) with
 * the specific reason; surface it verbatim behind a clear lead-in so the user
 * knows the move was refused and why, instead of the change silently reverting.
 */
export function stageMoveErrorMessage(err: unknown): string {
  const e = err as { status?: number; message?: string } | null;
  const detail = e?.message ? `: ${e.message}` : "";
  if (e?.status === 409) {
    return `Can't move to that stage yet — qualify this opportunity first${detail}`;
  }
  return `Failed to move stage${detail}`;
}

/* ---- Display labels ----------------------------------------------------- */

export const ACTIVE_STAGES = [
  "Interest",
  "Qualify",
  "Qualified",
  "Pursue",
  "Solicitation",
  "Post-Submittal",
] as const;

export const TERMINAL_STAGES = [
  "Won",
  "Lost",
  "No Bid",
  "Government Cancelled",
] as const;

export const ALL_STAGES = [...ACTIVE_STAGES, ...TERMINAL_STAGES] as const;

export type ActiveStage = (typeof ACTIVE_STAGES)[number];
export type TerminalStage = (typeof TERMINAL_STAGES)[number];
export type Stage = (typeof ALL_STAGES)[number];

/* ---- Key <-> label maps ------------------------------------------------- */

export const DB_KEY_TO_LABEL: Record<CanonicalStageKey, Stage> = {
  interest: "Interest",
  qualify: "Qualify",
  qualified: "Qualified",
  pursue: "Pursue",
  solicitation: "Solicitation",
  post_submittal: "Post-Submittal",
  won: "Won",
  lost: "Lost",
  no_bid: "No Bid",
  gov_cancelled: "Government Cancelled",
};

export const LABEL_TO_DB_KEY: Record<Stage, CanonicalStageKey> = {
  Interest: "interest",
  Qualify: "qualify",
  Qualified: "qualified",
  Pursue: "pursue",
  Solicitation: "solicitation",
  "Post-Submittal": "post_submittal",
  Won: "won",
  Lost: "lost",
  "No Bid": "no_bid",
  "Government Cancelled": "gov_cancelled",
};

/* ---- Capture doctrine phases (display-only) ----------------------------- */

/**
 * Company capture doctrine (per the GROWTH deck): the outward-facing "level of
 * capture" an opportunity is reported at. AOP and Evaluation bookend the
 * continuum (annual plan / post-award) and are not per-opportunity stages, so
 * the per-opportunity phases are Identification → Pursuit → Capture → Proposal.
 *
 * This is a DISPLAY layer only: DB stage keys, workflow controls (stepper,
 * stage-change selects, forward actions), the operational pipeline board, and
 * every metric calculation are unchanged. Several fine-grained operational
 * stages roll up into one doctrine phase.
 */
export const DOCTRINE_PHASE_ORDER = [
  "Identification",
  "Pursuit",
  "Capture",
  "Proposal",
] as const;

export type DoctrinePhase = (typeof DOCTRINE_PHASE_ORDER)[number];

/**
 * Per-opportunity stage → doctrine phase. Terminal outcomes keep their outcome
 * labels (Won / Lost / No Bid / Government Cancelled) — an outcome is not a
 * capture phase.
 */
export const STAGE_KEY_TO_DOCTRINE_PHASE: Record<CanonicalStageKey, string> = {
  interest: "Identification",
  qualify: "Identification",
  qualified: "Pursuit",
  pursue: "Pursuit",
  solicitation: "Capture",
  post_submittal: "Proposal",
  won: "Won",
  lost: "Lost",
  no_bid: "No Bid",
  gov_cancelled: "Government Cancelled",
};

/**
 * Outward-facing capture-doctrine phase label for a stage. Accepts either a DB
 * key (e.g. `post_submittal`) or a display label (e.g. `Post-Submittal`);
 * returns the input unchanged if it maps to neither.
 */
export function stageToDoctrinePhase(stage: string): string {
  if (Object.prototype.hasOwnProperty.call(STAGE_KEY_TO_DOCTRINE_PHASE, stage)) {
    return STAGE_KEY_TO_DOCTRINE_PHASE[stage as CanonicalStageKey];
  }
  const key = LABEL_TO_DB_KEY[stage as Stage];
  if (key) return STAGE_KEY_TO_DOCTRINE_PHASE[key];
  return stage;
}

/* ---- Tab config --------------------------------------------------------- */

export const STAGE_TABS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "interest", label: "Interest" },
  { key: "qualify", label: "Qualify" },
  { key: "qualified", label: "Qualified" },
  { key: "pursue", label: "Pursue" },
  { key: "solicitation", label: "Solicitation" },
  { key: "post_submittal", label: "Post-Submittal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "no_bid", label: "No Bid" },
  { key: "gov_cancelled", label: "Government Cancelled" },
  // 'passed' is a relevance-derived view (auto_pass: in-NAICS but past due /
  // too little lead time), not a pipeline stage. Auto-passed opps are excluded
  // from every other tab and surfaced here.
  { key: "passed", label: "Passed" },
];

/* ---- Stage actions (canonical forward path) ----------------------------- */

export const STAGE_ACTIONS: Record<
  string,
  ReadonlyArray<{ label: string; stage?: string }>
> = {
  Interest: [
    { label: "Qualify", stage: "qualify" },
    { label: "No Bid", stage: "no_bid" },
    { label: "Add to Watch List" },
  ],
  Qualify: [
    { label: "Advance to Qualified", stage: "qualified" },
    { label: "No Bid", stage: "no_bid" },
  ],
  Qualified: [
    { label: "Advance to Pursue", stage: "pursue" },
    { label: "No Bid", stage: "no_bid" },
  ],
  Pursue: [
    { label: "Advance to Solicitation", stage: "solicitation" },
    { label: "Run Color Team" },
    { label: "No Bid", stage: "no_bid" },
  ],
  Solicitation: [
    { label: "Move to Post-Submittal", stage: "post_submittal" },
    { label: "No Bid", stage: "no_bid" },
    { label: "Government Cancelled", stage: "gov_cancelled" },
  ],
  "Post-Submittal": [
    { label: "Mark Won", stage: "won" },
    { label: "Mark Lost", stage: "lost" },
    { label: "Government Cancelled", stage: "gov_cancelled" },
  ],
};

/* ---- Badge styles ------------------------------------------------------- */

export const STAGE_BADGE_STYLES: Record<string, string> = {
  interest: "border-muted text-muted-foreground",
  qualify: "border-gda-cyan text-gda-cyan",
  qualified: "border-gda-blue text-gda-blue",
  pursue: "border-gda-amber text-gda-amber",
  solicitation: "border-gda-green text-gda-green",
  post_submittal: "border-gda-green text-gda-green",
  won: "bg-gda-green/20 text-gda-green border-transparent",
  lost: "bg-gda-red/10 text-gda-red border-transparent",
  no_bid: "bg-gda-red/10 text-gda-red border-transparent",
  gov_cancelled: "bg-muted/10 text-muted-foreground border-transparent",
};

/* ---- Helpers ------------------------------------------------------------ */

export function isTerminal(stage: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

export function stageColor(stage: string): string {
  switch (stage) {
    case "Interest":
      return "text-gda-cyan";
    case "Qualify":
      return "text-gda-blue";
    case "Qualified":
      return "text-gda-blue";
    case "Pursue":
      return "text-gda-green-muted";
    case "Solicitation":
      return "text-gda-amber";
    case "Post-Submittal":
      return "text-gda-purple";
    // Doctrine phases (display-only)
    case "Identification":
      return "text-gda-cyan";
    case "Pursuit":
      return "text-gda-blue";
    case "Capture":
      return "text-gda-amber";
    case "Proposal":
      return "text-gda-purple";
    case "Won":
      return "text-gda-green";
    case "Lost":
      return "text-gda-red";
    case "No Bid":
    case "Government Cancelled":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

export function stageBgColor(stage: string): string {
  switch (stage) {
    case "Interest":
      return "bg-gda-cyan/10 border-gda-cyan/30";
    case "Qualify":
      return "bg-gda-blue/10 border-gda-blue/30";
    case "Qualified":
      return "bg-gda-blue/10 border-gda-blue/30";
    case "Pursue":
      return "bg-gda-green-muted/10 border-gda-green-muted/30";
    case "Solicitation":
      return "bg-gda-amber/10 border-gda-amber/30";
    case "Post-Submittal":
      return "bg-gda-purple/10 border-gda-purple/30";
    case "Won":
      return "bg-gda-green/10 border-gda-green/30";
    case "Lost":
      return "bg-gda-red/10 border-gda-red/30";
    default:
      return "bg-muted/10 border-border";
  }
}

export function stageKeyToLabel(dbKey: string): string {
  return DB_KEY_TO_LABEL[dbKey as CanonicalStageKey] ?? dbKey;
}
