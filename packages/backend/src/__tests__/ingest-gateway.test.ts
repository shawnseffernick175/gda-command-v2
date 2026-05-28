/**
 * F-038 Phase 2B PR 1: Universal Document Ingestion Gateway tests.
 *
 * Tests the ingestDocument() gateway, modular extractors, magic-byte detection,
 * and status transitions. All tests use synthetic fixtures (no real data).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// 1. Extractor module tests — isExtractable, MIME coverage
// ---------------------------------------------------------------------------

import { isExtractable, EXTRACTABLE_MIMES, PLAIN_TEXT_MIMES, runExtractor } from "../lib/extractors";

describe("Extractors: isExtractable", () => {
  it("returns true for PDF", () => {
    expect(isExtractable("application/pdf")).toBe(true);
  });

  it("returns true for DOCX", () => {
    expect(isExtractable("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });

  it("returns true for XLSX", () => {
    expect(isExtractable("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
  });

  it("returns true for XLS", () => {
    expect(isExtractable("application/vnd.ms-excel")).toBe(true);
  });

  it("returns true for PPTX", () => {
    expect(isExtractable("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true);
  });

  it("returns true for plain text formats", () => {
    expect(isExtractable("text/plain")).toBe(true);
    expect(isExtractable("text/markdown")).toBe(true);
    expect(isExtractable("text/csv")).toBe(true);
  });

  it("returns true for JSON (via json-yaml extractor)", () => {
    expect(isExtractable("application/json")).toBe(true);
  });

  it("returns true for OCR image formats (PR 4)", () => {
    expect(isExtractable("image/png")).toBe(true);
    expect(isExtractable("image/jpeg")).toBe(true);
    expect(isExtractable("image/tiff")).toBe(true);
  });

  it("returns false for unsupported formats", () => {
    expect(isExtractable("video/mp4")).toBe(false);
    expect(isExtractable("application/octet-stream")).toBe(false);
  });

  it("EXTRACTABLE_MIMES covers all binary extractors", () => {
    expect(EXTRACTABLE_MIMES.has("application/pdf")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/msword")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/vnd.ms-excel")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true);
  });

  it("PLAIN_TEXT_MIMES covers text types", () => {
    expect(PLAIN_TEXT_MIMES.has("text/plain")).toBe(true);
    expect(PLAIN_TEXT_MIMES.has("text/markdown")).toBe(true);
    expect(PLAIN_TEXT_MIMES.has("text/csv")).toBe(true);
  });

  it("application/json is in EXTRACTABLE_MIMES (json-yaml extractor)", () => {
    expect(EXTRACTABLE_MIMES.has("application/json")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. runExtractor — plain text path
// ---------------------------------------------------------------------------

describe("Extractors: runExtractor (plain text)", () => {
  it("reads text/plain buffer as UTF-8", async () => {
    const buf = Buffer.from("Hello, World!");
    const result = await runExtractor(buf, "text/plain");
    expect(result.text).toBe("Hello, World!");
    expect(result.metadata.extractionPath).toBe("plain");
  });

  it("reads text/csv buffer as UTF-8", async () => {
    const buf = Buffer.from("name,age\nAlice,30\nBob,25");
    const result = await runExtractor(buf, "text/csv");
    expect(result.text).toContain("Alice");
    expect(result.metadata.extractionPath).toBe("plain");
  });

  it("flattens application/json via json-yaml extractor", async () => {
    const buf = Buffer.from(JSON.stringify({ key: "value" }));
    const result = await runExtractor(buf, "application/json");
    expect(result.text).toContain("key: value");
    expect(result.metadata.extractionPath).toBe("json-yaml-json");
  });

  it("returns empty for unsupported MIME", async () => {
    const buf = Buffer.from("binary data");
    const result = await runExtractor(buf, "video/mp4");
    expect(result.text).toBe("");
    expect(result.metadata.extractionPath).toBe("unsupported");
  });
});

// ---------------------------------------------------------------------------
// 3. Ingestion gateway — status transitions (mocked DB + extractors)
// ---------------------------------------------------------------------------

// Mock the DB pool, embeddings, and file-type for gateway tests.
vi.mock("../lib/db", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
}));

vi.mock("../lib/embeddings", () => ({
  embedDocument: vi.fn().mockResolvedValue({
    documentId: "test-doc",
    chunksCreated: 3,
    tokensUsed: 75,
    durationMs: 50,
  }),
  isEmbeddingAvailable: vi.fn().mockReturnValue(true),
}));

// We need to mock file-type to control magic-byte detection
vi.mock("file-type", () => ({
  fromBuffer: vi.fn().mockResolvedValue(undefined),
}));

import { ingestDocument } from "../lib/ingest";
import { embedDocument } from "../lib/embeddings";

describe("Ingestion Gateway: ingestDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("plain text file → status=indexed", async () => {
    const buf = Buffer.from("This is a test document with enough content to embed.");
    const result = await ingestDocument(buf, "report.txt", {
      documentId: "doc-test-1",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("text/plain");
    expect(result.chunksCreated).toBe(3);
    expect(result.statusReason).toBeNull();
    expect(embedDocument).toHaveBeenCalledOnce();
  });

  it("CSV file → status=indexed", async () => {
    const buf = Buffer.from("col1,col2\nval1,val2\nval3,val4");
    const result = await ingestDocument(buf, "data.csv", {
      documentId: "doc-test-2",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("text/csv");
  });

  it("unsupported format → status=skipped with reason", async () => {
    // file-type returns undefined, extension doesn't map to anything known
    const buf = Buffer.from("binary garbage");
    const result = await ingestDocument(buf, "video.mp4", {
      documentId: "doc-test-3",
    });

    expect(result.status).toBe("skipped");
    expect(result.statusReason).toContain("unsupported format");
  });

  it("empty text extraction → status=skipped", async () => {
    const buf = Buffer.from("   \n\t  \n  ");
    const result = await ingestDocument(buf, "whitespace.txt", {
      documentId: "doc-test-4",
    });

    expect(result.status).toBe("skipped");
    expect(result.statusReason).toBe("extraction returned empty text");
    expect(embedDocument).not.toHaveBeenCalled();
  });

  it("embedDocument failure → status=failed with reason", async () => {
    vi.mocked(embedDocument).mockRejectedValueOnce(new Error("OpenAI rate limit"));
    const buf = Buffer.from("Real content that should be embedded but fails.");
    const result = await ingestDocument(buf, "failing.txt", {
      documentId: "doc-test-5",
    });

    expect(result.status).toBe("failed");
    expect(result.statusReason).toBe("OpenAI rate limit");
  });

  it("JSON file → status=indexed", async () => {
    const buf = Buffer.from(JSON.stringify({ proposal: "Test RFP response", value: 1000000 }));
    const result = await ingestDocument(buf, "data.json", {
      documentId: "doc-test-6",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("application/json");
  });

  it("Markdown file → status=indexed", async () => {
    const buf = Buffer.from("# Heading\n\nThis is markdown content with **bold** text.");
    const result = await ingestDocument(buf, "readme.md", {
      documentId: "doc-test-7",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("text/markdown");
  });
});

// ---------------------------------------------------------------------------
// 4. Migration column validation (schema contract)
// ---------------------------------------------------------------------------

describe("Migration 124: schema contract", () => {
  it("migration file exists and contains required columns", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.resolve(
      __dirname,
      "../db/migrations/124_universal_ingestion.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("parent_document_id");
    expect(content).toContain("extraction_method");
    expect(content).toContain("status_reason");
    expect(content).toContain("idx_knowledge_documents_parent");
  });
});

// ---------------------------------------------------------------------------
// 5. Storage MAX_FILE_SIZE raised
// ---------------------------------------------------------------------------

describe("Storage: MAX_FILE_SIZE", () => {
  it("allows up to 200MB", async () => {
    const { getMaxFileSize } = await import("../lib/storage");
    expect(getMaxFileSize()).toBe(200 * 1024 * 1024);
  });
});
