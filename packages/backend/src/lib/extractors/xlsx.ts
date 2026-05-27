import { log } from "../logger";
import type { ExtractResult } from "./types";

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require("exceljs") as typeof import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const lines: string[] = [];
    let sheetCount = 0;

    workbook.eachSheet((sheet) => {
      sheetCount++;
      lines.push(`--- Sheet: ${sheet.name} ---`);
      sheet.eachRow((row) => {
        const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
        const text = vals
          .map((v) =>
            v == null
              ? ""
              : typeof v === "object"
                ? "text" in v
                  ? String(v.text)
                  : "result" in v
                    ? String(v.result)
                    : ""
                : String(v),
          )
          .filter(Boolean)
          .join(" | ");
        if (text.trim()) lines.push(text);
      });
    });

    return { text: lines.join("\n"), metadata: { sheetCount } };
  } catch (err) {
    log.error("xlsx_extract_error", { error: String(err) });
    return { text: "", metadata: { extractError: String(err) } };
  }
}
