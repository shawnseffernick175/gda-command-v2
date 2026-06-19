/**
 * Prompt live-status classification.
 *
 * Mirrors the backend TASK_PROMPT_KEY map in
 * apps/backend-v3/src/lib/providers/anthropic.ts. A prompt whose `prompt_key`
 * is wired to an AI task reads from the editable library at runtime — editing
 * it retunes live AI behavior. Everything else is stored but not consumed by
 * any AI task (so editing it changes nothing today), except the doctrine
 * principles (managed on the Doctrine tab) and the strict extractors, which are
 * intentionally system-locked.
 *
 * Keep this list in sync with TASK_PROMPT_KEY on the backend.
 */

// prompt_library keys that are read by a live AI task.
export const LIVE_PROMPT_KEYS: ReadonlySet<string> = new Set([
  "opportunity_analysis",
  "risk_generation",
  "fast_track_triage",
  "competitor_black_hat",
  "award_analysis",
  "capture_plan",
  "competitor_analysis",
  "match_analysis",
  "sentinel_summary",
  "digest_lead",
  "contact_enrich",
]);

export type PromptStatus = "live" | "inert";

export function promptStatus(promptKey: string): PromptStatus {
  return LIVE_PROMPT_KEYS.has(promptKey) ? "live" : "inert";
}

export function promptStatusLabel(status: PromptStatus): string {
  return status === "live" ? "Live" : "Not wired";
}

export function promptStatusTooltip(status: PromptStatus): string {
  return status === "live"
    ? "This prompt drives a live AI task. Editing it retunes the AI immediately — no redeploy needed."
    : "Stored but not currently read by any AI task. Editing it will not change AI behavior yet.";
}

export function promptStatusClasses(status: PromptStatus): string {
  return status === "live"
    ? "border-gda-green/30 bg-gda-green/10 text-gda-green"
    : "border-border bg-gda-panel text-muted-foreground";
}
