/**
 * F-102 Sprint 3: RFP Shredder unit tests.
 * Tests the regex-based compliance extraction logic using an injected
 * text extractor to avoid needing real PDF/DOCX parsing in tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { shredRfp, type TextExtractor } from "../lib/rfp-shredder";

const mockQuery = vi.fn();
vi.mock("../lib/db", () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock("../lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function createMockPool() {
  return { query: mockQuery } as unknown as import("pg").Pool;
}

function textExtractor(text: string): TextExtractor {
  return async () => text;
}

describe("RFP Shredder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });
  });

  it("extracts requirement with 'shall' keyword", async () => {
    const text = "The Contractor shall deliver monthly status reports.";
    const buffer = Buffer.from(text, "utf-8");

    const pool = createMockPool();
    const items = await shredRfp(buffer, "application/pdf", 1, pool, textExtractor(text));

    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("assigns section_number from Section L header", async () => {
    const text = "Section L\nThe offeror shall submit pricing data.\nOther stuff.";
    const buffer = Buffer.from(text, "utf-8");

    mockQuery.mockImplementation(async (_query: string, params: unknown[]) => {
      if (typeof _query === "string" && _query.includes("INSERT INTO compliance_items")) {
        return {
          rows: [
            {
              id: 1,
              capture_id: params?.[0],
              section_number: params?.[1],
              requirement_text: params?.[2],
              owner_team: null,
              status: "open",
            },
          ],
        };
      }
      return { rows: [{ id: 1 }] };
    });

    const pool = createMockPool();
    const items = await shredRfp(buffer, "application/pdf", 1, pool, textExtractor(text));

    expect(items.length).toBeGreaterThanOrEqual(1);
    const sectionItem = items.find((i) => i.section_number === "Section L");
    expect(sectionItem).toBeDefined();
  });

  it("handles DOCX mime type without throwing", async () => {
    const text = "SOW\nContractor must provide monthly updates.";
    const buffer = Buffer.from(text, "utf-8");

    const pool = createMockPool();
    const items = await shredRfp(
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      1,
      pool,
      textExtractor(text),
    );

    expect(Array.isArray(items)).toBe(true);
  });

  it("returns empty array when no shall/must keywords", async () => {
    const text = "This document contains general instructions. No specific requirements listed.";
    const buffer = Buffer.from(text, "utf-8");

    const pool = createMockPool();
    const items = await shredRfp(buffer, "application/pdf", 1, pool, textExtractor(text));

    expect(items).toHaveLength(0);
  });
});
