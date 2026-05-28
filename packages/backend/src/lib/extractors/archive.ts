import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../logger";
import type { ExtractResult } from "./types";

const MAX_FILES = 500;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024; // 1 GB

interface ArchiveEntry {
  name: string;
  buffer: Buffer;
}

// ---------------------------------------------------------------------------
// ZIP extraction via node-stream-zip
// ---------------------------------------------------------------------------

async function extractZip(buffer: Buffer): Promise<ArchiveEntry[]> {
  const StreamZip = await import("node-stream-zip");
  const AsyncZip = StreamZip.async;

  // Write buffer to temp file (node-stream-zip requires file path)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gda-zip-"));
  const tmpFile = path.join(tmpDir, "archive.zip");
  fs.writeFileSync(tmpFile, buffer);

  try {
    const zip = new AsyncZip({ file: tmpFile });
    const entries: ArchiveEntry[] = [];
    let totalBytes = 0;

    const zipEntries = await zip.entries();
    for (const entry of Object.values(zipEntries)) {
      if (entry.isDirectory) continue;
      if (entry.name.startsWith("__MACOSX/") || entry.name.startsWith(".")) continue;

      if (entries.length >= MAX_FILES) {
        log.warn("archive_max_files", { limit: MAX_FILES, archive: "zip" });
        break;
      }

      if (totalBytes + entry.size > MAX_EXTRACTED_BYTES) {
        log.warn("archive_max_bytes", { limit: MAX_EXTRACTED_BYTES, archive: "zip" });
        break;
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
  let limitReached = false;

  const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;

  return new Promise<ArchiveEntry[]>((resolve, reject) => {
    const source = isGzip
      ? Readable.from(buffer).pipe(zlib.createGunzip())
      : Readable.from(buffer);

    const parser = new tar.Parser({
      onReadEntry: (entry) => {
        if (limitReached || entry.type !== "File") {
          entry.resume();
          return;
        }

        if (entry.path.startsWith("__MACOSX/") || entry.path.startsWith(".")) {
          entry.resume();
          return;
        }

        if (entries.length >= MAX_FILES) {
          log.warn("archive_max_files", { limit: MAX_FILES, archive: "tar" });
          limitReached = true;
          entry.resume();
          return;
        }

        const chunks: Buffer[] = [];
        let entryBytes = 0;

        entry.on("data", (chunk: Buffer) => {
          entryBytes += chunk.length;
          if (totalBytes + entryBytes > MAX_EXTRACTED_BYTES) {
            log.warn("archive_max_bytes", { limit: MAX_EXTRACTED_BYTES, archive: "tar" });
            limitReached = true;
            entry.resume();
            return;
          }
          chunks.push(chunk);
        });

        entry.on("end", () => {
          if (!limitReached && chunks.length > 0) {
            const data = Buffer.concat(chunks);
            entries.push({ name: entry.path, buffer: data });
            totalBytes += data.length;
          }
        });
      },
    });

    source.pipe(parser);
    parser.on("end", () => resolve(entries));
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
    await execFileAsync("7z", ["x", tmpFile, `-o${extractDir}`, "-y"], {
      timeout: 120_000,
    });

    const entries: ArchiveEntry[] = [];
    let totalBytes = 0;

    function walkDir(dir: string, prefix: string): void {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (entries.length >= MAX_FILES) break;
        const fullPath = path.join(dir, item);
        const relPath = prefix ? `${prefix}/${item}` : item;
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath, relPath);
        } else {
          if (totalBytes + stat.size > MAX_EXTRACTED_BYTES) {
            log.warn("archive_max_bytes", { limit: MAX_EXTRACTED_BYTES, archive: "7z" });
            return;
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
