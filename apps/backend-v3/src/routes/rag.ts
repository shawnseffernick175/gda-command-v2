import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  ingestFromBuffer,
  reingestDocument,
  search,
  getStatus,
  listDocuments,
  deleteDocument,
  getDocument,
  getDocumentChunks,
} from '../services/rag/index.js';
import type {
  DocType,
  OuTag,
  EvidenceGrade,
  SearchRequest,
} from '../services/rag/types.js';

const VALID_DOC_TYPES: DocType[] = [
  'ceo_doctrine', 'business_plan', 'capabilities', 'past_performance',
  'cpar', 'workflow_spec', 'rfp', 'proposal_draft', 'capture_plan',
  'partner_intel', 'financial', 'news_article', 'meeting_transcript',
  'sow', 'awarded_contract', 'other',
];

const VALID_OU_TAGS: OuTag[] = ['gda', 'envision', 'pds', 'riverstone'];
const VALID_GRADES: EvidenceGrade[] = ['A', 'B', 'C'];

export async function ragRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v3/rag/ingest — ingest a document */
  app.post('/v3/rag/ingest', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      source_filename?: string;
      source_url?: string;
      doc_type?: string;
      ou_tag?: string;
      evidence_grade?: string;
      title?: string;
      metadata?: Record<string, unknown>;
      file_base64?: string;
    } | undefined;

    if (!body?.source_filename || !body.doc_type) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'source_filename and doc_type are required', req.requestId),
      );
    }

    if (!VALID_DOC_TYPES.includes(body.doc_type as DocType)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid doc_type. Valid: ${VALID_DOC_TYPES.join(', ')}`, req.requestId),
      );
    }

    if (body.ou_tag && !VALID_OU_TAGS.includes(body.ou_tag as OuTag)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid ou_tag. Valid: ${VALID_OU_TAGS.join(', ')}`, req.requestId),
      );
    }

    if (body.evidence_grade && !VALID_GRADES.includes(body.evidence_grade as EvidenceGrade)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid evidence_grade. Valid: ${VALID_GRADES.join(', ')}`, req.requestId),
      );
    }

    if (!body.file_base64) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'file_base64 is required (base64-encoded file content)', req.requestId),
      );
    }

    try {
      const fileBuffer = Buffer.from(body.file_base64, 'base64');

      const result = await ingestFromBuffer(fileBuffer, {
        source_filename: body.source_filename,
        source_url: body.source_url,
        doc_type: body.doc_type as DocType,
        ou_tag: body.ou_tag as OuTag | undefined,
        evidence_grade: body.evidence_grade as EvidenceGrade | undefined,
        title: body.title,
        metadata: body.metadata,
      });

      return reply.status(result.status === 'existing' ? 200 : 201).send(
        successEnvelope(result, req.requestId),
      );
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** POST /v3/rag/search — semantic search */
  app.post('/v3/rag/search', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as SearchRequest | undefined;

    if (!body?.query) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'query is required', req.requestId),
      );
    }

    if (body.ou_filter && !VALID_OU_TAGS.includes(body.ou_filter)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid ou_filter. Valid: ${VALID_OU_TAGS.join(', ')}`, req.requestId),
      );
    }

    if (body.doc_type_filter && !VALID_DOC_TYPES.includes(body.doc_type_filter)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid doc_type_filter. Valid: ${VALID_DOC_TYPES.join(', ')}`, req.requestId),
      );
    }

    try {
      const results = await search({
        query: body.query,
        ou_filter: body.ou_filter,
        doc_type_filter: body.doc_type_filter,
        top_k: body.top_k,
        min_score: body.min_score,
      });

      return reply.send(successEnvelope({ results }, req.requestId));
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** GET /v3/rag/status — system status */
  app.get('/v3/rag/status', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await getStatus();
      return reply.send(successEnvelope(status, req.requestId));
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** GET /v3/rag/documents — list documents */
  app.get('/v3/rag/documents', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as {
      ou?: string;
      doc_type?: string;
      limit?: string;
    };

    try {
      const docs = await listDocuments({
        ou: query.ou as OuTag | undefined,
        doc_type: query.doc_type as DocType | undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
      return reply.send(successEnvelope(docs, req.requestId));
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** GET /v3/rag/documents/:id — get a single document */
  app.get('/v3/rag/documents/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const doc = await getDocument(id);
      if (!doc) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', `Document not found: ${id}`, req.requestId),
        );
      }
      return reply.send(successEnvelope(doc, req.requestId));
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** GET /v3/rag/documents/:id/chunks — get document chunks */
  app.get('/v3/rag/documents/:id/chunks', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const chunks = await getDocumentChunks(id);
      return reply.send(successEnvelope(chunks, req.requestId));
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** DELETE /v3/rag/documents/:id — delete a document */
  app.delete('/v3/rag/documents/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const deleted = await deleteDocument(id);
      if (!deleted) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', `Document not found: ${id}`, req.requestId),
        );
      }
      return reply.send(successEnvelope({ deleted: true }, req.requestId));
    } catch (err) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  /** POST /v3/rag/reingest/:id — re-chunk and re-embed a document */
  app.post('/v3/rag/reingest/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const result = await reingestDocument(id);
      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found')) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', message, req.requestId),
        );
      }
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });
}
