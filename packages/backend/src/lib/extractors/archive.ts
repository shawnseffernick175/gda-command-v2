import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../logger";
import type { ExtractResult } from "./types";

// ---------------------------------------------------------------------------
// Limits — all enforced fail-closed (stop entirely, no partial salvage)
// ---------------------------------------------------------------------------

const MAX_FILES = 500;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024; // 1 GB total
const MAX_MEMBER_SIZE = 200 * 1024 * 1024; // 200 MB per member
const MAX_COMPRESSION_RATIO = 100; // compressed:uncompressed

interface ArchiveEntry {
  name: string;
  buffer: Buffer;
}

class ArchivePolicyError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "ArchivePolicyError";
  }
}

// ---------------------------------------------------------------------------
// Path traversal guard
// ---------------------------------------------------------------------------

function isPathSafe(memberPath: string): boolean {
  if (path.isAbsolute(memberPath)) return false;
  const normalized = path.normalize(memberPath);
  if (normalized.startsWith("..") || normalized.includes(`${path.sep}..`)) return false;
  if (memberPath.includes("..")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// ZIP extraction via node-stream-zip
// ---------------------------------------------------------------------------

async function extractZip(buffer: Buffer): Promise<ArchiveEntry[]> {
  const StreamZip = await import("node-stream-zip");
  const AsyncZip = StreamZip.async;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gda-zip-"));
  const tmpFile = path.join(tmpDir, "archive.zip");
  fs.writeFileSync(tmpFile, buffer);

  try {
    const zip = new AsyncZip({ file: tmpFile });
    const entries: ArchiveEntry[] = [];
    let totalBytes = 0;

    const zipEntries = await zip.entries();

    // Check for encryption (any encrypted entry → fail)
    for (const entry of Object.values(zipEntries)) {
      if (entry.encrypted) {
        await zip.close();
        throw new ArchivePolicyError("archive is encrypted");
      }
    }

    // Check for path traversal (any traversal → fail, 0 files extracted)
    for (const entry of Object.values(zipEntries)) {
      if (entry.isDirectory) continue;
      if (!isPathSafe(entry.name)) {
        await zip.close();
        throw new ArchivePolicyError("path traversal detected in archive member");
      }
    }

    for (const entry of Object.values(zipEntries)) {
      if (entry.isDirectory) continue;
      if (entry.name.startsWith("__MACOSX/") || entry.name.startsWith(".")) continue;

      // Fail-closed: file count limit
      if (entries.length >= MAX_FILES) {
        await zip.close();
        throw new ArchivePolicyError("archive file count limit exceeded");
      }

      // Per-member size limit
      if (entry.size > MAX_MEMBER_SIZE) {
        await zip.close();
        throw new ArchivePolicyError("archive member exceeds 200MB size limit");
      }

      // Per-member compression ratio guard
      if (entry.compressedSize > 0 && entry.size / entry.compressedSize > MAX_COMPRESSION_RATIO) {
        await zip.close();
        throw new ArchivePolicyError("archive member compression ratio exceeds 100x (zip bomb suspected)");
      }

      // Fail-closed: total extracted size limit
      if (totalBytes + entry.size > MAX_EXTRACTED_BYTES) {
        await zip.close();
        throw new ArchivePolicyError("archive extracted size limit exceeded");
      }

      const data = await zip.entryData(entry.name);
      entries.push({ name: entry.name, buffer: Buffer.from(data) });
      totalBytes += data.length;
    }

    await zip.close();
    return entries;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// TAR / TAR.GZ extraction via tar npm package
// ---------------------------------------------------------------------------

async function extractTar(buffer: Buffer): Promise<ArchiveEntry[]> {
  const tar = await import("tar");
  const { Readable } = await import("stream");
  const zlib = await import("zlib");

  const entries: ArchiveEntry[] = [];
  let totalBytes = 0;
  let policyError: ArchivePolicyError | null = null;

  const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;

  return new Promise<ArchiveEntry[]>((resolve, reject) => {
    const source = isGzip
      ? Readable.from(buffer).pipe(zlib.createGunzip())
      : Readable.from(buffer);

    const parser = new tar.Parser({
      onReadEntry: (entry) => {
        // Skip symlinks, links, directories — only process regular files
        if (entry.type !== "File") {
          entry.resume();
          return;
        }

        if (policyError) {
          entry.resume();
          return;
        }

        // Path traversal check
        if (!isPathSafe(entry.path)) {
          policyError = new ArchivePolicyError("path traversal detected in archive member");
          entry.resume();
          return;
        }

        if (entry.path.startsWith("__MACOSX/") || entry.path.startsWith(".")) {
          entry.resume();
          return;
        }

        // Fail-closed: file count limit
        if (entries.length >= MAX_FILES) {
          policyError = new ArchivePolicyError("archive file count limit exceeded");
          entry.resume();
          return;
        }

        const chunks: Buffer[] = [];
        let entryBytes = 0;

        entry.on("data", (chunk: Buffer) => {
          if (policyError) return;
          entryBytes += chunk.length;

          // Per-member size limit
          if (entryBytes > MAX_MEMBER_SIZE) {
            policyError = new ArchivePolicyError("archive member exceeds 200MB size limit");
            entry.resume();
            return;
          }

          // Fail-closed: total extracted size limit
          if (totalBytes + entryBytes > MAX_EXTRACTED_BYTES) {
            policyError = new ArchivePolicyError("archive extracted size limit exceeded");
            entry.resume();
            return;
          }

          chunks.push(chunk);
        });

        entry.on("end", () => {
          if (!policyError && chunks.length > 0) {
            const data = Buffer.concat(chunks);
            entries.push({ name: entry.path, buffer: data });
            totalBytes += data.length;
          }
        });
      },
    });

    source.pipe(parser);
    parser.on("end", () => {
      if (policyError) {
        reject(policyError);
      } else {
        resolve(entries);
      }
    });
    parser.on("error", (err) => reject(err));
    source.on("error", (err: Error) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// 7Z extraction via p7zip CLI
// ---------------------------------------------------------------------------

async function extract7z(buffer: Buffer): Promise<ArchiveEntry[]> {
  const { promisify } = await import("util");
  const { execFile } = await import("child_process");
  const execFileAsync = promisify(execFile);

  try {
    await execFileAsync("7z", ["--help"]);
  } catch {
    throw new Error("7z binary not available — install p7zip to support .7z archives");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gda-7z-"));
  const tmpFile = path.join(tmpDir, "archive.7z");
  const extractDir = path.join(tmpDir, "extracted");
  fs.mkdirSync(extractDir, { recursive: true });
  fs.writeFileSync(tmpFile, buffer);

  try {
    // Check for encryption: 7z l -slt lists headers; encrypted archives
    // fail to extract with "Wrong password" or require -p flag
    try {
      await execFileAsync("7z", ["t", tmpFile, "-p-"], { timeout: 30_000 });
    } catch (testErr) {
      const msg = (testErr as Error).message || "";
      if (msg.includes("Wrong password") || msg.includes("encrypted") || msg.includes("password")) {
        throw new ArchivePolicyError("archive is encrypted");
      }
      // Other test failures fall through to actual extraction
    }

    await execFileAsync("7z", ["x", tmpFile, `-o${extractDir}`, "-y"], {
      timeout: 120_000,
    });

    const entries: ArchiveEntry[] = [];
    let totalBytes = 0;

    function walkDir(dir: string, prefix: string): void {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relPath = prefix ? `${prefix}/${item}` : item;
        const stat = fs.lstatSync(fullPath);

        // Skip symlinks explicitly
        if (stat.isSymbolicLink()) continue;

        // Path traversal check
        if (!isPathSafe(relPath)) {
          throw new ArchivePolicyError("path traversal detected in archive member");
        }

        if (stat.isDirectory()) {
          walkDir(fullPath, relPath);
        } else {
          // Fail-closed: file count
          if (entries.length >= MAX_FILES) {
            throw new ArchivePolicyError("archive file count limit exceeded");
          }

          // Per-member size limit
          if (stat.size > MAX_MEMBER_SIZE) {
            throw new ArchivePolicyError("archive member exceeds 200MB size limit");
          }

          // Fail-closed: total size
          if (totalBytes + stat.size > MAX_EXTRACTED_BYTES) {
            throw new ArchivePolicyError("archive extracted size limit exceeded");
          }

          entries.push({ name: relPath, buffer: fs.readFileSync(fullPath) });
          totalBytes += stat.size;
        }
      }
    }

    walkDir(extractDir, "");
    return entries;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Detect archive format from buffer
// ---------------------------------------------------------------------------

function detectArchiveFormat(buffer: Buffer): "zip" | "tar" | "gzip" | "7z" | null {
  if (buffer.length < 4) return null;

  // ZIP: PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return "zip";
  }

  // GZIP: \x1f\x8b
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return "gzip";
  }

  // 7Z: 7z\xbc\xaf\x27\x1c
  if (
    buffer[0] === 0x37 &&
    buffer[1] === 0x7a &&
    buffer[2] === 0xbc &&
    buffer[3] === 0xaf &&
    buffer.length > 5 &&
    buffer[4] === 0x27 &&
    buffer[5] === 0x1c
  ) {
    return "7z";
  }

  // TAR: ustar at offset 257
  if (buffer.length > 262) {
    const ustar = buffer.slice(257, 262).toString("ascii");
    if (ustar === "ustar") return "tar";
  }

  return null;
}

// ---------------------------------------------------------------------------
// MIME extension guesser for archive members
// ---------------------------------------------------------------------------

function guessMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    xml: "application/xml",
    yaml: "text/yaml",
    yml: "text/yaml",
    eml: "message/rfc822",
    msg: "application/vnd.ms-outlook",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    "7z": "application/x-7z-compressed",
  };
  return map[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Public extract function
// ---------------------------------------------------------------------------

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  const format = detectArchiveFormat(buffer);
  if (!format) {
    throw new Error("unable to detect archive format from buffer");
  }

  let entries: ArchiveEntry[];
  let archiveType: string;

  switch (format) {
    case "zip":
      entries = await extractZip(buffer);
      archiveType = "zip";
      break;
    case "gzip":
    case "tar":
      entries = await extractTar(buffer);
      archiveType = format === "gzip" ? "tar.gz" : "tar";
      break;
    case "7z":
      entries = await extract7z(buffer);
      archiveType = "7z";
      break;
  }

  const fileList = entries.map((e) => e.name).join("\n");
  const text = `Archive contents (${entries.length} files):\n${fileList}`;

  const children: ExtractResult["children"] = entries.map((entry) => {
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeGuess = guessMimeFromExt(ext);
    return {
      name: entry.name.split("/").pop() ?? entry.name,
      buffer: entry.buffer,
      mimeType: mimeGuess,
    };
  });

  return {
    text,
    metadata: {
      extractionPath: `archive-${archiveType}`,
      archiveType,
      fileCount: entries.length,
    },
    children: children.length > 0 ? children : undefined,
  };
}
