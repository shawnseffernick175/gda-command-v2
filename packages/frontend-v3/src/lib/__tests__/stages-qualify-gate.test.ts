import { describe, it, expect } from "vitest";
import { isQualifyRequiredError, stageMoveErrorMessage } from "@/lib/stages";

describe("isQualifyRequiredError", () => {
  it("matches the QUALIFY_REQUIRED error code", () => {
    expect(isQualifyRequiredError({ code: "QUALIFY_REQUIRED", status: 409 })).toBe(true);
  });

  it("matches a bare 409 status (backwards compatible)", () => {
    expect(isQualifyRequiredError({ status: 409 })).toBe(true);
  });

  it("does not match other errors", () => {
    expect(isQualifyRequiredError({ code: "VALIDATION_ERROR", status: 400 })).toBe(false);
    expect(isQualifyRequiredError(null)).toBe(false);
    expect(isQualifyRequiredError(new Error("boom"))).toBe(false);
  });
});

describe("stageMoveErrorMessage", () => {
  it("gives a qualify-first hint on 409", () => {
    expect(stageMoveErrorMessage({ status: 409, message: "not relevant" })).toMatch(/qualify/i);
  });

  it("falls back to a generic message otherwise", () => {
    expect(stageMoveErrorMessage({ status: 500, message: "server" })).toMatch(/Failed to move/i);
  });
});
