/**
 * Sentinel event summarizer — F-309
 *
 * Takes raw event JSON (error, cron miss, API throttle, auth failure)
 * and produces a plain-English sentence suitable for the Sentinel UI.
 * Uses the llmRouter 'sentinel_summary' task.
 */

import { llmRouter } from '../../lib/llm-router.js';
import type { SentinelSummaryInput, SentinelSummaryOutput } from '../../lib/llm-router.types.js';

export interface RawSentinelEvent {
  alert_type: string;
  component: string;
  details: string;
  log_lines?: string[];
  error_code?: number;
  source_key?: string;
}

export interface SummarizedEvent {
  title: string;
  context: string;
  severity: 'info' | 'warning' | 'critical';
  action_label: string | null;
  action_url: string | null;
}

/**
 * sentinel.summarize_event(event_json) -> plain_english_sentence
 *
 * Produces a plain-language summary with no jargon (no ECONNRESET,
 * no 401, no stale_lag_seconds, no schema_drift in user-facing text).
 */
export async function summarizeEvent(event: RawSentinelEvent): Promise<SummarizedEvent> {
  const input: SentinelSummaryInput = {
    alert_type: event.alert_type,
    component: event.component,
    details: event.details,
    recent_log_lines: event.log_lines ?? [],
  };

  try {
    const result = await llmRouter.route<'sentinel_summary'>({
      task: 'sentinel_summary',
      input,
    });

    if (result.ok) {
      const output = result.output as SentinelSummaryOutput;
      return {
        title: output.root_cause,
        context: output.recommended_fix,
        severity: output.severity,
        action_label: deriveActionLabel(event, output),
        action_url: deriveActionUrl(event),
      };
    }

    // LLM failed — fall back to deterministic summary
    return deterministicSummary(event);
  } catch {
    // Any error — fall back to deterministic summary
    return deterministicSummary(event);
  }
}

/**
 * Deterministic fallback when LLM is unavailable.
 * Produces plain English without raw error codes.
 */
function deterministicSummary(event: RawSentinelEvent): SummarizedEvent {
  const severity = deriveSeverityFromType(event.alert_type, event.error_code);
  const title = buildPlainTitle(event);
  const context = buildPlainContext(event);

  return {
    title,
    context,
    severity,
    action_label: deriveActionLabel(event, { severity, root_cause: title, recommended_fix: context, affected_components: [] }),
    action_url: deriveActionUrl(event),
  };
}

function deriveSeverityFromType(alertType: string, errorCode?: number): 'info' | 'warning' | 'critical' {
  if (alertType === 'auth_failure' || alertType === 'secret_expiry') return 'critical';
  if (alertType === 'rate_limit' || alertType === 'cron_miss') return 'warning';
  if (errorCode && errorCode >= 500) return 'critical';
  if (errorCode === 429 || errorCode === 401 || errorCode === 403) return 'warning';
  return 'info';
}

function buildPlainTitle(event: RawSentinelEvent): string {
  const component = event.component || 'System';

  switch (event.alert_type) {
    case 'rate_limit':
      return `${component} is being throttled — requests are being rate-limited`;
    case 'auth_failure':
      return `${component} authentication failed — sync is paused`;
    case 'cron_miss':
      return `${component} scheduled job did not run on time`;
    case 'api_error':
      return `${component} encountered an API error`;
    case 'secret_expiry':
      return `${component} credentials are expiring soon`;
    case 'connection_failure':
      return `${component} cannot connect to its data source`;
    default:
      return `${component} reported an issue that needs attention`;
  }
}

function buildPlainContext(event: RawSentinelEvent): string {
  const component = event.component || 'the system';

  switch (event.alert_type) {
    case 'rate_limit':
      return `Slow down requests to ${component} or wait for the rate limit to reset.`;
    case 'auth_failure':
      return `Check that the credentials for ${component} are still valid and have not been revoked.`;
    case 'cron_miss':
      return `The scheduled sync for ${component} was expected but did not execute. Check if the service is running.`;
    case 'api_error':
      return `${component} returned an unexpected error. This may resolve on the next retry.`;
    case 'secret_expiry':
      return `Rotate the credentials for ${component} before they expire to avoid service interruption.`;
    case 'connection_failure':
      return `${component} is unreachable. Check network connectivity and service availability.`;
    default:
      return event.details || `Review ${component} status for more information.`;
  }
}

function deriveActionLabel(event: RawSentinelEvent, output: SentinelSummaryOutput): string | null {
  switch (event.alert_type) {
    case 'rate_limit':
      if (event.source_key === 'govtribe') return 'Check credit usage';
      return null;
    case 'auth_failure':
      return 'Re-authenticate';
    case 'secret_expiry':
      return 'Rotate credentials';
    case 'cron_miss':
      return null;
    default:
      return output.recommended_fix ? 'View details' : null;
  }
}

function deriveActionUrl(event: RawSentinelEvent): string | null {
  if (event.source_key === 'govtribe' && event.alert_type === 'rate_limit') {
    return 'https://govtribe.com/account/billing';
  }
  return null;
}
