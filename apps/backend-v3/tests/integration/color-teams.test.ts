/**
 * Integration tests for F-Color-Team-Reviews.
 *
 * Tests the full API surface: document upload, run lifecycle,
 * findings retrieval, diff, and action item integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, closeApp, getPool, authHeader, getSeedIds } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let pool: ReturnType<typeof getPool>;

beforeAll(async () => {
  app = await getApp();
  pool = getPool();

  // Ensure feature flag is enabled
  await pool.query(
    `INSERT INTO feature_flags (flag_name, enabled, description)
     VALUES ('color_team_reviews_v1', TRUE, 'test')
     ON CONFLICT (flag_name) DO UPDATE SET enabled = TRUE`
  );
});

afterAll(async () => {
  await closeApp();
});

describe('Color Team Reviews API', () => {
  let documentId: string;
  let runId: string;
  let findingId: string;

  describe('POST /v3/documents', () => {
    it('creates a document', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v3/documents',
        headers: authHeader(),
        payload: {
          filename: 'test-rfp-draft.pdf',
          storage_path: '/uploads/test-rfp-draft.pdf',
          doc_type: 'rfp_draft',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.filename).toBe('test-rfp-draft.pdf');
      documentId = body.data.id;
    });
  });

  describe('GET /v3/documents', () => {
    it('lists documents', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v3/documents',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /v3/documents/:id', () => {
    it('returns document detail', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/documents/${documentId}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe(documentId);
    });

    it('returns 404 for unknown document', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v3/documents/999999',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /v3/color-teams/run', () => {
    it('rejects Gold explicitly', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v3/color-teams/run',
        headers: authHeader(),
        payload: {
          document_id: documentId,
          colors: ['gold'],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('Gold not supported');
      expect(body.error.message).toContain('use Green');
    });

    it('rejects invalid colors', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v3/color-teams/run',
        headers: authHeader(),
        payload: {
          document_id: documentId,
          colors: ['purple'],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects empty colors array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v3/color-teams/run',
        headers: authHeader(),
        payload: {
          document_id: documentId,
          colors: [],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('starts a run with green color', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v3/color-teams/run',
        headers: authHeader(),
        payload: {
          document_id: documentId,
          colors: ['green'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.run_id).toBeDefined();
      runId = String(body.data.run_id);
    });
  });

  describe('GET /v3/color-teams/runs/:id', () => {
    it('returns run status and finding counts', async () => {
      // Wait briefly for async run to complete (stub is fast)
      await new Promise((r) => setTimeout(r, 500));

      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${runId}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe(runId);
      expect(['queued', 'running', 'complete']).toContain(body.data.status);
    });

    it('returns 404 for unknown run', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v3/color-teams/runs/999999',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /v3/color-teams/runs/:id/findings', () => {
    it('returns findings for the run', async () => {
      // Wait for run to complete
      await waitForRunComplete(runId);

      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${runId}/findings`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.findings.length).toBeGreaterThan(0);
      findingId = String(body.data.findings[0].id);
    });

    it('filters by color', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${runId}/findings?color=green`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      for (const f of body.data.findings) {
        expect(f.color).toBe('green');
      }
    });

    it('rejects invalid color filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${runId}/findings?color=gold`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(400);
    });

    it('green findings include doctrine_score, margin_check, exclusion_hits', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${runId}/findings?color=green`,
        headers: authHeader(),
      });
      const body = JSON.parse(res.payload);
      const greenFindings = body.data.findings;
      const doctrineF = greenFindings.find((f: { doctrine_score: unknown }) => f.doctrine_score);
      expect(doctrineF).toBeDefined();
      expect(doctrineF.doctrine_score).toHaveLength(8);
      expect(doctrineF.margin_check).toBeDefined();
      expect(doctrineF.margin_check.pass).toBe(false);
      expect(doctrineF.margin_check.projected_margin).toBe(6.5);
      expect(doctrineF.margin_check.floor).toBe(8);
      expect(doctrineF.exclusion_hits).toContain('EXCL-004');
    });
  });

  describe('POST /v3/color-teams/findings/:id/to-action-item', () => {
    it('creates an action item from a finding', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v3/color-teams/findings/${findingId}/to-action-item`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.action_item_id).toBeDefined();
      expect(body.data.finding_id).toBe(findingId);
    });

    it('rejects duplicate action item link', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v3/color-teams/findings/${findingId}/to-action-item`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /v3/color-teams/documents/:docId/runs', () => {
    it('lists runs for a document', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/documents/${documentId}/runs`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.runs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Diff mode', () => {
    let secondRunId: string;

    it('creates a second run for diff comparison', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v3/color-teams/run',
        headers: authHeader(),
        payload: {
          document_id: documentId,
          colors: ['green'],
        },
      });
      expect(res.statusCode).toBe(201);
      secondRunId = String(JSON.parse(res.payload).data.run_id);
      await waitForRunComplete(secondRunId);
    });

    it('returns diff between two runs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${secondRunId}/diff?against=${runId}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveProperty('new_findings');
      expect(body.data).toHaveProperty('resolved_findings');
      expect(body.data).toHaveProperty('regressed_findings');
      expect(body.data).toHaveProperty('unchanged_findings');
    });

    it('rejects diff without against param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v3/color-teams/runs/${secondRunId}/diff`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

async function waitForRunComplete(id: string, maxWait = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await pool.query<{ status: string }>(
      'SELECT status FROM color_team_runs WHERE id = $1',
      [id]
    );
    if (res.rows[0]?.status === 'complete' || res.rows[0]?.status === 'error') return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
