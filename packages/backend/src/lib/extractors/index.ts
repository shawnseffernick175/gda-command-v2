import type { ExtractResult } from "./types";
export type { ExtractResult } from "./types";

type Extractor = { extract: (buffer: Buffer) => Promise<ExtractResult> };

const extractorMap: Record<string, () => Promise<Extractor>> = {
  // Tier 1 — Office (PR 1)
  "application/pdf": () => import("./pdf"),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": () => import("./docx"),
  "application/msword": () => import("./pptx"), // officeparser handles DOC
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": () => import("./xlsx"),
  "application/vnd.ms-excel": () => import("./xlsx"),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": () => import("./pptx"),

  // PR 2 — Email
  "message/rfc822": () => import("./email"),
  "application/vnd.ms-outlook": () => import("./email"),

  // PR 2 — HTML/XML
  "text/html": () => import("./html"),
  "application/xhtml+xml": () => import("./html"),
  "application/xml": () => import("./html"),
  "text/xml": () => import("./html"),

  // PR 2 — JSON/YAML (structured extraction with flattening)
  "text/yaml": () => import("./json-yaml"),
  "application/yaml": () => import("./json-yaml"),
  "application/x-yaml": () => import("./json-yaml"),
};

/** MIME types that have a wired extractor. */
export const EXTRACTABLE_MIMES = new Set(Object.keys(extractorMap));

/** Plain-text MIME types (read buffer as UTF-8, no extractor needed). */
export const PLAIN_TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

/** Returns true if we can extract text from this MIME type. */
export function isExtractable(mime: string): boolean {
  return EXTRACTABLE_MIMES.has(mime) || PLAIN_TEXT_MIMES.has(mime);
}

/** Run the appropriate extractor for the given MIME type. */
export async function runExtractor(buffer: Buffer, mime: string): Promise<ExtractResult> {
  if (PLAIN_TEXT_MIMES.has(mime)) {
    return { text: buffer.toString("utf-8"), metadata: { extractionPath: "plain" } };
  }

  const loader = extractorMap[mime];
  if (!loader) {
    return { text: "", metadata: { extractionPath: "unsupported" } };
  }

  const mod = await loader();
  return mod.extract(buffer);
}
