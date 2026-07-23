/**
 * Color Team Review routes — F-Color-Team-Reviews
 *
 * POST /v3/documents              — upload a document (stub for F-Universal-Ingestion)
 * GET  /v3/documents              — list documents
 * GET  /v3/documents/:id          — get document detail
 * POST /v3/color-teams/run        — kick off a color team run
 * GET  /v3/color-teams/runs/:id   — get run status + per-color counts
 * GET  /v3/color-teams/runs/:id/findings — findings list (optionally filter by color)
 * GET  /v3/color-teams/runs/:id/diff     — diff against a prior run
 * POST /v3/color-teams/findings/:id/to-action-item — push finding to action item tracker
 * GET  /v3/color-teams/documents/:docId/runs — list runs for a document
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import {
  isColorTeamEnabled,
  insertDocument,
  getDocument,
  listDocuments,
  createRun,
  getRun,
  listRunsForDocument,
  getFindings,
  getRunFindingCounts,
  diffRuns,
  getFindingById,
  linkFindingToActionItem,
  executeColorTeamRun,
  isValidColor,
} from '../services/color-teams/index.js';
import type { ColorTeamColor } from '../services/color-teams/types.js';

export async function colorTeamRoutes(app: FastifyInstance): Promise<void> {

  // ── Guard: feature flag ───────────────────────────────────────────────

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/v3/color-teams') && !req.url.startsWith('/v3/documents')) return;
    const enabled = await isColorTeamEnabled(pool);
    if (!enabled) {
      return reply.status(403).send(
        errorEnvelope('UNAUTHORIZED', 'Color Team Reviews feature is not enabled', req.requestId)
      );
    }
  });

  // ── Documents ─────────────────────────────────────────────────────────

  app.post<{
    Body: {
      filename: string;
      mime_type?: string;
      file_size_bytes?: number;
      doc_type?: string;
      storage_path: string;
      opportunity_id?: string;
    };
  }>('/v3/documents', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const { filename, mime_type, file_size_bytes, doc_type, storage_path, opportunity_id } = req.body;
    if (!filename || !storage_path) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'filename and storage_path are required', req.requestId)
      );
    }

    const doc = await insertDocument(pool, {
      filename,
      mime_type: mime_type ?? 'application/pdf',
      file_size_bytes: file_size_bytes ?? null,
      doc_type: doc_type ?? 'unknown',
      storage_path,
      uploaded_by: user.sub,
      opportunity_id: opportunity_id ?? null,
    });

    return reply.status(201).send(successEnvelope(doc, req.requestId));
  });

  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/v3/documents', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const limit = parseInt(req.query.limit ?? '50', 10);
    const offset = parseInt(req.query.offset ?? '0', 10);

    const result = await listDocuments(pool, { limit, offset });
    return reply.send(successEnvelope(result, req.requestId));
  });

  app.get<{
    Params: { id: string };
  }>('/v3/documents/:id', async (req, reply) => {
    const doc = await getDocument(pool, req.params.id);
    if (!doc) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Document not found', req.requestId));
    return reply.send(successEnvelope(doc, req.requestId));
  });

  // ── Runs ──────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      document_id: string;
      colors: string[];
      linked_rfp_id?: string;
    };
  }>('/v3/color-teams/run', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const { document_id, colors, linked_rfp_id } = req.body;

    if (!document_id || !colors || !Array.isArray(colors) || colors.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'document_id and non-empty colors[] are required', req.requestId)
      );
    }

    // Reject Gold explicitly
    if (colors.some((c) => c.toLowerCase() === 'gold')) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Gold not supported; use Green', req.requestId)
      );
    }

    const invalidColors = colors.filter((c) => !isValidColor(c));
    if (invalidColors.length > 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid colors: ${invalidColors.join(', ')}`, req.requestId)
      );
    }

    const doc = await getDocument(pool, document_id);
    if (!doc) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId)
      );
    }

    const run = await createRun(pool, {
      document_id,
      colors: colors as ColorTeamColor[],
      triggered_by: user.sub,
      linked_rfp_id: linked_rfp_id ?? null,
    });

    // Fire-and-forget: execute the run asynchronously (stub pre-F-300)
    executeColorTeamRun(pool, String(run.id)).catch((err) => {
      logger.error({ err, runId: run.id }, 'Background color team run failed');
    });

    return reply.status(201).send(
      successEnvelope({ run_id: run.id, status: run.status }, req.requestId)
    );
  });

  app.get<{
    Params: { id: string };
  }>('/v3/color-teams/runs/:id', async (req, reply) => {
    const run = await getRun(pool, req.params.id);
    if (!run) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Run not found', req.requestId));

    const counts = await getRunFindingCounts(pool, req.params.id);

    return reply.send(successEnvelope({
      ...run,
      finding_counts: counts,
    }, req.requestId));
  });

  app.get<{
    Params: { id: string };
    Querystring: { color?: string };
  }>('/v3/color-teams/runs/:id/findings', async (req, reply) => {
    const run = await getRun(pool, req.params.id);
    if (!run) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Run not found', req.requestId));

    const color = req.query.color;
    if (color && !isValidColor(color)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid color: ${color}`, req.requestId)
      );
    }

    const findings = await getFindings(pool, req.params.id, color);
    return reply.send(successEnvelope({ findings, total: findings.length }, req.requestId));
  });

  app.get<{
    Params: { id: string };
    Querystring: { against: string };
  }>('/v3/color-teams/runs/:id/diff', async (req, reply) => {
    const { against } = req.query;
    if (!against) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'against query parameter is required', req.requestId)
      );
    }

    const currentRun = await getRun(pool, req.params.id);
    const priorRun = await getRun(pool, against);
    if (!currentRun) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Current run not found', req.requestId));
    if (!priorRun) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Prior run not found', req.requestId));

    const diff = await diffRuns(pool, req.params.id, against);
    return reply.send(successEnvelope(diff, req.requestId));
  });

  // ── Findings → Action Items ───────────────────────────────────────────

  app.post<{
    Params: { id: string };
  }>('/v3/color-teams/findings/:id/to-action-item', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const finding = await getFindingById(pool, req.params.id);
    if (!finding) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Finding not found', req.requestId));
    }

    if (finding.action_item_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Finding already linked to an action item', req.requestId)
      );
    }

    // Create source for the action item
    const sourceRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at) VALUES ('color_team', $1, NOW()) RETURNING id`,
      [`Color Team ${finding.color} finding`]
    );
    const sourceId = sourceRes.rows[0]!.id;

    // Create action item from finding
    const aiRes = await pool.query<{ id: string }>(
      `INSERT INTO action_items (title, body, owner_email, status, priority, source_id)
       VALUES ($1, $2, $3, 'open', $4, $5) RETURNING id`,
      [
        `[${finding.color.toUpperCase()}] ${finding.finding.slice(0, 120)}`,
        `${finding.finding}\n\nRecommended fix: ${finding.recommended_fix ?? 'N/A'}\n\nSection: ${finding.section_ref ?? 'N/A'}`,
        user.sub,
        finding.severity === 'blocker' || finding.severity === 'critical' ? 'high' : 'normal',
        sourceId,
      ]
    );

    await linkFindingToActionItem(pool, req.params.id, aiRes.rows[0]!.id);

    return reply.status(201).send(
      successEnvelope({ action_item_id: aiRes.rows[0]!.id, finding_id: req.params.id }, req.requestId)
    );
  });

  // ── Document runs listing ─────────────────────────────────────────────

  app.get<{
    Params: { docId: string };
  }>('/v3/color-teams/documents/:docId/runs', async (req, reply) => {
    const runs = await listRunsForDocument(pool, req.params.docId);
    return reply.send(successEnvelope({ runs, total: runs.length }, req.requestId));
  });

  // ── PDF Export ──────────────────────────────────────────────────────────

  app.get<{
    Params: { id: string };
  }>('/v3/color-teams/runs/:id/export.pdf', async (req, reply) => {
    const run = await getRun(pool, req.params.id);
    if (!run) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Run not found', req.requestId));

    const findings = await getFindings(pool, req.params.id);
    const counts = await getRunFindingCounts(pool, req.params.id);
    const doc = await getDocument(pool, String(run.document_id));

    const html = generatePdfHtml(run, findings, counts, doc);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="color-team-review-${run.id}.pdf"`)
      .send(html);
  });
}

function generatePdfHtml(
  run: { id: string | number; colors: string[]; status: string; started_at: string; completed_at: string | null },
  findings: Array<{
    color: string;
    severity: string;
    section_ref: string | null;
    finding: string;
    recommended_fix: string | null;
    citations: Array<{ source: string; url: string; grade: string }>;
    doctrine_score: Array<{ principle: string; score: number; detail: string }> | null;
    exclusion_hits: string[] | null;
    margin_check: { projected_margin: number; floor: number; pass: boolean; source?: string } | null;
    pricing_strategy: {
      status: string;
      sourced_facts: Array<{ label: string; value: string; source: string }>;
      recommendations: string[];
      missing_inputs: string[];
    } | null;
  }>,
  counts: Array<{ color: string; count: number }>,
  doc: { filename: string } | null,
): string {
  const colorLabels: Record<string, string> = {
    pink: 'Pink - Storyboard Review',
    red: 'Red - Proposal Evaluation',
    black: 'Black Hat - Competitor Simulation',
    blue: 'Blue - Customer Perspective',
    white: 'White - Compliance Sweep',
    green: 'Green - Executive / Final Pass',
  };

  const severityColors: Record<string, string> = {
    info: '#38bdf8',
    warning: '#f59e0b',
    critical: '#A12C7B',
    blocker: '#ff4444',
  };

  const findingsByColor = new Map<string, typeof findings>();
  for (const f of findings) {
    const arr = findingsByColor.get(f.color) ?? [];
    arr.push(f);
    findingsByColor.set(f.color, arr);
  }

  let sectionsHtml = '';
  for (const color of run.colors) {
    const colorFindings = findingsByColor.get(color) ?? [];
    const count = counts.find((c) => c.color === color)?.count ?? 0;

    sectionsHtml += `<div style="margin-top:24px;border:1px solid #D4D1CA;border-radius:4px;padding:20px;">`;
    sectionsHtml += `<h2 style="color:#01696F;margin:0 0 12px 0;font-size:16px;">${colorLabels[color] ?? color} (${count} findings)</h2>`;

    for (const f of colorFindings) {
      const sevColor = severityColors[f.severity] ?? '#7A7974';
      sectionsHtml += `<div style="border-left:3px solid ${sevColor};padding:8px 12px;margin:8px 0;background:#FAFAF8;">`;
      sectionsHtml += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">`;
      sectionsHtml += `<span style="background:${sevColor};color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;">${f.severity.toUpperCase()}</span>`;
      if (f.section_ref) sectionsHtml += `<span style="color:#7A7974;font-size:12px;">${f.section_ref}</span>`;
      sectionsHtml += `</div>`;
      sectionsHtml += `<p style="margin:4px 0;font-size:13px;color:#28251D;">${f.finding}</p>`;
      if (f.recommended_fix) {
        sectionsHtml += `<p style="margin:4px 0;font-size:12px;color:#7A7974;"><strong>Fix:</strong> ${f.recommended_fix}</p>`;
      }
      if (f.citations.length > 0) {
        const citeHtml = f.citations
          .map((c) => `<span style="background:#01696F20;color:#01696F;padding:1px 4px;border-radius:2px;font-size:11px;">[${c.grade}] ${c.source}</span>`)
          .join(' ');
        sectionsHtml += `<div style="margin-top:4px;">${citeHtml}</div>`;
      }
      sectionsHtml += `</div>`;
    }

    if (color === 'green') {
      const greenFinding = colorFindings.find(
        (f) => f.margin_check || f.pricing_strategy || (f.doctrine_score && f.doctrine_score.length > 0)
      );
      if (greenFinding?.doctrine_score && greenFinding.doctrine_score.length > 0) {
        sectionsHtml += `<div style="margin-top:12px;border:1px solid #D4D1CA;border-radius:4px;padding:12px;">`;
        sectionsHtml += `<h3 style="margin:0 0 8px 0;font-size:14px;color:#01696F;">Doctrine Alignment Scorecard</h3>`;
        sectionsHtml += `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;
        sectionsHtml += `<tr style="border-bottom:1px solid #D4D1CA;"><th style="text-align:left;padding:4px;">Principle</th><th style="text-align:right;padding:4px;">Score</th><th style="text-align:left;padding:4px 4px 4px 12px;">Detail</th></tr>`;
        for (const ds of greenFinding.doctrine_score) {
          sectionsHtml += `<tr style="border-bottom:1px solid #F0EFEC;"><td style="padding:4px;">${ds.principle}</td><td style="text-align:right;padding:4px;">${ds.score}/100</td><td style="padding:4px 4px 4px 12px;color:#7A7974;">${ds.detail}</td></tr>`;
        }
        sectionsHtml += `</table></div>`;
      }
      if (greenFinding?.margin_check) {
        const mc = greenFinding.margin_check;
        const mcColor = mc.pass ? '#22c55e' : '#ff4444';
        sectionsHtml += `<div style="margin-top:8px;padding:8px 12px;border-left:3px solid ${mcColor};background:#FAFAF8;">`;
        sectionsHtml += `<strong>Margin Check:</strong> ${mc.projected_margin}% projected vs ${mc.floor}% floor &mdash; <span style="color:${mcColor};font-weight:600;">${mc.pass ? 'PASS' : 'FAIL'}</span>`;
        sectionsHtml += `</div>`;
      }
      if (greenFinding?.exclusion_hits && greenFinding.exclusion_hits.length > 0) {
        sectionsHtml += `<div style="margin-top:8px;padding:8px 12px;border-left:3px solid #ff4444;background:#FFF5F5;">`;
        sectionsHtml += `<strong style="color:#ff4444;">Exclusion Hits:</strong> ${greenFinding.exclusion_hits.join(', ')} &mdash; Executive override required`;
        sectionsHtml += `</div>`;
      }
      const ps = greenFinding?.pricing_strategy;
      if (ps) {
        sectionsHtml += `<div style="margin-top:12px;border:1px solid #D4D1CA;border-radius:4px;padding:12px;">`;
        sectionsHtml += `<h3 style="margin:0 0 8px 0;font-size:14px;color:#01696F;">Pricing Strategy${ps.status === 'unavailable' ? ' (inputs incomplete)' : ''}</h3>`;
        if (ps.sourced_facts.length > 0) {
          sectionsHtml += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">`;
          for (const fact of ps.sourced_facts) {
            sectionsHtml += `<tr style="border-bottom:1px solid #F0EFEC;"><td style="padding:4px;">${fact.label}</td><td style="text-align:right;padding:4px;font-weight:600;">${fact.value}</td><td style="padding:4px 4px 4px 12px;color:#7A7974;">${fact.source}</td></tr>`;
          }
          sectionsHtml += `</table>`;
        }
        if (ps.recommendations.length > 0) {
          sectionsHtml += `<div style="font-size:12px;color:#28251D;"><strong>Recommendations:</strong><ul style="margin:4px 0;padding-left:18px;">${ps.recommendations.map((r) => `<li>${r}</li>`).join('')}</ul></div>`;
        }
        if (ps.missing_inputs.length > 0) {
          sectionsHtml += `<div style="font-size:12px;color:#7A7974;"><strong>Inputs required:</strong><ul style="margin:4px 0;padding-left:18px;">${ps.missing_inputs.map((m) => `<li>${m}</li>`).join('')}</ul></div>`;
        }
        sectionsHtml += `</div>`;
      }
    }

    sectionsHtml += `</div>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:Inter,system-ui,sans-serif;margin:32px;color:#28251D;max-width:900px;}
h1{color:#01696F;font-size:20px;margin-bottom:4px;}
.meta{color:#7A7974;font-size:12px;margin-bottom:16px;}
</style></head>
<body>
<h1>Color Team Review &mdash; Run #${run.id}</h1>
<div class="meta">
Document: ${doc?.filename ?? 'Unknown'} | Status: ${run.status} | Started: ${run.started_at}${run.completed_at ? ` | Completed: ${run.completed_at}` : ''}
</div>
<div class="meta">Colors: ${run.colors.join(', ')} | Total findings: ${findings.length}</div>
${sectionsHtml}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #D4D1CA;color:#7A7974;font-size:11px;">
Generated by GDA Command &mdash; Color Team Review Engine
</div>
</body>
</html>`;
}
