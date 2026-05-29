import { URL } from 'node:url';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';
import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { invalidateAllCaches } from '../services/launchpad/cache.js';

const VALID_KINDS = [
  'sam_gov', 'fpds', 'usaspending', 'govwin',
  'news', 'doctrine', 'partner_site', 'internal',
] as const;

type SourceKind = typeof VALID_KINDS[number];

interface SourceRow {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  retrieved_at: string;
  confidence: string;
  meta: Record<string, unknown>;
  created_at: string;
}

interface CreateSourceBody {
  kind: SourceKind;
  url?: string;
  title?: string;
  confidence?: string;
  meta?: Record<string, unknown>;
}

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fd/i,
  /^fe80/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

async function checkUrlReachable(url: string): Promise<{ reachable: boolean; warning?: string }> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { reachable: false, warning: 'Only http and https URLs are allowed' };
    }

    const hostname = parsed.hostname;
    if (isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        return { reachable: false, warning: 'Private/internal IP addresses are not allowed' };
      }
    } else {
      const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
      if (addresses.some(isPrivateIp)) {
        return { reachable: false, warning: 'Hostname resolves to a private/internal IP' };
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (res.ok) return { reachable: true };
    return { reachable: false, warning: 'URL not reachable' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { reachable: false, warning: `URL unreachable: ${message}` };
  }
}

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/sources', async (req, reply) => {
    const res = await pool.query<SourceRow>(
      `SELECT id::text, kind, url, title, retrieved_at::text,
              confidence, meta, created_at::text
       FROM sources ORDER BY created_at DESC`
    );
    return reply.status(200).send(successEnvelope({ items: res.rows }, req.requestId));
  });

  app.post<{ Body: CreateSourceBody }>('/v3/sources', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId)
      );
    }

    const { kind, url, title, confidence, meta } = body;

    if (!kind || !VALID_KINDS.includes(kind)) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          `Invalid source kind. Must be one of: ${VALID_KINDS.join(', ')}`,
          req.requestId
        )
      );
    }

    let urlWarning: string | undefined;
    if (url) {
      const check = await checkUrlReachable(url);
      if (!check.reachable) {
        urlWarning = check.warning;
        logger.warn({ url, warning: urlWarning }, 'Source URL not reachable');
      }
    }

    const res = await pool.query<SourceRow>(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text, kind, url, title, retrieved_at::text,
                 confidence, meta, created_at::text`,
      [kind, url ?? null, title ?? null, confidence ?? 'high', JSON.stringify(meta ?? {})]
    );

    const source = res.rows[0];
    invalidateAllCaches();

    const responseData: { source: SourceRow; warning?: string } = { source: source! };
    if (urlWarning) {
      responseData.warning = urlWarning;
    }

    return reply.status(201).send(successEnvelope(responseData, req.requestId));
  });

  app.get<{ Params: { id: string } }>('/v3/sources/:id', async (req, reply) => {
    const { id } = req.params;

    const sourceRes = await pool.query<SourceRow>(
      `SELECT id::text, kind, url, title, retrieved_at::text,
              confidence, meta, created_at::text
       FROM sources WHERE id = $1`,
      [id]
    );

    const source = sourceRes.rows[0];
    if (!source) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Source not found', req.requestId)
      );
    }

    const oppCountRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM opportunities WHERE source_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    const capCountRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM captures WHERE source_id = $1`,
      [id]
    );

    return reply.status(200).send(
      successEnvelope(
        {
          source,
          citations: {
            opportunities: parseInt(oppCountRes.rows[0]?.count ?? '0', 10),
            captures: parseInt(capCountRes.rows[0]?.count ?? '0', 10),
          },
          retrieval_history: {
            last_retrieved_at: source.retrieved_at,
            retrieval_count: 1,
            last_error: null,
          },
        },
        req.requestId
      )
    );
  });
}
