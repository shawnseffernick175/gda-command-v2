/**
 * F-103 Sprint 4: Launchpad Summary route tests.
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

vi.mock("../lib/auth", () => ({
  verifyToken: vi.fn(),
}));

import launchpadRouter from "../routes/launchpad";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/launchpad", launchpadRouter);
  return app;
}

describe("GET /api/launchpad/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns four numeric counts with ou_tag=envision", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] })   // action_items_due_today
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] })   // opportunities_hot
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })   // capture_behind
      .mockResolvedValueOnce({ rows: [{ cnt: 2 }] });   // partner_new_awards_7d

    const app = buildApp();
    const res = await request(app).get("/api/launchpad/summary?ou_tag=envision");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      action_items_due_today: 3,
      opportunities_hot: 5,
      capture_behind: 1,
      partner_new_awards_7d: 2,
    });
  });

  it("applies ou_tag filter — each query receives the tag as $1", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    const app = buildApp();
    await request(app).get("/api/launchpad/summary?ou_tag=envision");

    // First three queries should have ou_tag as parameter
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockQuery.mock.calls[0][1]).toEqual(["envision"]);
    expect(mockQuery.mock.calls[1][1]).toEqual(["envision"]);
    expect(mockQuery.mock.calls[2][1]).toEqual(["envision"]);
  });

  it("defaults ou_tag to envision when not provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    const app = buildApp();
    const res = await request(app).get("/api/launchpad/summary");

    expect(res.status).toBe(200);
    expect(res.body.data.action_items_due_today).toBe(0);
    expect(mockQuery.mock.calls[0][1]).toEqual(["envision"]);
  });

  it("returns zeros when all counts are zero", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    const app = buildApp();
    const res = await request(app).get("/api/launchpad/summary?ou_tag=envision");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      action_items_due_today: 0,
      opportunities_hot: 0,
      capture_behind: 0,
      partner_new_awards_7d: 0,
    });
  });

  it("wraps response in standard GDA envelope", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 2 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 4 }] });

    const app = buildApp();
    const res = await request(app).get("/api/launchpad/summary?ou_tag=envision");

    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("workflow", "GDA.launchpad");
    expect(res.body).toHaveProperty("action", "summary");
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("meta");
    expect(res.body.meta).toHaveProperty("generatedAt");
  });
});
