import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../logger";
import type { ExtractResult } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OCR_ENABLED = process.env.OCR_ENABLED !== "false"; // default: true
const MIN_TEXT_CHARS = 100; // below this, treat as scanned PDF
const MAX_OCR_PAGES = 50;
const OCR_PAGE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// PDF extractor with OCR fallback for scanned documents
// ---------------------------------------------------------------------------

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  // 1. Try native text extraction via pdf-parse
  const nativeText = await extractNativeText(buffer);

  const stripped = nativeText.replace(/\s+/g, "");
  if (stripped.length >= MIN_TEXT_CHARS) {
    // Text-layer PDF — return native text, no OCR
    return { text: nativeText, metadata: { extraction_method: "native" } };
  }

  // 2. Scanned PDF detected — text layer is empty or too short
  if (!OCR_ENABLED) {
    throw new Error("PDF has no text layer, OCR disabled");
  }

  log.info("pdf_ocr_fallback", { textLen: stripped.length });

  // 3. Convert pages to images and OCR each
  const ocrText = await ocrPdfPages(buffer);

  if (!ocrText || ocrText.replace(/\s+/g, "").length < 10) {
    throw new Error("OCR returned no meaningful text from scanned PDF");
  }

  return {
    text: ocrText,
    metadata: { extraction_method: "ocr", ocr_engine: "tesseract", ocr_language: "eng" },
  };
}

// ---------------------------------------------------------------------------
// Native pdf-parse extraction
// ---------------------------------------------------------------------------

async function extractNativeText(buffer: Buffer): Promise<string> {
  try {
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
      return result.text;
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (err) {
    log.error("pdf_extract_error", { error: String(err) });
    return "";
  }
}

// ---------------------------------------------------------------------------
// OCR fallback: convert PDF pages to images via pdftoppm, then Tesseract
// ---------------------------------------------------------------------------

async function ocrPdfPages(buffer: Buffer): Promise<string> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  // Check if pdftoppm is available
  try {
    await execFileAsync("pdftoppm", ["-v"], { timeout: 5000 });
  } catch {
    throw new Error("pdftoppm (poppler-utils) not available for PDF OCR");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gda-pdf-ocr-"));

  try {
    const tmpPdf = path.join(tmpDir, "input.pdf");
    fs.writeFileSync(tmpPdf, buffer);

    // Convert PDF to PNG images (one per page, capped at MAX_OCR_PAGES)
    const pngPrefix = path.join(tmpDir, "page");
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-r", "300", // 300 DPI for good OCR quality
        "-l", String(MAX_OCR_PAGES), // last page to convert
        tmpPdf,
        pngPrefix,
      ],
      { timeout: MAX_OCR_PAGES * OCR_PAGE_TIMEOUT_MS },
    );

    // Find generated page images (sorted numerically)
    const pageFiles = fs.readdirSync(tmpDir)
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort();

    if (pageFiles.length === 0) {
      throw new Error("pdftoppm produced no page images");
    }

    const { runOcr } = await import("./image-ocr");

    const pageTexts: string[] = [];
    let truncated = false;

    for (let i = 0; i < pageFiles.length; i++) {
      if (i >= MAX_OCR_PAGES) {
        truncated = true;
        break;
      }

      const pageBuffer = fs.readFileSync(path.join(tmpDir, pageFiles[i]));
      try {
        const text = await runOcr(pageBuffer);
        pageTexts.push(text.trim());
      } catch (err) {
        const msg = (err as Error).message;
        log.warn("pdf_ocr_page_error", { page: i + 1, error: msg });
        pageTexts.push(`[OCR error on page ${i + 1}]`);
      }
    }

    let combined = pageTexts
      .map((t, i) => `\n\n--- page ${i + 1} ---\n\n${t}`)
      .join("");

    if (truncated) {
      combined += "\n\n[truncated: document exceeds OCR page limit]";
    }

    log.info("pdf_ocr_complete", { pages: pageTexts.length, truncated });
    return combined.trim();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
