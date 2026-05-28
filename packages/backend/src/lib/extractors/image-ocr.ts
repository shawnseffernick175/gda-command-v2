import { log } from "../logger";
import type { ExtractResult } from "./types";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const OCR_TIMEOUT_MS = 60_000; // 60 seconds per image

// ---------------------------------------------------------------------------
// Image OCR extractor via Tesseract
// ---------------------------------------------------------------------------

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("image exceeds 200MB size limit");
  }

  const text = await runOcr(buffer);

  const stripped = text.replace(/\s+/g, "");
  if (stripped.length < 10) {
    throw new Error("OCR returned no meaningful text");
  }

  return {
    text: collapseWhitespace(text),
    metadata: {
      extraction_method: "ocr",
      ocr_engine: "tesseract",
      ocr_language: "eng",
    },
  };
}

// ---------------------------------------------------------------------------
// Run Tesseract OCR on a buffer
// ---------------------------------------------------------------------------

export async function runOcr(buffer: Buffer): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const { execFile } = await import("child_process");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gda-ocr-"));
  const tmpFile = path.join(tmpDir, "input.png");
  fs.writeFileSync(tmpFile, buffer);

  try {
    const text = await new Promise<string>((resolve, reject) => {
      const proc = execFile(
        "tesseract",
        [tmpFile, "stdout", "-l", "eng"],
        { timeout: OCR_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const errAny = err as Error & { killed?: boolean };
            if (errAny.killed || err.message.includes("ETIMEDOUT")) {
              reject(new Error("OCR timeout"));
              return;
            }
            log.error("ocr_error", { error: String(err), stderr: stderr?.slice(0, 200) });
            reject(err);
            return;
          }
          resolve(stdout);
        },
      );
      // Safety: kill if still running after timeout
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, OCR_TIMEOUT_MS + 5000);
    });
    return text;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Collapse whitespace while preserving paragraph breaks
// ---------------------------------------------------------------------------

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
