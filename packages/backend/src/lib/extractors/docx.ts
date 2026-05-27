import { log } from "../logger";
import type { ExtractResult } from "./types";

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, metadata: {} };
  } catch (err) {
    log.error("docx_extract_error", { error: String(err) });
    return { text: "", metadata: { extractError: String(err) } };
  }
}
