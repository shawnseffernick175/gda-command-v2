/**
 * Prompt-writing frameworks for the guided creator.
 *
 * Each framework defines an ordered set of fields. The user fills them in and
 * we assemble a single, clean prompt. Source: ChatGPT Prompt Writing
 * Frameworks (RTF, TAG, BAB, CARE, RISE).
 */

export interface FrameworkField {
  /** Stable key used for state. */
  key: string;
  /** Short label shown above the input. */
  label: string;
  /** The framework letter this field maps to (e.g. "R", "T", "F"). */
  letter: string;
  /** Helper/placeholder text guiding what to write. */
  placeholder: string;
  /** Whether this field renders as a multi-line textarea. */
  multiline?: boolean;
}

export interface Framework {
  id: string;
  /** e.g. "R-T-F" */
  acronym: string;
  name: string;
  tagline: string;
  fields: FrameworkField[];
  /**
   * Assemble the field values into a final prompt string. Missing values are
   * skipped so a partially-filled framework still produces something usable.
   */
  assemble: (values: Record<string, string>) => string;
}

function line(label: string, value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

export const FRAMEWORKS: Framework[] = [
  {
    id: "rtf",
    acronym: "R-T-F",
    name: "Role · Task · Format",
    tagline: "Act as a role, do a task, return it in a format.",
    fields: [
      {
        key: "role",
        letter: "R",
        label: "Act as a (Role)",
        placeholder: "e.g. a senior capture manager at a defense IT firm",
      },
      {
        key: "task",
        letter: "T",
        label: "Create a (Task)",
        placeholder: "e.g. draft a capture summary for this opportunity",
        multiline: true,
      },
      {
        key: "format",
        letter: "F",
        label: "Show as (Format)",
        placeholder: "e.g. a one-page brief with headers and bullets",
      },
    ],
    assemble: (v) =>
      [
        line("Role", v.role),
        line("Task", v.task),
        line("Format", v.format),
      ]
        .filter(Boolean)
        .join("\n"),
  },
  {
    id: "tag",
    acronym: "T-A-G",
    name: "Task · Action · Goal",
    tagline: "Define a task, state the action, clarify the goal.",
    fields: [
      {
        key: "task",
        letter: "T",
        label: "Define a (Task)",
        placeholder: "e.g. revise our teaming outreach email",
      },
      {
        key: "action",
        letter: "A",
        label: "State the (Action)",
        placeholder: "e.g. act as a govcon BD lead and rewrite the 3-email flow",
        multiline: true,
      },
      {
        key: "goal",
        letter: "G",
        label: "Clarify the (Goal)",
        placeholder: "e.g. land 3 qualified teaming calls within 2 weeks",
      },
    ],
    assemble: (v) =>
      [
        line("Task", v.task),
        line("Action", v.action),
        line("Goal", v.goal),
      ]
        .filter(Boolean)
        .join("\n"),
  },
  {
    id: "bab",
    acronym: "B-A-B",
    name: "Before · After · Bridge",
    tagline: "Explain the problem, the outcome, and the bridge between.",
    fields: [
      {
        key: "before",
        letter: "B",
        label: "Explain problem (Before)",
        placeholder: "e.g. our pipeline review takes a full day each week",
        multiline: true,
      },
      {
        key: "after",
        letter: "A",
        label: "State outcome (After)",
        placeholder: "e.g. we want a 15-minute review with clear priorities",
      },
      {
        key: "bridge",
        letter: "B",
        label: "Ask to the (Bridge)",
        placeholder: "e.g. suggest a scoring rubric and weekly digest format",
        multiline: true,
      },
    ],
    assemble: (v) =>
      [
        line("Before (problem)", v.before),
        line("After (desired outcome)", v.after),
        line("Bridge (what to do)", v.bridge),
      ]
        .filter(Boolean)
        .join("\n"),
  },
  {
    id: "care",
    acronym: "C-A-R-E",
    name: "Context · Action · Result · Example",
    tagline: "Give context, the action, the result, and an example.",
    fields: [
      {
        key: "context",
        letter: "C",
        label: "Give the (Context)",
        placeholder: "e.g. we're bidding a $5M IDIQ recompete in Q3",
        multiline: true,
      },
      {
        key: "action",
        letter: "A",
        label: "Describe (Action)",
        placeholder: "e.g. help us draft win themes that beat the incumbent",
      },
      {
        key: "result",
        letter: "R",
        label: "Clarify the (Result)",
        placeholder: "e.g. 5 win themes mapped to evaluation factors",
      },
      {
        key: "example",
        letter: "E",
        label: "Give the (Example)",
        placeholder: "e.g. a past win where past performance carried the bid",
        multiline: true,
      },
    ],
    assemble: (v) =>
      [
        line("Context", v.context),
        line("Action", v.action),
        line("Result", v.result),
        line("Example", v.example),
      ]
        .filter(Boolean)
        .join("\n"),
  },
  {
    id: "rise",
    acronym: "R-I-S-E",
    name: "Role · Input · Steps · Outcome",
    tagline: "Specify a role, the input, the steps, and the outcome.",
    fields: [
      {
        key: "role",
        letter: "R",
        label: "Specify the (Role)",
        placeholder: "e.g. a senior proposal manager",
      },
      {
        key: "input",
        letter: "I",
        label: "Describe (Input)",
        placeholder: "e.g. we've collected the RFP, Q&A, and incumbent data",
        multiline: true,
      },
      {
        key: "steps",
        letter: "S",
        label: "Ask for (Steps)",
        placeholder: "e.g. outline a compliant proposal section by section",
      },
      {
        key: "outcome",
        letter: "E",
        label: "Describe the (Outcome)",
        placeholder: "e.g. a compliant, win-theme-aligned proposal outline",
      },
    ],
    assemble: (v) =>
      [
        line("Role", v.role),
        line("Input", v.input),
        line("Steps", v.steps),
        line("Outcome", v.outcome),
      ]
        .filter(Boolean)
        .join("\n"),
  },
];

export function getFramework(id: string): Framework | undefined {
  return FRAMEWORKS.find((f) => f.id === id);
}
