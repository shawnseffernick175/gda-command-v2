// ---------------------------------------------------------------------------
// Email Action Extractor — heuristic-based action item extraction from emails.
// TODO Sprint 4/5: replace heuristic extraction with Agentic AI door LLM call (door 11).
// ---------------------------------------------------------------------------

export interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  message_id?: string;
  received_at: string;
}

export interface ExtractedDraft {
  kind: "reply" | "research" | "milestone";
  draft_text: string;
}

export interface ExtractedAction {
  title: string;
  detail: string;
  owner_email: string;
  source: "email";
  source_id: string | undefined;
  due_date: string | null;
  due_inferred_from: string | null;
  ou_tag: string;
  draft: ExtractedDraft;
}

function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(Re:\s*|Fwd:\s*|FW:\s*)+/gi, "").trim();
}

function extractTitle(payload: EmailPayload): string {
  const stripped = stripSubjectPrefixes(payload.subject);
  if (stripped.length > 0) return stripped;
  const firstLine = payload.body_text
    .split("\n")
    .find((l) => l.trim().length > 0);
  return firstLine ? firstLine.trim().slice(0, 120) : "Untitled action item";
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getNextWeekday(dayName: string): Date {
  const target = DAY_NAMES.indexOf(dayName.toLowerCase());
  if (target === -1) return new Date();
  const now = new Date();
  const currentDay = now.getDay();
  let diff = target - currentDay;
  if (diff <= 0) diff += 7;
  const result = new Date(now);
  result.setDate(result.getDate() + diff);
  return result;
}

function getEndOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day <= 5 ? 5 - day : 0;
  const friday = new Date(now);
  friday.setDate(friday.getDate() + diff);
  return friday;
}

function getEndOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function extractDueDate(
  bodyText: string,
): { due_date: string | null; due_inferred_from: string | null } {
  const text = bodyText.toLowerCase();

  const eodPatterns = /\b(by eod|by end of day)\b/i;
  const eodMatch = bodyText.match(eodPatterns);
  if (eodMatch) {
    return { due_date: formatDate(new Date()), due_inferred_from: eodMatch[0] };
  }

  const eowPatterns = /\b(by eow|by end of week)\b/i;
  const eowMatch = bodyText.match(eowPatterns);
  if (eowMatch) {
    return {
      due_date: formatDate(getEndOfWeek()),
      due_inferred_from: eowMatch[0],
    };
  }

  const eomPatterns = /\b(by eom|by end of month)\b/i;
  const eomMatch = bodyText.match(eomPatterns);
  if (eomMatch) {
    return {
      due_date: formatDate(getEndOfMonth()),
      due_inferred_from: eomMatch[0],
    };
  }

  const nextDayPattern = /\bby next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
  const nextDayMatch = bodyText.match(nextDayPattern);
  if (nextDayMatch) {
    return {
      due_date: formatDate(getNextWeekday(nextDayMatch[1])),
      due_inferred_from: nextDayMatch[0],
    };
  }

  const explicitDatePattern =
    /\b(?:by|due|deadline|no later than|NLT)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+\s+\d{1,2},?\s*\d{2,4})\b/i;
  const explicitMatch = bodyText.match(explicitDatePattern);
  if (explicitMatch) {
    const parsed = new Date(explicitMatch[1]);
    if (!isNaN(parsed.getTime())) {
      return {
        due_date: formatDate(parsed),
        due_inferred_from: explicitMatch[0],
      };
    }
  }

  return { due_date: null, due_inferred_from: null };
}

function extractOwner(
  bodyText: string,
): { owner_email: string; ou_tag: string } {
  const text = bodyText.toLowerCase();

  if (/\bangela\b/i.test(bodyText)) {
    return { owner_email: "shawn", ou_tag: "riverstone" };
  }

  if (/\bgina\b/i.test(bodyText)) {
    return { owner_email: "shawn", ou_tag: "pd_systems" };
  }

  return { owner_email: "shawn", ou_tag: "envision" };
}

function extractDraftKind(
  bodyText: string,
): "reply" | "research" | "milestone" {
  const text = bodyText.toLowerCase();

  if (/\b(reply|respond|let me know|please confirm|get back)\b/.test(text)) {
    return "reply";
  }

  if (/\b(research|look into|find out|check on)\b/.test(text)) {
    return "research";
  }

  return "milestone";
}

function extractFromName(from: string): string {
  const nameMatch = from.match(/^([^<]+)/);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    if (name.length > 0 && name !== from) return name;
  }
  return from.split("@")[0] || from;
}

function generateDraftText(
  kind: "reply" | "research" | "milestone",
  title: string,
  fromName: string,
  dueDate: string | null,
  ownerEmail: string,
  messageId: string | undefined,
  receivedAt: string,
): string {
  switch (kind) {
    case "reply":
      return `Hi ${fromName}, Understood — I'll ${title}. Will follow up by ${dueDate || "shortly"}. — Shawn`;
    case "research":
      return `Research prompt: ${title}. Scope: review against GDA doctrine + capabilities. Source: ${fromName} email ${receivedAt}.`;
    case "milestone":
      return `Milestone: ${title}. Owner: ${ownerEmail}. Due: ${dueDate || "TBD"}. Linked from email ${messageId || "N/A"}.`;
  }
}

export async function extractActionFromEmail(
  emailPayload: EmailPayload,
): Promise<ExtractedAction> {
  const title = extractTitle(emailPayload);
  const { due_date, due_inferred_from } = extractDueDate(
    emailPayload.body_text,
  );
  const { owner_email, ou_tag } = extractOwner(emailPayload.body_text);
  const kind = extractDraftKind(emailPayload.body_text);
  const fromName = extractFromName(emailPayload.from);

  const draftText = generateDraftText(
    kind,
    title,
    fromName,
    due_date,
    owner_email,
    emailPayload.message_id,
    emailPayload.received_at,
  );

  return {
    title,
    detail: emailPayload.body_text.slice(0, 500),
    owner_email,
    source: "email",
    source_id: emailPayload.message_id,
    due_date,
    due_inferred_from,
    ou_tag,
    draft: {
      kind,
      draft_text: draftText,
    },
  };
}
