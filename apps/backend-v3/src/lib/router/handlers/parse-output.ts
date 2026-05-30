/**
 * Shared helper: parse LLM text as JSON and validate against zod schema.
 * On validation failure, returns the error for re-prompt.
 *
 * Uses a structural schema interface decoupled from zod's internal
 * type parameters to avoid Zod v4 assignability issues.
 */

export interface ParseResult<T> {
  ok: true;
  data: T;
}

export interface ParseError {
  ok: false;
  error: string;
}

interface ZodSafeParseable {
  safeParse(data: unknown): {
    success: boolean;
    data?: unknown;
    error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
  };
}

export function parseAndValidate<T>(
  text: string,
  schema: ZodSafeParseable,
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
    return { ok: true, data: result.data as T };
  }

  const issues = (result.error?.issues ?? [])
    .map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `Schema validation failed: ${issues}` };
}
