import type { ExtractResult } from "./types";

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  const { parse } = await import("node-html-parser");
  const raw = buffer.toString("utf-8");
  const root = parse(raw);

  // Remove script, style, and noscript tags
  for (const tag of root.querySelectorAll("script, style, noscript")) {
    tag.remove();
  }

  // Get text content, preserving paragraph breaks
  let text = root.structuredText ?? root.textContent ?? "";

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Collapse excessive whitespace while keeping paragraph breaks
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const title = root.querySelector("title")?.textContent?.trim() ?? null;

  return {
    text,
    metadata: {
      extractionPath: "html",
      title,
    },
  };
}
