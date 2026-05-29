/**
 * F-101 Sprint 2: Partner Intel route tests.
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

import partnerIntelRouter from "../routes/partner-intel";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/partner-intel", partnerIntelRouter);
  return app;
}

describe("Partner Intel Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GDA_WEBHOOK_KEY = "test-key";
  });

  it("GET /api/partner-intel/profiles returns 2 profiles", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ou_tag: "riverstone",
          display_name: "Riverstone",
          anchor_company: "Riverstone",
          cage: "71WX3",
          uei: null,
          certs: [{ name: "HUBZone", status: "active" }],
          vehicles: [],
          products: [],
          why_track: { teaming_levers: [] },
        },
        {
          ou_tag: "pd_systems",
          display_name: "PD Systems",
          anchor_company: "PD Systems",
          cage: "4V8V7",
          uei: "MBF6MBLZLMC3",
          certs: [{ name: "V3 Veteran", status: "active" }],
          vehicles: [],
          products: [],
          why_track: { teaming_levers: [] },
        },
      ],
    });

    const app = buildApp();
    const res = await request(app).get("/api/partner-intel/profiles");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profiles).toHaveLength(2);
  });

  it("GET /api/partner-intel/profiles/riverstone returns CAGE 71WX3", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        ou_tag: "riverstone",
        display_name: "Riverstone",
        anchor_company: "Riverstone",
        cage: "71WX3",
        uei: null,
        certs: [{ name: "HUBZone", status: "active" }],
        vehicles: [{ name: "MDA SHIELD IDIQ", contract_number: "HQ085926DF469" }],
        products: [],
        why_track: { teaming_levers: ["HUBZone set-aside unlock"] },
      }],
    });

    const app = buildApp();
    const res = await request(app).get("/api/partner-intel/profiles/riverstone");

    expect(res.status).toBe(200);
    expect(res.body.data.cage).toBe("71WX3");
  });

  it("GET /api/partner-intel/profiles/pd_systems returns V3 Veteran cert", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        ou_tag: "pd_systems",
        display_name: "PD Systems",
        anchor_company: "PD Systems",
        cage: "4V8V7",
        uei: "MBF6MBLZLMC3",
        certs: [
          { name: "V3 Veteran", status: "active" },
          { name: "ISO 9001:2015", status: "active" },
        ],
        vehicles: [],
        products: [],
        why_track: { teaming_levers: ["V3 Veteran cert preference"] },
      }],
    });

    const app = buildApp();
    const res = await request(app).get("/api/partner-intel/profiles/pd_systems");

    expect(res.status).toBe(200);
    const certs = res.body.data.certs;
    expect(certs.some((c: { name: string }) => c.name === "V3 Veteran")).toBe(true);
  });

  it("GET /api/partner-intel/profiles/envision returns 404", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/partner-intel/profiles/envision");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
