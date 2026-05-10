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
    meta: { ...meta, respondedAt: new Date().toISOString() },
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
    meta: { ...meta, respondedAt: new Date().toISOString() },
    error,
  };
}
