/**
 * Minimal, spec-correct Server-Sent-Events record parser.
 *
 * The opportunity Decision Brief stream (`GET /v3/opportunities/:id/analysis`)
 * emits ONE SSE record per section, each terminated by a blank line:
 *
 *   data: {"section":"pwin", ...}\n\n
 *   data: {"section":"doctrine", ...}\n\n
 *   ...
 *   event: done\ndata: {}\n\n
 *
 * A naive reader that keeps only the last `data:` line and runs a single
 * `JSON.parse` at the end discards every section but the last and never
 * dispatches per-section payloads (#1125). These helpers split a progressively
 * accumulated buffer on the SSE record separator (`\n\n`) and reassemble the
 * `event:` / `data:` fields of each complete record — concatenating multiple
 * `data:` lines within one record, per the SSE spec — so events that straddle
 * network-chunk boundaries are never lost.
 */

export interface SSERecord {
  /** The `event:` field value, or null when the record has no event line. */
  event: string | null;
  /** All `data:` lines joined with `\n` (empty string when there were none). */
  data: string;
}

/**
 * Split an accumulated SSE buffer into complete records plus a trailing
 * remainder — a partial record not yet terminated by a blank line. The caller
 * keeps `rest` in its buffer and prepends it to the next chunk so records that
 * span chunk boundaries are reassembled.
 */
export function splitSSEBuffer(buffer: string): {
  records: SSERecord[];
  rest: string;
} {
  // Normalize CRLF / lone CR so record + line splitting is line-ending agnostic.
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const records: SSERecord[] = [];
  for (const raw of parts) {
    const rec = parseSSERecord(raw);
    if (rec) records.push(rec);
  }
  return { records, rest };
}

/**
 * Parse a single raw SSE record (its lines, without the trailing blank line).
 * Returns null for a record with no `event:`/`data:` fields (e.g. a comment or
 * keep-alive `:` line).
 */
export function parseSSERecord(raw: string): SSERecord | null {
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of raw.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // blank / comment
    if (line.startsWith("event:")) {
      event = stripField(line.slice("event:".length));
    } else if (line.startsWith("data:")) {
      dataLines.push(stripField(line.slice("data:".length)));
    }
    // Other SSE fields (id:, retry:) are intentionally ignored.
  }

  if (event === null && dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** Per the SSE spec, a single leading space after the field colon is stripped. */
function stripField(value: string): string {
  return value.startsWith(" ") ? value.slice(1) : value;
}
