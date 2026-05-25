import { log } from "./logger";

/**
 * Extract plain text from a file buffer based on its MIME type.
 * Supports: PDF, DOCX, DOC, XLSX, XLS, PPTX, TXT, CSV, Markdown.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/csv") {
    return buffer.toString("utf-8");
  }

  if (mimeType === "application/pdf") {
    return extractPdf(buffer);
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(buffer);
  }

  if (mimeType === "application/msword") {
    return extractOffice(buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return await extractXlsx(buffer);
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return extractOffice(buffer);
  }

  return "";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfMod = require("pdf-parse") as {
      PDFParse: new (data: Uint8Array) => { getText: () => Promise<{ text: string }> };
    };
    const parser = new pdfMod.PDFParse(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    const result = await parser.getText();
    return result.text;
  } catch (err) {
    log.error("pdf_parse_error", { error: String(err) });
    return "";
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    log.error("docx_parse_error", { error: String(err) });
    return "";
  }
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require("exceljs") as typeof import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const lines: string[] = [];

    workbook.eachSheet((sheet) => {
      lines.push(`--- Sheet: ${sheet.name} ---`);
      sheet.eachRow((row) => {
        const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
        const text = vals.map((v) => (v == null ? "" : typeof v === "object" ? ("text" in v ? String(v.text) : "result" in v ? String(v.result) : "") : String(v))).filter(Boolean).join(" | ");
        if (text.trim()) lines.push(text);
      });
    });

    return lines.join("\n");
  } catch (err) {
    log.error("xlsx_parse_error", { error: String(err) });
    return "";
  }
}

async function extractOffice(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseOfficeAsync } = require("officeparser") as {
      parseOfficeAsync: (buf: Buffer) => Promise<string>;
    };
    const text = await parseOfficeAsync(buffer);
    return text;
  } catch (err) {
    log.error("office_parse_error", { error: String(err) });
    return "";
  }
}

/** MIME types supported for text extraction */
export const EXTRACTABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
]);
