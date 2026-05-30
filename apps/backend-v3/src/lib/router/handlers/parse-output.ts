/**
 * Shared helper: parse LLM text as JSON and validate against zod schema.
 * On validation failure, returns the error for re-prompt.
 */

export interface ParseResult<T> {
  ok: true;
  data: T;
}

export interface ParseError {
  ok: false;
  error: string;
}

interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

interface SafeParseError {
  success: false;
  error: { issues: Array<{ path: PropertyKey[]; message: string }> };
}

interface ZodLikeSchema<T> {
  safeParse(data: unknown): SafeParseSuccess<T> | SafeParseError;
}

export function parseAndValidate<T>(
  text: string,
  schema: ZodLikeSchema<T>,
): ParseResult<T> | ParseError {
  let parsed: unknown;
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1]!.trim() : text.trim();
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `Invalid JSON: ${text.slice(0, 200)}` };
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issues = result.error.issues
    .map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `Schema validation failed: ${issues}` };
}
