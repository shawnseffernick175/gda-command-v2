import { describe, it, expect } from "vitest";
import { resolveOpportunityId, idFromPathname } from "@/lib/opportunity-route";

describe("resolveOpportunityId — id resolution for /opportunities/[id]", () => {
  it("uses the real id from the path even when useParams yields the placeholder", () => {
    // static-export SPA fallback: param is the build-time sentinel
    expect(resolveOpportunityId("/opportunities/507004", "__placeholder__")).toBe("507004");
  });

  it("uses the real id from the path when param already matches", () => {
    expect(resolveOpportunityId("/opportunities/507004", "507004")).toBe("507004");
  });

  it("decodes url-encoded path segments", () => {
    expect(resolveOpportunityId("/opportunities/a%2Fb", "__placeholder__")).toBe("a/b");
  });

  it("ignores query string and hash in the path", () => {
    expect(resolveOpportunityId("/opportunities/123?foo=bar#x", null)).toBe("123");
  });

  it("falls back to the param when the path has no id", () => {
    expect(resolveOpportunityId("/opportunities", "999")).toBe("999");
    expect(resolveOpportunityId(null, "999")).toBe("999");
  });

  it("takes the first entry of an array param", () => {
    expect(resolveOpportunityId(null, ["888", "extra"])).toBe("888");
  });

  it("returns undefined when only the placeholder is available", () => {
    expect(resolveOpportunityId("/opportunities/__placeholder__", "__placeholder__")).toBeUndefined();
    expect(resolveOpportunityId(null, "__placeholder__")).toBeUndefined();
  });
});

describe("idFromPathname", () => {
  it("extracts the id segment", () => {
    expect(idFromPathname("/opportunities/42")).toBe("42");
  });

  it("returns undefined for the placeholder and for non-detail paths", () => {
    expect(idFromPathname("/opportunities/__placeholder__")).toBeUndefined();
    expect(idFromPathname("/opportunities")).toBeUndefined();
    expect(idFromPathname("/dashboard")).toBeUndefined();
    expect(idFromPathname(undefined)).toBeUndefined();
  });
});
