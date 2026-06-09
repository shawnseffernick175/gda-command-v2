/**
 * Standard V3 response envelopes per openapi-v3.yaml SuccessEnvelope / ErrorEnvelope.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ANALYSIS_TIMEOUT'
  | 'DRAFT_NOT_READY'
  | 'INTERNAL_ERROR'
  | 'AGENT_UNAVAILABLE'
  | 'WEBHOOK_AUTH_FAILED'
  | 'RATE_LIMITED';

export interface Meta {
  generatedAt: string;
  source: 'v3';
  requestId: string;
}

export interface SuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta: Meta;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    detail: string | null;
  };
  meta: Meta;
}

export function buildMeta(requestId: string): Meta {
  return {
    generatedAt: new Date().toISOString(),
    source: 'v3',
    requestId,
  };
}

export function successEnvelope<T>(data: T, requestId: string): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: buildMeta(requestId),
  };
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  detail: string | null = null
): ErrorEnvelope {
  return {
    success: false,
    error: { code, message, detail },
    meta: buildMeta(requestId),
  };
}
