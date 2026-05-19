import { describe, it, expect } from "vitest";
import { mapToDBRecord, type SAMOpportunityRaw } from "../lib/sam-api";

function makeSAMRecord(overrides: Partial<SAMOpportunityRaw> = {}): SAMOpportunityRaw {
  return {
    noticeId: "abc123",
    title: "Test Opportunity",
    postedDate: "2026-05-01",
    type: "o",
    baseType: "Solicitation",
    active: "Yes",
    ...overrides,
  };
}

describe("mapToDBRecord — timestamp handling", () => {
  it("converts empty string responseDeadLine to null", () => {
    const record = mapToDBRecord(makeSAMRecord({ responseDeadLine: "" }));
    expect(record.response_deadline).toBeNull();
  });

  it("converts undefined responseDeadLine to null", () => {
    const record = mapToDBRecord(makeSAMRecord({ responseDeadLine: undefined }));
    expect(record.response_deadline).toBeNull();
  });

  it("converts whitespace-only responseDeadLine to null", () => {
    const record = mapToDBRecord(makeSAMRecord({ responseDeadLine: "   " }));
    expect(record.response_deadline).toBeNull();
  });

  it("preserves valid responseDeadLine string", () => {
    const record = mapToDBRecord(makeSAMRecord({ responseDeadLine: "2026-06-01T12:00:00Z" }));
    expect(record.response_deadline).toBe("2026-06-01T12:00:00Z");
  });

  it("converts empty string postedDate to null", () => {
    const record = mapToDBRecord(makeSAMRecord({ postedDate: "" }));
    expect(record.posted_date).toBeNull();
  });

  it("preserves valid postedDate string", () => {
    const record = mapToDBRecord(makeSAMRecord({ postedDate: "2026-05-01" }));
    expect(record.posted_date).toBe("2026-05-01");
  });

});
