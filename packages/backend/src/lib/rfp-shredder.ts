// ---------------------------------------------------------------------------
// RFP Shredder — regex-based compliance requirement extractor.
// TODO Sprint 4: replace regex parser with LLM-assisted requirement extraction via Agentic AI door (door 11).
// ---------------------------------------------------------------------------

import type { Pool } from "pg";

export interface ComplianceItem {
  id?: number;
  capture_id: number;
  section_number: string | null;
  requirement_text: string;
  owner_team: string | null;
  status: string;
  evidence_link: string | null;
}

const SECTION_PATTERN = /^(Section\s+[A-Z]|PWS|SOW|\d+\.\d*|[A-Z]\.)\s*/im;

const REQUIREMENT_KEYWORDS =
  /\b(shall|must|required|required to|contractor shall|offeror shall)\b/i;

function extractTextSections(rawText: string): { header: string; body: string }[] {
  const lines = rawText.split(/\n/);
  const sections: { header: string; body: string }[] = [];
  let currentHeader = "Unknown";
  let currentBody: string[] = [];

  for (const line of lines) {
    const match = line.match(SECTION_PATTERN);
    if (match) {
      if (currentBody.length > 0) {
        sections.push({ header: currentHeader, body: currentBody.join("\n") });
      }
      currentHeader = line.trim().slice(0, 80);
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentBody.length > 0) {
    sections.push({ header: currentHeader, body: currentBody.join("\n") });
  }

  return sections;
}

function extractRequirements(
  sections: { header: string; body: string }[],
): { section_number: string; requirement_text: string }[] {
  const results: { section_number: string; requirement_text: string }[] = [];

  for (const section of sections) {
    const sentences = section.body.split(/(?<=[.;])\s+/);
    for (const sentence of sentences) {
      if (REQUIREMENT_KEYWORDS.test(sentence)) {
        const text = sentence.trim().slice(0, 1000);
        if (text.length > 0) {
          results.push({
            section_number: section.header,
            requirement_text: text,
          });
        }
      }
    }
  }

  return results;
}

export async function extractRawTextFromBuffer(
  fileBuffer: Buffer,
  mimeType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
): Promise<string> {
  if (mimeType === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfMod = require("pdf-parse") as {
      PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
        getText: () => Promise<{ text: string }>;
        destroy: () => Promise<void>;
      };
    };
    const parser = new pdfMod.PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammothMod = require("mammoth") as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammothMod.extractRawText({ buffer: fileBuffer });
    return result.value;
  }
}

export type TextExtractor = (
  fileBuffer: Buffer,
  mimeType: string,
) => Promise<string>;

export async function shredRfp(
  fileBuffer: Buffer,
  mimeType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  captureId: number,
  pool: Pool,
  textExtractor?: TextExtractor,
): Promise<ComplianceItem[]> {
  const extractor = textExtractor ?? extractRawTextFromBuffer;
  const rawText = await extractor(fileBuffer, mimeType);

  const sections = extractTextSections(rawText);
  const requirements = extractRequirements(sections);

  const items: ComplianceItem[] = [];

  for (const req of requirements) {
    const result = await pool.query(
      `INSERT INTO compliance_items (capture_id, section_number, requirement_text, owner_team, status)
       VALUES ($1, $2, $3, NULL, 'open')
       RETURNING *`,
      [captureId, req.section_number, req.requirement_text],
    );
    items.push(result.rows[0]);
  }

  const bySectionMap: Record<string, number> = {};
  for (const req of requirements) {
    bySectionMap[req.section_number] = (bySectionMap[req.section_number] || 0) + 1;
  }
  const bySection = Object.entries(bySectionMap).map(([section, count]) => ({
    section,
    count,
  }));

  await pool.query(
    `UPDATE captures SET compliance_matrix = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify({ total: requirements.length, by_section: bySection }), captureId],
  );

  return items;
}
