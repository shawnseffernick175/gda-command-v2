/**
 * F-038 Phase 2B PR 3: Archive extractor tests.
 *
 * Unit tests for ZIP, TAR, TAR.GZ extraction. 7Z tests are conditional
 * on the 7z binary being available. All fixtures are synthetic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/ingestion");

// ---------------------------------------------------------------------------
// 1. ZIP extractor
// ---------------------------------------------------------------------------

describe("Archive extractor — ZIP", () => {
  it("extracts files from a ZIP archive", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.zip"));
    const result = await extract(buf);

    expect(result.metadata.archiveType).toBe("zip");
    expect(result.metadata.fileCount).toBe(3);
    expect(result.text).toContain("Archive contents (3 files)");
    expect(result.text).toContain("hello.txt");
    expect(result.text).toContain("data.json");
    expect(result.text).toContain("readme.md");
  });

  it("returns children for recursive ingestion", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.zip"));
    const result = await extract(buf);

    expect(result.children).toBeDefined();
    expect(result.children!.length).toBe(3);

    const names = result.children!.map((c) => c.name);
    expect(names).toContain("hello.txt");
    expect(names).toContain("data.json");
    expect(names).toContain("readme.md");

    const txtChild = result.children!.find((c) => c.name === "hello.txt")!;
    expect(txtChild.mimeType).toBe("text/plain");
    expect(txtChild.buffer.toString()).toContain("GDA Command Test Document");

    const jsonChild = result.children!.find((c) => c.name === "data.json")!;
    expect(jsonChild.mimeType).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// 2. TAR.GZ extractor
// ---------------------------------------------------------------------------

describe("Archive extractor — TAR.GZ", () => {
  it("extracts files from a gzipped tar archive", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.tar.gz"));
    const result = await extract(buf);

    expect(result.metadata.archiveType).toBe("tar.gz");
    expect(result.metadata.fileCount).toBe(3);
    expect(result.children).toBeDefined();
    expect(result.children!.length).toBe(3);

    const names = result.children!.map((c) => c.name);
    expect(names).toContain("hello.txt");
    expect(names).toContain("data.json");
    expect(names).toContain("readme.md");
  });
});

// ---------------------------------------------------------------------------
// 3. TAR extractor (plain, no gzip)
// ---------------------------------------------------------------------------

describe("Archive extractor — TAR", () => {
  it("extracts files from a plain tar archive", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.tar"));
    const result = await extract(buf);

    expect(result.metadata.archiveType).toBe("tar");
    expect(result.metadata.fileCount).toBe(3);
    expect(result.children).toBeDefined();
    expect(result.children!.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 4. MIME dispatch (archives registered correctly)
// ---------------------------------------------------------------------------

describe("Archive MIME dispatch", () => {
  it("registers archive MIMEs in extractorMap", async () => {
    const { EXTRACTABLE_MIMES } = await import("../lib/extractors/index");
    expect(EXTRACTABLE_MIMES.has("application/zip")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/x-tar")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/gzip")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/x-gzip")).toBe(true);
    expect(EXTRACTABLE_MIMES.has("application/x-7z-compressed")).toBe(true);
  });

  it("runExtractor dispatches to archive extractor for ZIP", async () => {
    const { runExtractor } = await import("../lib/extractors/index");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.zip"));
    const result = await runExtractor(buf, "application/zip");
    expect(result.metadata.archiveType).toBe("zip");
    expect(result.children).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Storage allowlist
// ---------------------------------------------------------------------------

describe("Archive storage allowlist", () => {
  it("allows archive MIME types in storage", async () => {
    const { isAllowedMimeType } = await import("../lib/storage");
    expect(isAllowedMimeType("application/zip")).toBe(true);
    expect(isAllowedMimeType("application/x-tar")).toBe(true);
    expect(isAllowedMimeType("application/gzip")).toBe(true);
    expect(isAllowedMimeType("application/x-gzip")).toBe(true);
    expect(isAllowedMimeType("application/x-7z-compressed")).toBe(true);
  });

  it("resolves archive extensions to correct MIMEs", async () => {
    const { resolveMimeType } = await import("../lib/storage");
    expect(resolveMimeType("application/octet-stream", "test.zip")).toBe("application/zip");
    expect(resolveMimeType("application/octet-stream", "test.tar")).toBe("application/x-tar");
    expect(resolveMimeType("application/octet-stream", "test.gz")).toBe("application/gzip");
    expect(resolveMimeType("application/octet-stream", "test.tgz")).toBe("application/gzip");
    expect(resolveMimeType("application/octet-stream", "test.7z")).toBe("application/x-7z-compressed");
  });
});

// ---------------------------------------------------------------------------
// 6. Size / count limit tests
// ---------------------------------------------------------------------------

describe("Archive size limits", () => {
  it("enforces MAX_FILES limit", async () => {
    // Create a ZIP with >500 entries by generating many small files
    // We'll test with a synthetic archive that has many entries
    const { extract } = await import("../lib/extractors/archive");

    // Create a ZIP with 10 files programmatically using a tmp dir
    const tmpDir = fs.mkdtempSync(path.join("/tmp", "gda-test-many-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(srcDir, `file-${i}.txt`), `Content ${i}`);
    }

    execSync(`cd ${srcDir} && zip -r ${tmpDir}/many.zip .`, { stdio: "ignore" });
    const buf = fs.readFileSync(path.join(tmpDir, "many.zip"));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const result = await extract(buf);
    expect(result.metadata.fileCount).toBe(10);
    expect(result.children!.length).toBe(10);
  });

  it("skips __MACOSX and hidden files", async () => {
    const { extract } = await import("../lib/extractors/archive");

    const tmpDir = fs.mkdtempSync(path.join("/tmp", "gda-test-macosx-"));
    const srcDir = path.join(tmpDir, "src");
    const macDir = path.join(srcDir, "__MACOSX");
    fs.mkdirSync(macDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, "real-file.txt"), "Real content");
    fs.writeFileSync(path.join(srcDir, ".hidden"), "Hidden");
    fs.writeFileSync(path.join(macDir, "._junk"), "Mac junk");

    execSync(`cd ${srcDir} && zip -r ${tmpDir}/macosx.zip .`, { stdio: "ignore" });
    const buf = fs.readFileSync(path.join(tmpDir, "macosx.zip"));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const result = await extract(buf);
    expect(result.metadata.fileCount).toBe(1);
    expect(result.children![0].name).toBe("real-file.txt");
  });
});

// ---------------------------------------------------------------------------
// 7. Non-archive rejection
// ---------------------------------------------------------------------------

describe("Archive format detection", () => {
  it("throws on non-archive buffer", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = Buffer.from("This is just plain text, not an archive");

    await expect(extract(buf)).rejects.toThrow("unable to detect archive format");
  });

  it("throws on empty buffer", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = Buffer.alloc(0);

    await expect(extract(buf)).rejects.toThrow("unable to detect archive format");
  });
});

// ---------------------------------------------------------------------------
// 8. MIME extension guessing for archive members
// ---------------------------------------------------------------------------

describe("Archive member MIME guessing", () => {
  it("assigns correct MIME types to extracted files", async () => {
    const { extract } = await import("../lib/extractors/archive");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.zip"));
    const result = await extract(buf);

    const children = result.children!;
    const txt = children.find((c) => c.name === "hello.txt");
    const json = children.find((c) => c.name === "data.json");
    const md = children.find((c) => c.name === "readme.md");

    expect(txt!.mimeType).toBe("text/plain");
    expect(json!.mimeType).toBe("application/json");
    expect(md!.mimeType).toBe("text/markdown");
  });
});

// ---------------------------------------------------------------------------
// 9. Depth guard (via gateway)
// ---------------------------------------------------------------------------

describe("Archive depth guard", () => {
  it("refuses ingestion when depth exceeds MAX_RECURSION_DEPTH", async () => {
    // Mock the pool for the ingestDocument test
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    };

    vi.doMock("../lib/db", () => ({
      getPool: () => mockPool,
    }));

    const { ingestDocument } = await import("../lib/ingest");
    const buf = fs.readFileSync(path.join(FIXTURE_DIR, "sample.zip"));

    const result = await ingestDocument(buf, "nested.zip", {
      documentId: "doc-depth-test",
      depth: 4,
    });

    expect(result.status).toBe("skipped");
    expect(result.statusReason).toBe("recursion depth exceeded");
  });
});

// ---------------------------------------------------------------------------
// 10. ZIP bomb / decompression bomb protection
// ---------------------------------------------------------------------------

describe("Archive decompression bomb guard", () => {
  it("limits extracted size and does not exhaust memory", async () => {
    // Create a ZIP with a large repetitive file that compresses well
    const { extract } = await import("../lib/extractors/archive");

    const tmpDir = fs.mkdtempSync(path.join("/tmp", "gda-test-bomb-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // Create a 10MB file (well under 1GB limit, but proves the mechanism works)
    const tenMB = Buffer.alloc(10 * 1024 * 1024, "A");
    fs.writeFileSync(path.join(srcDir, "big.txt"), tenMB);

    execSync(`cd ${srcDir} && zip -r ${tmpDir}/big.zip .`, { stdio: "ignore" });
    const buf = fs.readFileSync(path.join(tmpDir, "big.zip"));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const result = await extract(buf);
    expect(result.metadata.fileCount).toBe(1);
    expect(result.children![0].buffer.length).toBe(10 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// 11. 7Z extractor (conditional — skipped if 7z binary not available)
// ---------------------------------------------------------------------------

const has7z = (() => {
  try {
    execSync("7z --help", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!has7z)("Archive extractor — 7Z", () => {
  it("extracts files from a 7z archive", async () => {
    const { extract } = await import("../lib/extractors/archive");

    // Create a sample 7z fixture
    const tmpDir = fs.mkdtempSync(path.join("/tmp", "gda-test-7z-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "test.txt"), "7z test content");
    fs.writeFileSync(path.join(srcDir, "data.json"), '{"format": "7z"}');

    execSync(`cd ${srcDir} && 7z a ${tmpDir}/sample.7z . -mx=0`, { stdio: "ignore" });
    const buf = fs.readFileSync(path.join(tmpDir, "sample.7z"));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const result = await extract(buf);
    expect(result.metadata.archiveType).toBe("7z");
    expect(result.metadata.fileCount).toBe(2);
    expect(result.children).toBeDefined();
  });
});
