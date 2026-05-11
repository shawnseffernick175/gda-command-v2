/**
 * CSV export utility — converts arrays of objects to CSV format.
 * No external dependencies.
 */

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";

  const keys = columns ?? Object.keys(rows[0]);
  const header = keys.map(escapeCSV).join(",");
  const lines = rows.map((row) =>
    keys.map((k) => escapeCSV(formatValue(row[k]))).join(",")
  );

  return [header, ...lines].join("\n");
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}
