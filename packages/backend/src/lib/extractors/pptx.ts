import { log } from "../logger";
import type { ExtractResult } from "./types";

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseOfficeAsync } = require("officeparser") as {
      parseOfficeAsync: (buf: Buffer) => Promise<string>;
    };
    const text = await parseOfficeAsync(buffer);
    return { text, metadata: {} };
  } catch (err) {
    log.error("pptx_extract_error", { error: String(err) });
    return { text: "", metadata: { extractError: String(err) } };
  }
}
