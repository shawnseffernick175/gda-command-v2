import type { GDAEnvelope, GDAError } from "@gda/shared";

/**
 * Build a success envelope following the standard GDA response contract.
 */
export function successEnvelope<T>(
  workflow: string,
  action: string,
  data: T,
  meta: Record<string, unknown> = {},
  dryRun = false
): GDAEnvelope<T> {
  return {
    success: true,
    workflow,
    action,
    dryRun,
    data,
    meta: { generatedAt: new Date().toISOString(), source: "gateway", ...meta },
    error: null,
  };
}

/**
 * Build an error envelope following the standard GDA response contract.
 */
export function errorEnvelope(
  workflow: string,
  action: string,
  error: GDAError,
  meta: Record<string, unknown> = {},
  dryRun = false
): GDAEnvelope<null> {
  return {
    success: false,
    workflow,
    action,
    dryRun,
    data: null,
    meta: { generatedAt: new Date().toISOString(), source: "gateway", ...meta },
    error,
  };
}

/**
 * Build a "not configured" envelope for endpoints that require
 * env vars that are missing. Mirrors the v1 gateway pattern.
 */
export function notConfiguredEnvelope(
  workflow: string,
  action: string,
  missing: string[],
  meta: Record<string, unknown> = {}
): GDAEnvelope<null> & { configured: boolean } {
  return {
    success: true,
    workflow,
    action,
    dryRun: false,
    data: null,
    configured: false,
    meta: {
      generatedAt: new Date().toISOString(),
      source: "gateway",
      missing,
      hint: "Set the listed env vars in .env to enable this endpoint.",
      ...meta,
    },
    error: null,
  };
}
