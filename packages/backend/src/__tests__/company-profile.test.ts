/**
 * F-100 Sprint 1: Company Profile route tests.
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

import companyProfileRouter from "../routes/company-profile";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/company-profile", companyProfileRouter);
  return app;
}

describe("Company Profile Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/company-profile/envision", () => {
    it("returns Envision UEI VNMLXFMQD976", async () => {
      const app = buildApp();
      const res = await request(app).get("/api/company-profile/envision");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.uei).toBe("VNMLXFMQD976");
      expect(res.body.data.anchor_company).toBe("Envision Innovative Solutions");
    });
  });

  describe("GET /api/company-profile/gda-narrative", () => {
    it("returns 3-pillar story with all three pillars", async () => {
      const app = buildApp();
      const res = await request(app).get("/api/company-profile/gda-narrative");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pillars).toHaveLength(3);

      const pillarNames = res.body.data.pillars.map((p: { name: string }) => p.name);
      expect(pillarNames).toContain("ENABLE");
      expect(pillarNames).toContain("PROTECT");
      expect(pillarNames).toContain("TRAIN");
    });
  });

  describe("GET /api/company-profile/partners", () => {
    it("returns 2 partner records from DB, both flagged read-only", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ou_tag: "pd_systems",
            display_name: "OU-III Training, Simulation & Digital Readiness",
            anchor_company: "PD Systems",
            is_primary: false,
            is_partner: true,
            uei: "MBF6MBLZLMC3",
            cage: "4V8V7",
            primary_naics: "561210",
            notes: "Partner Intel.",
            created_at: "2026-05-28T00:00:00Z",
          },
          {
            ou_tag: "riverstone",
            display_name: "OU-II Intelligence & Cyber Engineering",
            anchor_company: "Riverstone Solutions",
            is_primary: false,
            is_partner: true,
            uei: null,
            cage: "71WX3",
            primary_naics: null,
            notes: "Partner Intel.",
            created_at: "2026-05-28T00:00:00Z",
          },
        ],
      });

      const app = buildApp();
      const res = await request(app).get("/api/company-profile/partners");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.partners).toHaveLength(2);
      expect(res.body.data.read_only).toBe(true);
      expect(res.body.data.partners.every((p: { read_only: boolean }) => p.read_only)).toBe(true);
    });
  });
});
