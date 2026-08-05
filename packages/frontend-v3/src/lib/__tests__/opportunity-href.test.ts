import { describe, it, expect } from "vitest";
import { opportunityHref } from "@/components/shared/OpportunityLink";

describe("opportunityHref — canonical single-opportunity link", () => {
  it("emits the REST-style /opportunities/<id> path", () => {
    expect(opportunityHref(12345)).toBe("/opportunities/12345");
    expect(opportunityHref("abc")).toBe("/opportunities/abc");
  });

  it("url-encodes ids with reserved characters", () => {
    expect(opportunityHref("a/b?c")).toBe("/opportunities/a%2Fb%3Fc");
  });

  it("falls back to the list route for a missing id", () => {
    expect(opportunityHref(null)).toBe("/opportunities");
    expect(opportunityHref(undefined)).toBe("/opportunities");
    expect(opportunityHref("")).toBe("/opportunities");
  });
});
