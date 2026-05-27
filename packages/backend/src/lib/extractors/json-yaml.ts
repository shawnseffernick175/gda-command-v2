import type { ExtractResult } from "./types";

/**
 * Flatten a nested object/array into "key.path: value" lines.
 */
function flatten(obj: unknown, prefix: string = ""): string[] {
  const lines: string[] = [];

  if (obj === null || obj === undefined) {
    if (prefix) lines.push(`${prefix}: null`);
    return lines;
  }

  if (typeof obj !== "object") {
    const val = typeof obj === "string" ? obj : String(obj);
    if (prefix) {
      lines.push(`${prefix}: ${val}`);
    } else {
      lines.push(val);
    }
    return lines;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      lines.push(...flatten(obj[i], `${prefix}[${i}]`));
    }
    return lines;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    lines.push(...flatten(value, path));
  }

  return lines;
}

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  const raw = buffer.toString("utf-8").trim();

  let data: unknown;
  let format: "json" | "yaml" = "json";

  // Try JSON first
  try {
    data = JSON.parse(raw);
  } catch {
    // Try YAML
    const yaml = await import("js-yaml");
    try {
      data = yaml.load(raw);
      format = "yaml";
    } catch (yamlErr) {
      throw new Error(`Failed to parse as JSON or YAML: ${String(yamlErr)}`);
    }
  }

  const lines = flatten(data);
  const text = lines.join("\n");

  return {
    text,
    metadata: {
      extractionPath: `json-yaml-${format}`,
      format,
      leafCount: lines.length,
    },
  };
}
