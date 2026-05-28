/**
 * F-038 Phase 2B PR 4: OCR extractor + PDF OCR fallback tests.
 *
 * Tests for image-ocr.ts (Tesseract OCR on images) and pdf.ts (OCR fallback
 * for scanned PDFs). All fixtures are synthetic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/ingestion");

// Check if tesseract and pdftoppm are available
let hasTesseract = false;
let hasPdftoppm = false;
try {
  execSync("tesseract --version", { stdio: "ignore" });
  hasTesseract = true;
} catch {}
try {
  execSync("pdftoppm -v", { stdio: "ignore" });
  hasPdftoppm = true;
} catch {
  try {
    execSync("which pdftoppm", { stdio: "ignore" });
    hasPdftoppm = true;
  } catch {}
}

// ---------------------------------------------------------------------------
// 1. Image OCR extractor — happy path
// ---------------------------------------------------------------------------

describe.skipIf(!hasTesseract)("Image OCR extractor", () => {
  it("extracts text from scanned-page.png", async () => {
    const { extract } = await import("../lib/extractors/image-ocr");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "scanned-page.png"));
    const result = await extract(buf);

    expect(result.text).toContain("GDA OCR Test");
    expect(result.text).toContain("Universal Document Ingestion Gateway");
    expect(result.metadata.extraction_method).toBe("ocr");
    expect(result.metadata.ocr_engine).toBe("tesseract");
    expect(result.metadata.ocr_language).toBe("eng");
  });

  it("throws on noise image with no meaningful text", async () => {
    const { extract } = await import("../lib/extractors/image-ocr");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "noise.png"));

    await expect(extract(buf)).rejects.toThrow("OCR returned no meaningful text");
  });

  it("rejects oversized buffers", async () => {
    const { extract } = await import("../lib/extractors/image-ocr");
    const buf = Buffer.alloc(201 * 1024 * 1024); // 201MB

    await expect(extract(buf)).rejects.toThrow("image exceeds 200MB size limit");
  });
});

// ---------------------------------------------------------------------------
// 2. PDF extractor — text-layer PDF (no OCR)
// ---------------------------------------------------------------------------

describe("PDF extractor — text-layer", () => {
  it("returns native text without OCR for text-layer PDF", async () => {
    const { extract } = await import("../lib/extractors/pdf");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "text-layer.pdf"));
    const result = await extract(buf);

    expect(result.text).toContain("GDA Text Layer PDF Test Document");
    expect(result.text).toContain("proper text layer");
    expect(result.metadata.extraction_method).toBe("native");
    // OCR should NOT have been invoked
    expect(result.metadata.ocr_engine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. PDF extractor — scanned PDF with OCR fallback
// ---------------------------------------------------------------------------

describe.skipIf(!hasTesseract || !hasPdftoppm)("PDF extractor — scanned PDF OCR fallback", () => {
  it("triggers OCR when pdf-parse returns < 100 chars", async () => {
    const { extract } = await import("../lib/extractors/pdf");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "scanned.pdf"));
    const result = await extract(buf);

    expect(result.text).toContain("GDA OCR Test");
    expect(result.metadata.extraction_method).toBe("ocr");
    expect(result.metadata.ocr_engine).toBe("tesseract");
    expect(result.metadata.ocr_language).toBe("eng");
  });

  it("includes page separators in OCR output", async () => {
    const { extract } = await import("../lib/extractors/pdf");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "scanned.pdf"));
    const result = await extract(buf);

    expect(result.text).toContain("--- page 1 ---");
  });
});

// ---------------------------------------------------------------------------
// 4. PDF extractor — OCR_ENABLED=false
// ---------------------------------------------------------------------------

describe.skipIf(!hasTesseract || !hasPdftoppm)("PDF extractor — OCR disabled", () => {
  const origOcrEnabled = process.env.OCR_ENABLED;

  afterEach(() => {
    if (origOcrEnabled === undefined) {
      delete process.env.OCR_ENABLED;
    } else {
      process.env.OCR_ENABLED = origOcrEnabled;
    }
    vi.resetModules();
  });

  it("throws when OCR disabled and PDF has no text layer", async () => {
    process.env.OCR_ENABLED = "false";
    vi.resetModules();

    // Must re-import to pick up env change
    const pdf = await import("../lib/extractors/pdf");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "scanned.pdf"));

    await expect(pdf.extract(buf)).rejects.toThrow("PDF has no text layer, OCR disabled");
  });
});

// ---------------------------------------------------------------------------
// 5. MIME dispatch — image types route to image-ocr
// ---------------------------------------------------------------------------

describe("MIME dispatch — OCR image types", () => {
  it("registers all 5 image MIMEs in extractorMap", async () => {
    const { EXTRACTABLE_MIMES } = await import("../lib/extractors/index");
    const imageMimes = [
      "image/png",
      "image/jpeg",
      "image/tiff",
      "image/heic",
      "image/webp",
    ];
    for (const mime of imageMimes) {
      expect(EXTRACTABLE_MIMES.has(mime)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Storage allowlist — image MIMEs and extensions
// ---------------------------------------------------------------------------

describe("Storage — OCR image types", () => {
  it("allows all 5 OCR image MIME types", async () => {
    const { isAllowedMimeType } = await import("../lib/storage");
    const mimes = [
      "image/png",
      "image/jpeg",
      "image/tiff",
      "image/heic",
      "image/webp",
    ];
    for (const mime of mimes) {
      expect(isAllowedMimeType(mime)).toBe(true);
    }
  });

  it("resolves image extensions from octet-stream", async () => {
    const { resolveMimeType } = await import("../lib/storage");
    expect(resolveMimeType("application/octet-stream", "photo.png")).toBe("image/png");
    expect(resolveMimeType("application/octet-stream", "photo.jpg")).toBe("image/jpeg");
    expect(resolveMimeType("application/octet-stream", "scan.tiff")).toBe("image/tiff");
    expect(resolveMimeType("application/octet-stream", "photo.heic")).toBe("image/heic");
    expect(resolveMimeType("application/octet-stream", "photo.webp")).toBe("image/webp");
  });
});

// ---------------------------------------------------------------------------
// 7. Gateway — extraction_method honored from extractor metadata
// ---------------------------------------------------------------------------

describe("Gateway — extraction_method from metadata", () => {
  it("ingest result reflects extractor-provided extraction_method", async () => {
    // Verify the ingest.ts code properly reads metadata.extraction_method
    const ingestSrc = fs.readFileSync(
      path.resolve(__dirname, "../lib/ingest.ts"),
      "utf-8",
    );
    expect(ingestSrc).toContain("result.metadata.extraction_method");
    expect(ingestSrc).toContain("extractionMethod = result.metadata.extraction_method");
  });
});

// ---------------------------------------------------------------------------
// 8. Dockerfile — tesseract and poppler-utils present
// ---------------------------------------------------------------------------

describe("Dockerfile — OCR dependencies", () => {
  it("includes tesseract-ocr and poppler-utils in production image", () => {
    const dockerfile = fs.readFileSync(
      path.resolve(__dirname, "../../Dockerfile"),
      "utf-8",
    );
    expect(dockerfile).toContain("tesseract-ocr");
    expect(dockerfile).toContain("poppler-utils");
  });
});

// ---------------------------------------------------------------------------
// 9. Temp dir cleanup — OCR
// ---------------------------------------------------------------------------

describe.skipIf(!hasTesseract)("OCR temp dir cleanup", () => {
  it("cleans up temp files after successful OCR", async () => {
    const os = await import("os");
    const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("gda-ocr-")).length;

    const { extract } = await import("../lib/extractors/image-ocr");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "scanned-page.png"));
    await extract(buf);

    const after = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("gda-ocr-")).length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("cleans up temp files after failed OCR", async () => {
    const os = await import("os");
    const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("gda-ocr-")).length;

    const { extract } = await import("../lib/extractors/image-ocr");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "noise.png"));
    try {
      await extract(buf);
    } catch {
      // expected
    }

    const after = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("gda-ocr-")).length;
    expect(after).toBeLessThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 10. PDF OCR fallback — temp dir cleanup
// ---------------------------------------------------------------------------

describe.skipIf(!hasTesseract || !hasPdftoppm)("PDF OCR temp dir cleanup", () => {
  it("cleans up temp dir after scanned PDF OCR", async () => {
    const os = await import("os");
    const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("gda-pdf-ocr-")).length;

    const { extract } = await import("../lib/extractors/pdf");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "scanned.pdf"));
    await extract(buf);

    const after = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("gda-pdf-ocr-")).length;
    expect(after).toBeLessThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 11. No new npm dependencies needed (uses child_process)
// ---------------------------------------------------------------------------

describe("OCR implementation — no new npm deps", () => {
  it("image-ocr.ts does not import any external npm packages", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../lib/extractors/image-ocr.ts"),
      "utf-8",
    );
    // Should only use built-in node modules + internal logger/types
    expect(src).not.toContain("node-tesseract-ocr");
    expect(src).not.toContain("pdf-to-png-converter");
    expect(src).toContain("child_process");
  });
});

// ---------------------------------------------------------------------------
// 12. Extract 7z pre-extraction check (Devin Review #348 fix)
// ---------------------------------------------------------------------------

describe("Archive extractor — 7z pre-extraction check", () => {
  it("archive.ts uses 7z l -slt before extraction", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../lib/extractors/archive.ts"),
      "utf-8",
    );
    expect(src).toContain('["l", "-slt"');
    expect(src).toContain("totalDeclaredSize");
    expect(src).toContain("totalPackedSize");
  });
});
