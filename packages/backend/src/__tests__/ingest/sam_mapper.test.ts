import { describe, it, expect } from "vitest";
import { mapSAMOpportunity } from "../../ingest/sam/mapper";
import type { SAMOpportunityRaw } from "../../ingest/sam/client";

function makeSAMRecord(overrides: Partial<SAMOpportunityRaw> = {}): SAMOpportunityRaw {
  return {
    noticeId: "abc123",
    title: "Test Opportunity — Full and Open",
    solicitationNumber: "W912DY-26-R-0001",
    fullParentPathName: "DEPT OF THE ARMY.US ARMY CORPS OF ENGINEERS",
    fullParentPathCode: "021.00",
    postedDate: "2026-05-01",
    type: "o",
    baseType: "Solicitation",
    active: "Yes",
    naicsCode: "541330",
    classificationCode: "R425",
    typeOfSetAsideDescription: "Total Small Business Set-Aside",
    typeOfSetAside: "SBA",
    responseDeadLine: "2026-06-15T17:00:00-04:00",
    uiLink: "https://sam.gov/opp/abc123/view",
    description: "Full scope of engineering services required.",
    placeOfPerformance: {
      city: { code: "1234", name: "Fort Liberty" },
      state: { code: "NC", name: "North Carolina" },
      country: { code: "USA", name: "UNITED STATES" },
    },
    award: { amount: "5000000" },
    ...overrides,
  };
}

describe("mapSAMOpportunity", () => {
  it("maps all core fields from raw SAM record", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord());

    expect(opportunity.sam_notice_id).toBe("abc123");
    expect(opportunity.title).toBe("Test Opportunity — Full and Open");
    expect(opportunity.solicitation_number).toBe("W912DY-26-R-0001");
    expect(opportunity.agency).toBe("DEPT OF THE ARMY");
    expect(opportunity.sub_agency).toBe("US ARMY CORPS OF ENGINEERS");
    expect(opportunity.naics).toBe("541330");
    expect(opportunity.psc).toBe("R425");
    expect(opportunity.set_aside).toBe("Total Small Business Set-Aside");
    expect(opportunity.response_due_at).toBe("2026-06-15T17:00:00-04:00");
    expect(opportunity.posted_at).toBe("2026-05-01");
    expect(opportunity.place_of_performance).toBe("Fort Liberty, North Carolina");
    expect(opportunity.value_min).toBe(5000000);
    expect(opportunity.value_max).toBe(5000000);
    expect(opportunity.status).toBe("discovery");
    expect(opportunity.data_source).toBe("sam.gov");
    expect(opportunity.description).toBe("Full scope of engineering services required.");
  });

  it("generates per-field source citations (R1)", () => {
    const { citations } = mapSAMOpportunity(makeSAMRecord());

    const fields = citations.map((c) => c.field);
    expect(fields).toContain("title");
    expect(fields).toContain("agency");
    expect(fields).toContain("naics");
    expect(fields).toContain("response_due_at");
    expect(fields).toContain("posted_at");
    expect(fields).toContain("value_min");
    expect(fields).toContain("value_max");

    for (const citation of citations) {
      expect(citation.source_url).toBe("https://sam.gov/opp/abc123/view");
    }
  });

  it("falls back to constructed URL when uiLink is missing", () => {
    const { citations } = mapSAMOpportunity(makeSAMRecord({ uiLink: undefined }));
    expect(citations[0].source_url).toBe("https://sam.gov/opp/abc123/view");
  });

  it("handles missing optional fields gracefully", () => {
    const { opportunity, citations } = mapSAMOpportunity(makeSAMRecord({
      fullParentPathName: undefined,
      naicsCode: undefined,
      naicsCodes: undefined,
      classificationCode: undefined,
      typeOfSetAsideDescription: undefined,
      typeOfSetAside: undefined,
      responseDeadLine: undefined,
      description: undefined,
      placeOfPerformance: undefined,
      award: undefined,
    }));

    expect(opportunity.agency).toBeNull();
    expect(opportunity.sub_agency).toBeNull();
    expect(opportunity.naics).toBeNull();
    expect(opportunity.psc).toBeNull();
    expect(opportunity.set_aside).toBeNull();
    expect(opportunity.response_due_at).toBeNull();
    expect(opportunity.place_of_performance).toBeNull();
    expect(opportunity.value_min).toBeNull();
    expect(opportunity.value_max).toBeNull();
    expect(opportunity.description).toBeNull();

    // With missing fields, citations should only include title
    const fields = citations.map((c) => c.field);
    expect(fields).toContain("title");
    expect(fields).not.toContain("agency");
    expect(fields).not.toContain("naics");
  });

  it("converts empty string timestamps to null", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord({
      responseDeadLine: "",
      postedDate: "  ",
    }));

    expect(opportunity.response_due_at).toBeNull();
    expect(opportunity.posted_at).toBeNull();
  });

  it("uses naicsCodes array fallback when naicsCode is missing", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord({
      naicsCode: undefined,
      naicsCodes: ["541511", "541512"],
    }));

    expect(opportunity.naics).toBe("541511");
  });

  it("excludes UNITED STATES from place of performance", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord({
      placeOfPerformance: {
        city: { name: "Honolulu" },
        state: { name: "Hawaii" },
        country: { code: "USA", name: "UNITED STATES" },
      },
    }));

    expect(opportunity.place_of_performance).toBe("Honolulu, Hawaii");
  });

  it("includes non-US country in place of performance", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord({
      placeOfPerformance: {
        city: { name: "Ramstein" },
        country: { code: "DEU", name: "Germany" },
      },
    }));

    expect(opportunity.place_of_performance).toBe("Ramstein, Germany");
  });

  it("defaults title to Untitled when missing", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord({
      title: undefined as unknown as string,
    }));
    expect(opportunity.title).toBe("Untitled");
  });

  it("prefers typeOfSetAsideDescription over typeOfSetAside", () => {
    const { opportunity } = mapSAMOpportunity(makeSAMRecord({
      typeOfSetAsideDescription: "8(a) Set-Aside",
      typeOfSetAside: "8A",
    }));
    expect(opportunity.set_aside).toBe("8(a) Set-Aside");
  });
});
