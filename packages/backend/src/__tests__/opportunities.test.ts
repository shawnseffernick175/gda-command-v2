/**
 * F-101 Sprint 2: Opportunities route tests.
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

vi.mock("../lib/teaming-engine", () => ({
  evaluateTeamingFlags: vi.fn().mockResolvedValue([]),
}));

import opportunitiesRouter from "../routes/opportunities-v2";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v2/opportunities", opportunitiesRouter);
  return app;
}

describe("Opportunities V2 Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GDA_WEBHOOK_KEY = "test-key";
  });

  it("POST creates with ou_tag='envision' default", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        ou_tag: "envision",
        source: "sam_gov",
        title: "Test Opportunity",
        created_at: new Date().toISOString(),
      }],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/opportunities")
      .send({ title: "Test Opportunity", source: "sam_gov" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify INSERT query includes 'envision' as default
    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall[0]).toContain("'envision'");
  });

  it("GET with naics filter returns correct subset", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // count query
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          title: "IT Services",
          naics: "541512",
          teaming_flags: "[]",
        }],
      }); // data query

    const app = buildApp();
    const res = await request(app)
      .get("/api/v2/opportunities?naics=541512");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify naics filter was applied
    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("naics ILIKE");
    expect(countCall[1]).toContain("%541512%");
  });

  it("GET with set_aside filter returns correct subset", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, title: "HZ Opp 1", set_aside: "HUBZone SB" },
          { id: 2, title: "HZ Opp 2", set_aside: "HUBZone SB" },
        ],
      });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v2/opportunities?set_aside=HUBZone");

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("set_aside ILIKE");
  });

  it("POST /:id/qualify sets qualified_at and returns teaming flags", async () => {
    const { evaluateTeamingFlags } = await import("../lib/teaming-engine");
    (evaluateTeamingFlags as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { opportunity_id: 1, suggested_partner: "riverstone", reason: "hubzone", detail: "HUBZone match" },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        title: "Qualify Test",
        qualified_at: new Date().toISOString(),
        qualified_by: "Shawn",
      }],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/opportunities/1/qualify")
      .set("x-gda-key", "test-key")
      .send({ qualified_by: "Shawn" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.teaming_flags).toHaveLength(1);
    expect(res.body.data.teaming_flags[0].reason).toBe("hubzone");
  });

  it("POST /:id/qualify on already-qualified returns 200 (idempotent)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        title: "Already Qualified",
        qualified_at: new Date().toISOString(),
        qualified_by: "Shawn",
      }],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/opportunities/1/qualify")
      .set("x-gda-key", "test-key")
      .send({ qualified_by: "Shawn" });

    expect(res.status).toBe(200);
  });

  it("POST /:id/grade without grade_evidence returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/opportunities/1/grade")
      .set("x-gda-key", "test-key")
      .send({ grade: "A" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("grade_evidence");
  });

  it("POST /:id/grade with evidence sets both grade and grade_evidence", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        title: "Graded Opp",
        grade: "A",
        grade_evidence: "Strong NAICS alignment",
      }],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/v2/opportunities/1/grade")
      .set("x-gda-key", "test-key")
      .send({ grade: "A", grade_evidence: "Strong NAICS alignment" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify the UPDATE query sets both grade and grade_evidence
    const updateCall = mockQuery.mock.calls[0];
    expect(updateCall[0]).toContain("grade = $1");
    expect(updateCall[0]).toContain("grade_evidence = $2");
    expect(updateCall[1]).toEqual(["A", "Strong NAICS alignment", "1"]);
  });
});
