/**
 * F-102 Sprint 3: Captures route tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockQuery = vi.fn();
vi.mock("../lib/db", () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock("../lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../lib/rfp-shredder", () => ({
  shredRfp: vi.fn().mockResolvedValue([
    {
      id: 1,
      capture_id: 1,
      section_number: "Section L",
      requirement_text: "The Contractor shall deliver monthly status reports.",
      owner_team: null,
      status: "open",
      evidence_link: null,
    },
  ]),
}));

vi.mock("../lib/teaming-worksheet", () => ({
  generateTeamingWorksheet: vi.fn().mockResolvedValue([
    {
      partner_ou_tag: "riverstone",
      certs_claimed: ["HUBZone"],
      vehicles_listed: ["MDA SHIELD IDIQ (HQ085926DF469)"],
      pp_highlights: ["Army — $500,000 — 2025"],
      rationale_paragraph:
        "Riverstone brings HUBZone certifications and access to MDA SHIELD IDIQ (HQ085926DF469) contract vehicles.",
    },
  ]),
}));

import capturesRouter from "../routes/captures";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/captures", capturesRouter);
  return app;
}

describe("Captures Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GDA_WEBHOOK_KEY = "test-key";
  });

  it("POST /api/captures with invalid pipeline_item_id returns 404", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app)
      .post("/api/captures")
      .set("x-gda-key", "test-key")
      .send({ pipeline_item_id: 99999 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/captures creates capture with stage 'pink' default", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            pipeline_item_id: 1,
            color_review_stage: "pink",
            ou_tag: "envision",
          },
        ],
      });

    const app = buildApp();
    const res = await request(app)
      .post("/api/captures")
      .set("x-gda-key", "test-key")
      .send({ pipeline_item_id: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/captures/:id/shred-rfp with non-PDF/DOCX file returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/captures/1/shred-rfp")
      .set("x-gda-key", "test-key")
      .attach("file", Buffer.from("hello"), {
        filename: "test.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
  });

  it("POST /api/captures/:id/shred-rfp with valid PDF returns compliance items array", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const app = buildApp();
    const res = await request(app)
      .post("/api/captures/1/shred-rfp")
      .set("x-gda-key", "test-key")
      .attach("file", Buffer.from("%PDF-1.4 test"), {
        filename: "rfp.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.compliance_items).toBeDefined();
    expect(Array.isArray(res.body.data.compliance_items)).toBe(true);
  });

  it("POST /api/captures/:id/advance-stage advances pink → red in sequence", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          color_review_stage: "pink",
          color_review_notes: [],
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          color_review_stage: "red",
          color_review_notes: ["[pink → red] Reviewed"],
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/captures/1/advance-stage")
      .set("x-gda-key", "test-key")
      .send({ note: "Reviewed" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.color_review_stage).toBe("red");
  });

  it("POST /api/captures/:id/advance-stage on submitted stage returns 400", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          color_review_stage: "submitted",
          color_review_notes: [],
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/captures/1/advance-stage")
      .set("x-gda-key", "test-key")
      .send({ note: "Try advance" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("PATCH /api/captures/:id with margin_pct=8 returns pricing_guardrail.pass=false", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          pricing_assumptions: { margin_pct: 8 },
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .patch("/api/captures/1")
      .set("x-gda-key", "test-key")
      .send({ pricing_assumptions: { margin_pct: 8 } });

    expect(res.status).toBe(200);
    expect(res.body.data.pricing_guardrail.pass).toBe(false);
  });

  it("PATCH /api/captures/:id with margin_pct=15 returns pricing_guardrail.pass=true", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          pricing_assumptions: { margin_pct: 15 },
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .patch("/api/captures/1")
      .set("x-gda-key", "test-key")
      .send({ pricing_assumptions: { margin_pct: 15 } });

    expect(res.status).toBe(200);
    expect(res.body.data.pricing_guardrail.pass).toBe(true);
  });

  it("POST /api/captures/:id/generate-teaming-worksheet with ['envision'] returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/captures/1/generate-teaming-worksheet")
      .set("x-gda-key", "test-key")
      .send({ partner_ou_tags: ["envision"] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/captures/:id/generate-teaming-worksheet with ['riverstone'] returns worksheet", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const app = buildApp();
    const res = await request(app)
      .post("/api/captures/1/generate-teaming-worksheet")
      .set("x-gda-key", "test-key")
      .send({ partner_ou_tags: ["riverstone"] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.worksheets).toBeDefined();
    expect(res.body.data.worksheets[0].certs_claimed).toContain("HUBZone");
  });
});
