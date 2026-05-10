// Standard GDA response envelope (per gda-n8n-response-standard.md).
// Every gateway endpoint returns this shape so React/QA Center can rely on it.

function ok(workflow, action, data, meta = {}, dryRun = false) {
  return {
    success: true,
    workflow,
    action,
    dryRun,
    data: data === undefined ? null : data,
    meta: { generatedAt: new Date().toISOString(), source: 'gateway', ...meta },
    error: null,
  };
}

function fail(workflow, action, error, meta = {}, dryRun = false) {
  return {
    success: false,
    workflow,
    action,
    dryRun,
    data: null,
    meta: { generatedAt: new Date().toISOString(), source: 'gateway', ...meta },
    error: typeof error === 'string'
      ? { code: 'ERROR', message: error, retryable: false }
      : { code: 'ERROR', message: 'Unknown error', retryable: false, ...error },
  };
}

// Returned when an endpoint requires env vars that are missing. Not a crash.
function notConfigured(workflow, action, missing, meta = {}) {
  return {
    success: true,
    workflow,
    action,
    dryRun: false,
    data: null,
    configured: false,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'gateway',
      missing,
      hint: 'Set the listed env vars in .env to enable this endpoint.',
      ...meta,
    },
    error: null,
  };
}

module.exports = { ok, fail, notConfigured };
