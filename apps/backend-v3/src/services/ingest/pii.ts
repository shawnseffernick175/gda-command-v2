/**
 * PII detection and redaction — F-304.
 *
 * No doc body is sent to external LLMs without redaction pass.
 * Detects SSN, DoB, full names of cleared personnel patterns.
 */

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB_LABELED_RE = /\b(date\s+of\s+birth|dob|d\.o\.b\.)\s*:?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi;
const CLEARANCE_NAME_RE = /\b(TS\/SCI|TOP\s+SECRET|SECRET|CONFIDENTIAL)\s+(?:clearance\s+)?(?:holder\s*:?\s*)?([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const PASSPORT_RE = /\b[A-Z]\d{8}\b/g;

function testPattern(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

export function detectPii(text: string): boolean {
  if (testPattern(SSN_RE, text)) return true;
  if (testPattern(CLEARANCE_NAME_RE, text)) return true;
  if (testPattern(DOB_LABELED_RE, text)) return true;
  return false;
}

export function redactPii(text: string): string {
  let redacted = text;
  redacted = redacted.replace(SSN_RE, '[REDACTED-SSN]');
  redacted = redacted.replace(CLEARANCE_NAME_RE, '$1 clearance holder: [REDACTED-NAME]');
  redacted = redacted.replace(DOB_LABELED_RE, '[REDACTED-DOB]');
  return redacted;
}

export function fullRedact(text: string): string {
  let redacted = redactPii(text);
  redacted = redacted.replace(EMAIL_RE, '[REDACTED-EMAIL]');
  redacted = redacted.replace(PHONE_RE, '[REDACTED-PHONE]');
  redacted = redacted.replace(PASSPORT_RE, '[REDACTED-PASSPORT]');
  return redacted;
}
