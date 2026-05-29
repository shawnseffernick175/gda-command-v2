/**
 * F-101 Sprint 2: Pipeline route tests.
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

import pipelineRouter from "../routes/pipeline-v2";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v2/pipeline", pipelineRouter);
  return app;
}

describe("Pipeline V2 Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GDA_WEBHOOK_KEY = "test-key";
  });

  it("POST with unqualified opp returns 422", async () => {
    // Opportunity exists but not qualified
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, qualified_at: null, ou_tag: "envision", is_partner_teaming_required: false }],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/pipeline")
      .set("x-gda-key", "test-key")
      .send({
        opportunity_id: 1,
        capture_owner: "Shawn",
        win_prob_evidence: "Strong alignment",
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_QUALIFIED");
  });

  it("POST with qualified opp creates item", async () => {
    // Opportunity is qualified
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          qualified_at: new Date().toISOString(),
          ou_tag: "envision",
          is_partner_teaming_required: false,
        }],
      })
      // INSERT returns new pipeline item
      .mockResolvedValueOnce({
        rows: [{
          id: 100,
          ou_tag: "envision",
          opportunity_id: 1,
          capture_owner: "Shawn",
          milestones: [],
          win_prob_pct: 60,
          win_prob_evidence: "Strong alignment",
          teaming_partners: [],
          created_at: new Date().toISOString(),
        }],
      });

    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/pipeline")
      .set("x-gda-key", "test-key")
      .send({
        opportunity_id: 1,
        capture_owner: "Shawn",
        win_prob_pct: 60,
        win_prob_evidence: "Strong alignment",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.capture_owner).toBe("Shawn");
  });

  it("PATCH setting win_prob_pct without win_prob_evidence returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .patch("/api/v2/pipeline/100")
      .set("x-gda-key", "test-key")
      .send({ win_prob_pct: 75 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("win_prob_evidence");
  });

  it("PATCH with evidence updates record", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 100,
        win_prob_pct: 75,
        win_prob_evidence: "Customer confirmed interest",
        capture_owner: "Shawn",
      }],
    });

    const app = buildApp();
    const res = await request(app)
      .patch("/api/v2/pipeline/100")
      .set("x-gda-key", "test-key")
      .send({
        win_prob_pct: 75,
        win_prob_evidence: "Customer confirmed interest",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE removes the record", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 100 }],
    });

    const app = buildApp();
    const res = await request(app)
      .delete("/api/v2/pipeline/100")
      .set("x-gda-key", "test-key");

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });
});
