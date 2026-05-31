// Smoke test — runs against an unconfigured gateway and verifies it returns the documented "configured:false" envelopes
// and never crashes. No real secrets are needed. Spins up the express app on a random port.

const assert = require('node:assert/strict');

// Force an unconfigured environment so the test exercises the not-configured branches.
delete process.env.N8N_BASE_URL;
delete process.env.GDA_WEBHOOK_KEY;
delete process.env.N8N_API_BASE;
delete process.env.N8N_API_KEY;
process.env.PORT = '0';

const app = require('../src/server');

function req(method, port, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, opts).then(async r => ({
    status: r.status,
    json: await r.json().catch(() => null),
  }));
}

function check(label, ok) {
  const tag = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${label}\n`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const server = app.listen(0);
  await new Promise(resolve => server.on('listening', resolve));
  const { port } = server.address();
  process.stdout.write(`smoke: listening on :${port}\n`);

  try {
    // 1. /health is always 200 and reports config booleans.
    {
      const r = await req('GET', port, '/health');
      check('/health 200', r.status === 200);
      check('/health envelope success:true', r.json && r.json.success === true);
      check('/health webhookConfigured=false', r.json?.data?.config?.webhookConfigured === false);
      check('/health apiConfigured=false', r.json?.data?.config?.apiConfigured === false);
    }

    // 2. /api/qa/health → not configured (no N8N_BASE_URL).
    {
      const r = await req('GET', port, '/api/qa/health');
      check('/api/qa/health 200', r.status === 200);
      check('/api/qa/health configured:false', r.json?.configured === false);
      check('/api/qa/health lists missing N8N_BASE_URL', Array.isArray(r.json?.meta?.missing) && r.json.meta.missing.includes('N8N_BASE_URL'));
    }

    // 3. POST /api/qa/dry-run → not configured.
    {
      const r = await req('POST', port, '/api/qa/dry-run', {});
      check('/api/qa/dry-run 200', r.status === 200);
      check('/api/qa/dry-run configured:false', r.json?.configured === false);
      check('/api/qa/dry-run lists allowed ids', Array.isArray(r.json?.meta?.allowedIds) && r.json.meta.allowedIds.length === 2);
    }

    // 4. POST /api/qa/dry-run with a non-allowed id is rejected (even unconfigured? config check happens first; verify with a configured-style stub by setting just N8N_BASE_URL and an unreachable host).
    //    For the smoke test, we instead verify the unconfigured branch protects us; re-check rejection logic in unit space:
    {
      // Set base URL just for this assertion so dry-run reaches the validation step.
      process.env.N8N_BASE_URL = 'http://127.0.0.1:1';
      const r = await req('POST', port, '/api/qa/dry-run', { ids: ['definitely-not-allowed'] });
      check('/api/qa/dry-run rejects non-allowed id with 400', r.status === 400);
      check('/api/qa/dry-run reject error code NOT_ALLOWED', r.json?.error?.code === 'NOT_ALLOWED');
      delete process.env.N8N_BASE_URL;
    }

    // 5. /api/workflows/registry serves baseline file (no env needed).
    {
      const r = await req('GET', port, '/api/workflows/registry');
      check('/api/workflows/registry 200', r.status === 200);
      check('/api/workflows/registry success:true', r.json?.success === true);
      check('/api/workflows/registry source baseline-file', r.json?.data?.source === 'baseline-file');
      check('/api/workflows/registry has workflows array', Array.isArray(r.json?.data?.workflows) && r.json.data.workflows.length > 0);
    }

    // 6. /api/failures/latest → configured:false (no N8N_API_BASE/KEY).
    {
      const r = await req('GET', port, '/api/failures/latest');
      check('/api/failures/latest 200', r.status === 200);
      check('/api/failures/latest configured:false', r.json?.configured === false);
      check('/api/failures/latest lists missing N8N_API_BASE', Array.isArray(r.json?.meta?.missing) && r.json.meta.missing.includes('N8N_API_BASE'));
      check('/api/failures/latest lists missing N8N_API_KEY', r.json.meta.missing.includes('N8N_API_KEY'));
    }

    // 7. Unknown route returns JSON 404, not HTML.
    {
      const r = await req('GET', port, '/no-such-thing');
      check('unknown route returns 404 JSON', r.status === 404 && r.json?.error?.code === 'NOT_FOUND');
    }
  } finally {
    server.close();
  }

  if (process.exitCode === 1) {
    process.stdout.write('\nsmoke: FAILED\n');
  } else {
    process.stdout.write('\nsmoke: OK\n');
  }
})();
