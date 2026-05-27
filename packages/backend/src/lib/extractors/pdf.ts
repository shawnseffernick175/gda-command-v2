import { log } from "../logger";
import type { ExtractResult } from "./types";

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfMod = require("pdf-parse") as {
    PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
      getText: () => Promise<{ text: string }>;
      destroy: () => Promise<void>;
    };
  };
  const parser = new pdfMod.PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { text: result.text, metadata: {} };
  } catch (err) {
    log.error("pdf_extract_error", { error: String(err) });
    return { text: "", metadata: { extractError: String(err) } };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
