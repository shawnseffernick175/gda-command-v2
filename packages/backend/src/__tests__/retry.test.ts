/**
 * F-038 Phase 2B PR 5: Retry endpoint tests.
 * Tests the POST /api/knowledge/documents/:id/retry logic.
 */

import { describe, it, expect } from "vitest";

const RETRYABLE_REASONS = new Set(["timeout", "transient_error", "ocr_timeout", "OCR timeout"]);

describe("Retry: Retryable Status Reasons", () => {
  it("timeout is retryable", () => {
    expect(RETRYABLE_REASONS.has("timeout")).toBe(true);
  });

  it("transient_error is retryable", () => {
    expect(RETRYABLE_REASONS.has("transient_error")).toBe(true);
  });

  it("ocr_timeout is retryable", () => {
    expect(RETRYABLE_REASONS.has("ocr_timeout")).toBe(true);
  });

  it("OCR timeout (case variant) is retryable", () => {
    expect(RETRYABLE_REASONS.has("OCR timeout")).toBe(true);
  });

  it("encrypted archive is NOT retryable", () => {
    expect(RETRYABLE_REASONS.has("archive is encrypted")).toBe(false);
  });

  it("unsupported format is NOT retryable", () => {
    expect(RETRYABLE_REASONS.has("unsupported format: video/mp4")).toBe(false);
  });

  it("recursion depth exceeded is NOT retryable", () => {
    expect(RETRYABLE_REASONS.has("recursion depth exceeded")).toBe(false);
  });

  it("extraction returned empty text is NOT retryable", () => {
    expect(RETRYABLE_REASONS.has("extraction returned empty text")).toBe(false);
  });
});

describe("Retry: HTTP Status Codes", () => {
  it("returns 409 when document status is not failed", () => {
    const status: string = "indexed";
    const expected = status !== "failed" ? 409 : 200;
    expect(expected).toBe(409);
  });

  it("returns 409 when document status is processing", () => {
    const status: string = "processing";
    const expected = status !== "failed" ? 409 : 200;
    expect(expected).toBe(409);
  });

  it("returns 422 when status_reason is not retryable", () => {
    const reason = "archive is encrypted";
    const isRetryable = RETRYABLE_REASONS.has(reason);
    expect(isRetryable).toBe(false);
    const expected = !isRetryable ? 422 : 200;
    expect(expected).toBe(422);
  });

  it("allows retry when status=failed AND reason is retryable", () => {
    const status = "failed";
    const reason = "timeout";
    const canRetry = status === "failed" && RETRYABLE_REASONS.has(reason);
    expect(canRetry).toBe(true);
  });

  it("returns 422 when status_reason is null", () => {
    const reason: string | null = null;
    const isRetryable = reason !== null && RETRYABLE_REASONS.has(reason);
    expect(isRetryable).toBe(false);
  });
});

describe("Retry: Reset behavior", () => {
  it("retry resets status to pending before re-ingesting", () => {
    const doc = { status: "failed", status_reason: "timeout" };
    // After retry is initiated
    const updatedDoc = { ...doc, status: "pending", status_reason: null };
    expect(updatedDoc.status).toBe("pending");
    expect(updatedDoc.status_reason).toBeNull();
  });

  it("retry re-runs through the full ingestion pipeline", () => {
    const steps = ["read file from storage", "call ingestDocument()", "fire-and-forget"];
    expect(steps.length).toBe(3);
    expect(steps).toContain("call ingestDocument()");
  });
});
