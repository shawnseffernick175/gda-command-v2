/**
 * F-100 Sprint 1: OU Tag module tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isValidOuTag, defaultOuTag, OU_TAGS, getOuRegistry } from "../lib/ou-tag";
import type { OuTag } from "../lib/ou-tag";

describe("OU Tag Module", () => {
  describe("isValidOuTag", () => {
    it.each([
      "envision",
      "riverstone",
      "pd_systems",
      "teaming",
      "gda_rollup",
    ] satisfies OuTag[])("returns true for '%s'", (tag) => {
      expect(isValidOuTag(tag)).toBe(true);
    });

    it.each([
      "invalid",
      "",
      null,
      undefined,
      42,
      true,
      "ENVISION",
      "pd-systems",
    ])("returns false for %p", (value) => {
      expect(isValidOuTag(value)).toBe(false);
    });
  });

  describe("defaultOuTag", () => {
    it("returns 'envision'", () => {
      expect(defaultOuTag()).toBe("envision");
    });
  });

  describe("OU_TAGS", () => {
    it("has exactly 5 tags", () => {
      expect(OU_TAGS).toHaveLength(5);
    });

    it("is frozen", () => {
      expect(Object.isFrozen(OU_TAGS)).toBe(true);
    });
  });

  describe("getOuRegistry", () => {
    const mockRows = [
      { ou_tag: "envision", display_name: "OU-I", anchor_company: "Envision", is_primary: true, is_partner: false, uei: "VNMLXFMQD976", cage: "4JB87", primary_naics: "541715", notes: "Primary", created_at: "2026-01-01" },
      { ou_tag: "riverstone", display_name: "OU-II", anchor_company: "Riverstone", is_primary: false, is_partner: true, uei: null, cage: "71WX3", primary_naics: null, notes: "Partner", created_at: "2026-01-01" },
      { ou_tag: "pd_systems", display_name: "OU-III", anchor_company: "PD Systems", is_primary: false, is_partner: true, uei: "MBF6MBLZLMC3", cage: "4V8V7", primary_naics: "561210", notes: "Partner", created_at: "2026-01-01" },
      { ou_tag: "teaming", display_name: "Joint Pursuit", anchor_company: "GDA", is_primary: false, is_partner: false, uei: null, cage: null, primary_naics: null, notes: "Teaming", created_at: "2026-01-01" },
      { ou_tag: "gda_rollup", display_name: "GDA Rollup", anchor_company: "GDA", is_primary: false, is_partner: false, uei: null, cage: null, primary_naics: null, notes: "Rollup", created_at: "2026-01-01" },
    ];

    let mockPool: { query: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockPool = { query: vi.fn().mockResolvedValue({ rows: mockRows }) };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns 5 rows", async () => {
      const result = await getOuRegistry(mockPool as never);
      expect(result).toHaveLength(5);
    });

    it("has exactly 1 primary", async () => {
      const result = await getOuRegistry(mockPool as never);
      const primaries = result.filter((r) => r.is_primary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].ou_tag).toBe("envision");
    });

    it("has exactly 2 partners", async () => {
      const result = await getOuRegistry(mockPool as never);
      const partners = result.filter((r) => r.is_partner);
      expect(partners).toHaveLength(2);
    });
  });
});
