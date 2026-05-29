/**
 * F-104 Sprint 5: Combined opportunity analysis endpoint tests.
 * Validates envelope shape, ETag behaviour, and source schema (R1).
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

vi.mock("../lib/n8n-client", () => ({
  callWebhook: vi.fn().mockResolvedValue({ ok: false, body: null }),
  webhookConfig: vi.fn().mockReturnValue({ configured: false }),
}));

vi.mock("../lib/n8n-data", () => ({
  n8nWebhookConfigured: vi.fn().mockReturnValue(false),
}));

import analysisRouter from "../routes/opportunities/analysis";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/opportunities", analysisRouter);
  return app;
}

describe("GET /api/opportunities/:id/analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the combined analysis envelope with sources array", async () => {
    // Mock opp lookup
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ updated_at: new Date("2026-05-29T00:00:00Z") }],
      })
      // Mock timeline query
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app).get("/api/opportunities/test-opp-123/analysis");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    // Envelope must include all seven top-level keys
    expect(data).toHaveProperty("pwin");
    expect(data).toHaveProperty("incumbent");
    expect(data).toHaveProperty("competitors");
    expect(data).toHaveProperty("blackhat");
    expect(data).toHaveProperty("wargame");
    expect(data).toHaveProperty("timeline");
    expect(data).toHaveProperty("sources");

    // Sources must be an array of SourceRef objects
    expect(Array.isArray(data.sources)).toBe(true);
    for (const src of data.sources) {
      expect(src).toHaveProperty("kind");
      expect(src).toHaveProperty("title");
      expect(src).toHaveProperty("url");
      expect(src).toHaveProperty("retrieved_at");
      expect(
        [
          "sam_gov",
          "fpds",
          "usaspending",
          "govwin",
          "news",
          "doctrine",
          "partner_site",
          "internal",
        ].includes(src.kind),
      ).toBe(true);
    }
  });

  it("returns ETag header and respects If-None-Match", async () => {
    const updatedAt = new Date("2026-05-29T00:00:00Z");

    // First request
    mockQuery
      .mockResolvedValueOnce({ rows: [{ updated_at: updatedAt }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res1 = await request(app).get("/api/opportunities/test-opp-123/analysis");
    expect(res1.status).toBe(200);
    const etag = res1.headers["etag"];
    expect(etag).toBeDefined();

    // Second request with matching ETag → 304
    mockQuery.mockResolvedValueOnce({ rows: [{ updated_at: updatedAt }] });

    const res2 = await request(app)
      .get("/api/opportunities/test-opp-123/analysis")
      .set("If-None-Match", etag);
    expect(res2.status).toBe(304);
  });

  it("rejects analysis fields without valid source kind", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ updated_at: new Date("2026-05-29T00:00:00Z") }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app).get("/api/opportunities/test-opp-123/analysis");

    // Every source must have a kind from the allowed set
    const allowedKinds = [
      "sam_gov",
      "fpds",
      "usaspending",
      "govwin",
      "news",
      "doctrine",
      "partner_site",
      "internal",
    ];

    for (const src of res.body.data.sources) {
      expect(allowedKinds).toContain(src.kind);
      expect(typeof src.title).toBe("string");
      expect(typeof src.url).toBe("string");
      expect(typeof src.retrieved_at).toBe("string");
    }
  });
});
