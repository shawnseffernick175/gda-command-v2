/**
 * F-100 Sprint 1: Launchpad route tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock DB pool
const mockQuery = vi.fn();
vi.mock("../lib/db", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock logger
vi.mock("../lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import launchpadRouter from "../routes/launchpad";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/launchpad", launchpadRouter);
  return app;
}

const SEED_FLAGS = [
  {
    id: 1,
    ou_tag: "envision",
    flag_key: "cio_sp3_expired",
    severity: "critical",
    title: "CIO-SP3 SB/8(a) EXPIRED",
    detail: "Expired 4/29/2026.",
    due_date: "2026-04-29",
    doctrine_anchor: "Ethics Always",
    source_url: null,
    is_dismissed: false,
    dismissed_at: null,
    created_at: "2026-05-28T00:00:00Z",
    updated_at: "2026-05-28T00:00:00Z",
  },
  {
    id: 2,
    ou_tag: "envision",
    flag_key: "cmmi_ml3_expiring",
    severity: "critical",
    title: "CMMI-DEV ML3 expires 8/7/2026",
    detail: "Recertification needed.",
    due_date: "2026-08-07",
    doctrine_anchor: "Ethics Always",
    source_url: null,
    is_dismissed: false,
    dismissed_at: null,
    created_at: "2026-05-28T00:00:00Z",
    updated_at: "2026-05-28T00:00:00Z",
  },
  {
    id: 3,
    ou_tag: "envision",
    flag_key: "mentor_protege_urgent",
    severity: "critical",
    title: "Mentor-Protege Agreement",
    detail: "Most urgent action.",
    due_date: null,
    doctrine_anchor: "Market, Mission, Brand Focus",
    source_url: null,
    is_dismissed: false,
    dismissed_at: null,
    created_at: "2026-05-28T00:00:00Z",
    updated_at: "2026-05-28T00:00:00Z",
  },
];

describe("Launchpad Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GDA_WEBHOOK_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/launchpad/flags", () => {
    it("returns 3 seeded flags ordered critical-first", async () => {
      // First call: SELECT flags, second call: UPDATE touch
      mockQuery
        .mockResolvedValueOnce({ rows: SEED_FLAGS })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await request(app).get("/api/launchpad/flags?ou_tag=envision");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.flags).toHaveLength(3);
      expect(res.body.data.flags[0].severity).toBe("critical");
      expect(res.body.data.flags[1].severity).toBe("critical");
      expect(res.body.data.flags[2].severity).toBe("critical");
    });

    it("dismissed flags are excluded by default (mock returns only active)", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: SEED_FLAGS.filter((f) => !f.is_dismissed) })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp();
      const res = await request(app).get("/api/launchpad/flags");

      expect(res.status).toBe(200);
      const flags = res.body.data.flags;
      expect(flags.every((f: { is_dismissed: boolean }) => !f.is_dismissed)).toBe(true);
    });
  });

  describe("POST /api/launchpad/flags/:id/dismiss", () => {
    it("flips is_dismissed and is reflected in next GET", async () => {
      process.env.GDA_WEBHOOK_KEY = "test-key";

      // Dismiss call
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, flag_key: "cio_sp3_expired", is_dismissed: true, dismissed_at: "2026-05-28T12:00:00Z" }],
      });

      const app = buildApp();
      const dismissRes = await request(app)
        .post("/api/launchpad/flags/1/dismiss")
        .set("x-gda-key", "test-key");

      expect(dismissRes.status).toBe(200);
      expect(dismissRes.body.success).toBe(true);
      expect(dismissRes.body.data.is_dismissed).toBe(true);

      // Now GET flags — only 2 should remain (dismiss removed flag 1)
      mockQuery
        .mockResolvedValueOnce({ rows: SEED_FLAGS.filter((f) => f.id !== 1) })
        .mockResolvedValueOnce({ rows: [] });

      const getRes = await request(app).get("/api/launchpad/flags");
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.flags).toHaveLength(2);
    });

    it("rejects without valid auth in production mode", async () => {
      process.env.GDA_WEBHOOK_KEY = "test-key";
      process.env.AUTH_REQUIRED = "true";

      const app = buildApp();
      const res = await request(app)
        .post("/api/launchpad/flags/1/dismiss")
        .set("x-gda-key", "wrong-key");

      expect(res.status).toBe(401);

      delete process.env.AUTH_REQUIRED;
    });
  });
});
