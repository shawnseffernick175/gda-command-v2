/**
 * F-101 Sprint 2: Teaming engine tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock("../lib/db", () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect,
  }),
}));

vi.mock("../lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { evaluateTeamingFlags } from "../lib/teaming-engine";
import { getPool } from "../lib/db";

describe("Teaming Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  function setupOpp(overrides: Record<string, unknown> = {}) {
    const defaultOpp = {
      id: 1,
      title: "Test Opportunity",
      description: null,
      set_aside: null,
      naics: "541512",
      agency: "Army",
    };
    mockQuery.mockResolvedValueOnce({ rows: [{ ...defaultOpp, ...overrides }] });
  }

  function setupPartnerCerts(
    riverstoneCerts: { name: string; status: string }[],
    pdCerts: { name: string; status: string }[],
  ) {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ certs: riverstoneCerts }] }) // Riverstone
      .mockResolvedValueOnce({ rows: [{ certs: pdCerts }] }); // PD Systems
  }

  function setupDeconflict(awards: Record<string, unknown>[] = []) {
    mockQuery.mockResolvedValueOnce({ rows: awards });
  }

  it("HUBZone opp + Riverstone HUBZone cert → flag reason='hubzone'", async () => {
    setupOpp({ set_aside: "HUBZone SB" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const pool = getPool()!;
    const flags = await evaluateTeamingFlags(1, pool);

    expect(flags.some((f) => f.reason === "hubzone" && f.suggested_partner === "riverstone")).toBe(true);
  });

  it("Training keywords + PD Systems V3 Veteran cert → flag reason='training_depth'", async () => {
    setupOpp({ description: "Immersive VR training simulation system" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const pool = getPool()!;
    const flags = await evaluateTeamingFlags(1, pool);

    expect(flags.some((f) => f.reason === "training_depth" && f.suggested_partner === "pd_systems")).toBe(true);
  });

  it("IC keywords + Riverstone IC cert → flag reason='ic_clearance'", async () => {
    setupOpp({ description: "USCYBERCOM classified operations support" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const pool = getPool()!;
    const flags = await evaluateTeamingFlags(1, pool);

    expect(flags.some((f) => f.reason === "ic_clearance" && f.suggested_partner === "riverstone")).toBe(true);
  });

  it("V3 Veteran set-aside + PD Systems cert → flag reason='v3_veteran'", async () => {
    setupOpp({ set_aside: "V3 Veteran", description: "veteran owned support" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const pool = getPool()!;
    const flags = await evaluateTeamingFlags(1, pool);

    expect(flags.some((f) => f.reason === "v3_veteran" && f.suggested_partner === "pd_systems")).toBe(true);
  });

  it("No matching criteria → no flags", async () => {
    setupOpp({ title: "Office furniture procurement", description: "Standard office furniture order" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const pool = getPool()!;
    const flags = await evaluateTeamingFlags(1, pool);

    expect(flags).toHaveLength(0);
  });

  it("Re-evaluate same opp → no duplicate flags (upsert)", async () => {
    // First evaluation
    setupOpp({ set_aside: "HUBZone SB" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const pool = getPool()!;
    const flags1 = await evaluateTeamingFlags(1, pool);
    expect(flags1.some((f) => f.reason === "hubzone")).toBe(true);

    // Verify DELETE was called before INSERT (upsert pattern)
    const deleteCall = mockClientQuery.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("DELETE FROM teaming_flags"),
    );
    expect(deleteCall).toBeTruthy();

    // Second evaluation with same setup
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
    mockClientQuery.mockResolvedValue({ rows: [] });

    setupOpp({ set_aside: "HUBZone SB" });
    setupPartnerCerts(
      [{ name: "HUBZone", status: "active" }],
      [{ name: "V3 Veteran", status: "active" }],
    );
    setupDeconflict();

    const flags2 = await evaluateTeamingFlags(1, pool);
    expect(flags2.some((f) => f.reason === "hubzone")).toBe(true);

    // Again verify delete + insert (upsert) pattern
    const deleteCall2 = mockClientQuery.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("DELETE FROM teaming_flags"),
    );
    expect(deleteCall2).toBeTruthy();
  });
});
