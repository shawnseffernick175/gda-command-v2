/**
 * F-105: source-validator unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  validateSourcesOrOmit,
  attachSources,
  isValidSourceRef,
} from "../lib/source-validator";
import type { SourceRef } from "../lib/source-validator";

const validSource: SourceRef = {
  kind: "sam_gov",
  title: "SAM.gov Notice W9113M-25-R-0001",
  url: "https://sam.gov/opp/abc123/view",
  retrieved_at: "2026-05-29T12:00:00Z",
};

const internalSource: SourceRef = {
  kind: "internal",
  title: "Manual entry by Shawn",
  url: "/audit/edits/edit-001",
  retrieved_at: "2026-05-29T12:00:00Z",
};

describe("isValidSourceRef", () => {
  it("accepts a valid source ref", () => {
    expect(isValidSourceRef(validSource)).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(isValidSourceRef(null)).toBe(false);
    expect(isValidSourceRef(undefined)).toBe(false);
  });

  it("rejects object with missing fields", () => {
    expect(isValidSourceRef({ kind: "sam_gov" })).toBe(false);
    expect(isValidSourceRef({ kind: "sam_gov", title: "t" })).toBe(false);
  });

  it("rejects object with invalid kind", () => {
    expect(
      isValidSourceRef({ ...validSource, kind: "unknown_source" }),
    ).toBe(false);
  });

  it("rejects object with empty title", () => {
    expect(isValidSourceRef({ ...validSource, title: "" })).toBe(false);
  });
});

describe("validateSourcesOrOmit", () => {
  it("preserves meta keys without sources", () => {
    const input = {
      id: "abc",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      ou_tag: "envision",
      title: "Bare field",
    };
    const result = validateSourcesOrOmit(input);
    expect(result.id).toBe("abc");
    expect(result.created_at).toBe("2026-01-01");
    expect(result.ou_tag).toBe("envision");
    // title has no sources, should be omitted
    expect(result).not.toHaveProperty("title");
  });

  it("keeps fields that have valid _sources sibling", () => {
    const input = {
      id: "1",
      agency: "DoD",
      agency_sources: [validSource],
    };
    const result = validateSourcesOrOmit(input);
    expect(result.agency).toBe("DoD");
    expect(result.agency_sources).toEqual([validSource]);
  });

  it("strips fields with empty sources array", () => {
    const input = {
      id: "1",
      agency: "DoD",
      agency_sources: [],
    };
    const result = validateSourcesOrOmit(input);
    expect(result).not.toHaveProperty("agency");
    expect(result).not.toHaveProperty("agency_sources");
  });

  it("strips fields with invalid source refs", () => {
    const input = {
      id: "1",
      agency: "DoD",
      agency_sources: [{ kind: "bad_kind", title: "x", url: "x", retrieved_at: "x" }],
    };
    const result = validateSourcesOrOmit(input);
    expect(result).not.toHaveProperty("agency");
  });

  it("preserves arrays (milestones, teaming_partners, etc.)", () => {
    const input = {
      id: "1",
      milestones: [{ label: "M1" }],
      teaming_partners: ["riverstone"],
    };
    const result = validateSourcesOrOmit(input);
    expect(result.milestones).toEqual([{ label: "M1" }]);
    expect(result.teaming_partners).toEqual(["riverstone"]);
  });

  it("respects preserveKeys parameter", () => {
    const input = {
      id: "1",
      title: "Keep this",
    };
    const result = validateSourcesOrOmit(input, ["title"]);
    expect(result.title).toBe("Keep this");
  });
});

describe("attachSources", () => {
  it("attaches sources and validates in one step", () => {
    const row = {
      id: "1",
      agency: "DoD",
      title: "Opp Title",
      value: 1000000,
    };
    const result = attachSources(row, {
      agency: [validSource],
      title: [internalSource],
    });
    expect(result.agency).toBe("DoD");
    expect(result.agency_sources).toEqual([validSource]);
    expect(result.title).toBe("Opp Title");
    expect(result.title_sources).toEqual([internalSource]);
    // value has no sources, omitted
    expect(result).not.toHaveProperty("value");
  });

  it("preserves meta keys through attachSources", () => {
    const row = { id: "x", created_at: "now", ou_tag: "envision" };
    const result = attachSources(row, {});
    expect(result.id).toBe("x");
    expect(result.ou_tag).toBe("envision");
  });
});
