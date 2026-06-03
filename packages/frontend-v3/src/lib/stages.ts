/**
 * Canonical stage model — tool-wide.
 * Active: Interest → Qualify → Pursue → Solicitation → Post-Submittal
 * Terminal: Won · Lost · No Bid · Government Cancelled
 */

export const ACTIVE_STAGES = [
  "Interest",
  "Qualify",
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

export function isTerminal(stage: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

export function stageColor(stage: string): string {
  switch (stage) {
    case "Interest":
      return "text-gda-cyan";
    case "Qualify":
      return "text-gda-blue";
    case "Pursue":
      return "text-gda-green-muted";
    case "Solicitation":
      return "text-gda-amber";
    case "Post-Submittal":
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
