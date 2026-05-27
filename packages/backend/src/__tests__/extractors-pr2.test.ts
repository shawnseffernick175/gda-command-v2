/**
 * F-038 Phase 2B PR 2: Email + HTML/XML + JSON/YAML extractor tests.
 *
 * Unit tests for each new extractor plus integration tests for the
 * gateway wiring and child document recursion. All fixtures are synthetic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/ingestion");

// ---------------------------------------------------------------------------
// 1. HTML extractor
// ---------------------------------------------------------------------------

describe("HTML extractor", () => {
  it("strips tags and preserves readable text", async () => {
    const { extract } = await import("../lib/extractors/html");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.html"));
    const result = await extract(buf);

    expect(result.text).toContain("Government Contract Analysis");
    expect(result.text).toContain("federal procurement processes");
    expect(result.text).toContain("Total contracts reviewed: 1,247");
    expect(result.text).not.toContain("console.log");
    expect(result.text).not.toContain("<script");
    expect(result.text).not.toContain("<p>");
    expect(result.metadata.extractionPath).toBe("html");
  });

  it("extracts title from head", async () => {
    const { extract } = await import("../lib/extractors/html");
    const buf = Buffer.from("<html><head><title>My Title</title></head><body>Content</body></html>");
    const result = await extract(buf);

    expect(result.metadata.title).toBe("My Title");
    expect(result.text).toContain("Content");
  });

  it("handles empty HTML", async () => {
    const { extract } = await import("../lib/extractors/html");
    const buf = Buffer.from("<html><body></body></html>");
    const result = await extract(buf);

    expect(result.text.trim()).toBe("");
  });

  it("decodes HTML entities", async () => {
    const { extract } = await import("../lib/extractors/html");
    const buf = Buffer.from("<p>5 &gt; 3 &amp; 2 &lt; 4</p>");
    const result = await extract(buf);

    expect(result.text).toContain("5 > 3 & 2 < 4");
  });
});

// ---------------------------------------------------------------------------
// 2. XML extractor (uses HTML extractor)
// ---------------------------------------------------------------------------

describe("XML extractor", () => {
  it("produces readable text from XML document", async () => {
    const { extract } = await import("../lib/extractors/html");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.xml"));
    const result = await extract(buf);

    expect(result.text).toContain("Federal Procurement Summary");
    expect(result.text).toContain("Acme Defense Corp");
    expect(result.text).toContain("Cybersecurity assessment services");
    // XML declaration is preserved as text by node-html-parser (not a tag)
    expect(result.text).not.toContain("<contract");
    expect(result.metadata.extractionPath).toBe("html");
  });
});

// ---------------------------------------------------------------------------
// 3. JSON/YAML extractor
// ---------------------------------------------------------------------------

describe("JSON/YAML extractor", () => {
  it("flattens nested JSON structures correctly", async () => {
    const { extract } = await import("../lib/extractors/json-yaml");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.json"));
    const result = await extract(buf);

    expect(result.text).toContain("report.title: Quarterly Procurement Analysis");
    expect(result.text).toContain("report.period: Q2 2026");
    expect(result.text).toContain("contracts[0].id: FA8721-26-C-0001");
    expect(result.text).toContain("contracts[0].vendor: Acme Defense Corp");
    expect(result.text).toContain("contracts[1].vendor: Global Tech Solutions");
    expect(result.text).toContain("summary.total_value: 4325000");
    expect(result.text).toContain("summary.compliance_rate: 98.3");
    expect(result.metadata.format).toBe("json");
  });

  it("flattens YAML structures correctly", async () => {
    const { extract } = await import("../lib/extractors/json-yaml");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.yaml"));
    const result = await extract(buf);

    expect(result.text).toContain("report.title: Quarterly Procurement Analysis");
    expect(result.text).toContain("contracts[0].id: FA8721-26-C-0001");
    expect(result.text).toContain("contracts[1].value: 1875000");
    expect(result.metadata.format).toBe("yaml");
  });

  it("handles simple JSON object", async () => {
    const { extract } = await import("../lib/extractors/json-yaml");
    const buf = Buffer.from(JSON.stringify({ name: "test", value: 42 }));
    const result = await extract(buf);

    expect(result.text).toContain("name: test");
    expect(result.text).toContain("value: 42");
  });

  it("handles arrays at root level", async () => {
    const { extract } = await import("../lib/extractors/json-yaml");
    const buf = Buffer.from(JSON.stringify(["alpha", "beta", "gamma"]));
    const result = await extract(buf);

    expect(result.text).toContain("[0]: alpha");
    expect(result.text).toContain("[1]: beta");
    expect(result.text).toContain("[2]: gamma");
  });

  it("handles null values", async () => {
    const { extract } = await import("../lib/extractors/json-yaml");
    const buf = Buffer.from(JSON.stringify({ key: null }));
    const result = await extract(buf);

    expect(result.text).toContain("key: null");
  });

  it("throws on invalid JSON/YAML", async () => {
    const { extract } = await import("../lib/extractors/json-yaml");
    const buf = Buffer.from("{invalid json &&& yaml:");
    await expect(extract(buf)).rejects.toThrow("Failed to parse as JSON or YAML");
  });
});

// ---------------------------------------------------------------------------
// 4. Email EML extractor
// ---------------------------------------------------------------------------

describe("Email EML extractor", () => {
  it("extracts headers + body + lists 2 children", async () => {
    const { extract } = await import("../lib/extractors/email");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.eml"));
    const result = await extract(buf);

    // Headers
    expect(result.text).toContain("From: sender@example.com");
    expect(result.text).toContain("To: recipient@example.com");
    expect(result.text).toContain("Subject: Test Document Submission");

    // Body
    expect(result.text).toContain("body of the test email");
    expect(result.text).toContain("multiple lines of text");

    // Children (2 attachments: notes.txt + report.pdf)
    expect(result.children).toBeDefined();
    expect(result.children!.length).toBe(2);

    const childNames = result.children!.map((c) => c.name);
    expect(childNames).toContain("notes.txt");
    expect(childNames).toContain("report.pdf");

    expect(result.metadata.extractionPath).toBe("email-eml");
    expect(result.metadata.attachmentCount).toBe(2);
  });

  it("handles EML with only HTML body (strips tags)", async () => {
    const { extract } = await import("../lib/extractors/email");
    const eml = [
      "From: test@example.com",
      "To: user@example.com",
      "Subject: HTML Only",
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      "<html><body><p>Hello <b>World</b></p></body></html>",
    ].join("\r\n");
    const buf = Buffer.from(eml);
    const result = await extract(buf);

    expect(result.text).toContain("Subject: HTML Only");
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("World");
    expect(result.text).not.toContain("<p>");
    expect(result.text).not.toContain("<b>");
  });

  it("handles EML with no attachments", async () => {
    const { extract } = await import("../lib/extractors/email");
    const eml = [
      "From: a@example.com",
      "To: b@example.com",
      "Subject: No Attachments",
      "Content-Type: text/plain",
      "",
      "Just a simple email body.",
    ].join("\r\n");
    const buf = Buffer.from(eml);
    const result = await extract(buf);

    expect(result.text).toContain("Subject: No Attachments");
    expect(result.text).toContain("Just a simple email body.");
    expect(result.children).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Extractor dispatch: new MIME types wired correctly
// ---------------------------------------------------------------------------

describe("Extractor dispatch: PR 2 MIME types", () => {
  it("isExtractable returns true for email MIMEs", async () => {
    const { isExtractable } = await import("../lib/extractors");
    expect(isExtractable("message/rfc822")).toBe(true);
    expect(isExtractable("application/vnd.ms-outlook")).toBe(true);
  });

  it("isExtractable returns true for HTML/XML MIMEs", async () => {
    const { isExtractable } = await import("../lib/extractors");
    expect(isExtractable("text/html")).toBe(true);
    expect(isExtractable("application/xhtml+xml")).toBe(true);
    expect(isExtractable("application/xml")).toBe(true);
    expect(isExtractable("text/xml")).toBe(true);
  });

  it("isExtractable returns true for YAML MIMEs", async () => {
    const { isExtractable } = await import("../lib/extractors");
    expect(isExtractable("text/yaml")).toBe(true);
    expect(isExtractable("application/yaml")).toBe(true);
    expect(isExtractable("application/x-yaml")).toBe(true);
  });

  it("EXTRACTABLE_MIMES includes all PR 2 types", async () => {
    const { EXTRACTABLE_MIMES } = await import("../lib/extractors");
    const pr2Mimes = [
      "message/rfc822",
      "application/vnd.ms-outlook",
      "text/html",
      "application/xhtml+xml",
      "application/xml",
      "text/xml",
      "text/yaml",
      "application/yaml",
      "application/x-yaml",
    ];
    for (const mime of pr2Mimes) {
      expect(EXTRACTABLE_MIMES.has(mime)).toBe(true);
    }
  });

  it("runExtractor routes HTML to html extractor", async () => {
    const { runExtractor } = await import("../lib/extractors");
    const buf = Buffer.from("<html><body><p>Test content</p></body></html>");
    const result = await runExtractor(buf, "text/html");
    expect(result.text).toContain("Test content");
    expect(result.metadata.extractionPath).toBe("html");
  });

  it("runExtractor routes YAML to json-yaml extractor", async () => {
    const { runExtractor } = await import("../lib/extractors");
    const buf = Buffer.from("name: test\nvalue: 42\n");
    const result = await runExtractor(buf, "text/yaml");
    expect(result.text).toContain("name: test");
    expect(result.text).toContain("value: 42");
  });
});

// ---------------------------------------------------------------------------
// 6. Storage: new MIME types allowed
// ---------------------------------------------------------------------------

describe("Storage: PR 2 MIME types allowed", () => {
  it("allows email MIMEs through multer", async () => {
    const { isAllowedMimeType } = await import("../lib/storage");
    expect(isAllowedMimeType("message/rfc822")).toBe(true);
    expect(isAllowedMimeType("application/vnd.ms-outlook")).toBe(true);
  });

  it("allows HTML/XML MIMEs", async () => {
    const { isAllowedMimeType } = await import("../lib/storage");
    expect(isAllowedMimeType("text/html")).toBe(true);
    expect(isAllowedMimeType("application/xhtml+xml")).toBe(true);
    expect(isAllowedMimeType("application/xml")).toBe(true);
    expect(isAllowedMimeType("text/xml")).toBe(true);
  });

  it("allows YAML MIMEs", async () => {
    const { isAllowedMimeType } = await import("../lib/storage");
    expect(isAllowedMimeType("text/yaml")).toBe(true);
    expect(isAllowedMimeType("application/yaml")).toBe(true);
    expect(isAllowedMimeType("application/x-yaml")).toBe(true);
  });

  it("resolves .eml and .msg extensions", async () => {
    const { resolveMimeType } = await import("../lib/storage");
    expect(resolveMimeType("application/octet-stream", "email.eml")).toBe("message/rfc822");
    expect(resolveMimeType("application/octet-stream", "outlook.msg")).toBe("application/vnd.ms-outlook");
  });

  it("resolves .html, .xml, .yaml extensions", async () => {
    const { resolveMimeType } = await import("../lib/storage");
    expect(resolveMimeType("application/octet-stream", "page.html")).toBe("text/html");
    expect(resolveMimeType("application/octet-stream", "data.xml")).toBe("application/xml");
    expect(resolveMimeType("application/octet-stream", "config.yaml")).toBe("text/yaml");
    expect(resolveMimeType("application/octet-stream", "config.yml")).toBe("text/yaml");
  });
});

// ---------------------------------------------------------------------------
// 7. Gateway integration: depth guard
// ---------------------------------------------------------------------------

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

vi.mock("file-type", () => ({
  fromBuffer: vi.fn().mockResolvedValue(undefined),
}));

import { ingestDocument } from "../lib/ingest";

describe("Ingestion Gateway: depth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips ingestion when depth exceeds MAX_RECURSION_DEPTH (3)", async () => {
    const buf = Buffer.from("Some content");
    const result = await ingestDocument(buf, "deep.txt", {
      documentId: "doc-depth-test",
      depth: 4,
    });

    expect(result.status).toBe("skipped");
    expect(result.statusReason).toBe("recursion depth exceeded");
  });

  it("allows ingestion at depth 3 (boundary)", async () => {
    const buf = Buffer.from("Some content at max depth");
    const result = await ingestDocument(buf, "boundary.txt", {
      documentId: "doc-depth-boundary",
      depth: 3,
    });

    expect(result.status).toBe("indexed");
  });

  it("allows ingestion at depth 0 (default)", async () => {
    const buf = Buffer.from("Normal content");
    const result = await ingestDocument(buf, "normal.txt", {
      documentId: "doc-depth-zero",
    });

    expect(result.status).toBe("indexed");
  });
});

// ---------------------------------------------------------------------------
// 8. Gateway integration: HTML upload → indexed
// ---------------------------------------------------------------------------

describe("Ingestion Gateway: HTML upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTML file → status=indexed", async () => {
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.html"));
    const result = await ingestDocument(buf, "page.html", {
      documentId: "doc-html-test",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("text/html");
    expect(result.chunksCreated).toBe(3);
  });

  it("YAML file → status=indexed", async () => {
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.yaml"));
    const result = await ingestDocument(buf, "config.yaml", {
      documentId: "doc-yaml-test",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("text/yaml");
  });

  it("XML file → status=indexed", async () => {
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.xml"));
    const result = await ingestDocument(buf, "data.xml", {
      documentId: "doc-xml-test",
    });

    expect(result.status).toBe("indexed");
    expect(result.detectedMime).toBe("application/xml");
  });
});

// ---------------------------------------------------------------------------
// 9. IngestOptions includes new fields
// ---------------------------------------------------------------------------

describe("IngestOptions: PR 2 additions", () => {
  it("accepts depth, collectionId, and tags", async () => {
    const buf = Buffer.from("Test content");
    const result = await ingestDocument(buf, "test.txt", {
      documentId: "doc-opts-test",
      depth: 1,
      collectionId: "col-test",
      tags: ["tag1", "tag2"],
    });

    expect(result.status).toBe("indexed");
  });
});
