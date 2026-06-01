# RAG Knowledge Base (F-301)

## Overview

The RAG (Retrieval-Augmented Generation) knowledge base provides vector-search grounding for GDA Command's Cognition Layer. Every agent analysis is backed by retrievable, citable, OU-tagged, evidence-graded document chunks stored in pgvector alongside the existing Postgres database.

## Architecture

| Component | Technology |
|---|---|
| Storage | pgvector extension on `gda-postgres-staging` |
| Embeddings | `text-embedding-3-large` (2000 dims) via OpenAI API |
| Chunking | Semantic chunking with 400-600 token targets, 50-token overlap |
| Backend | Fastify routes in `apps/backend-v3/src/routes/rag.ts` |
| Frontend | React surface at `/knowledge-base` |

## Schema

Two tables in the V3 database:

- **`kb_documents`** — Source documents (PDF, DOCX, PPTX, etc.) with doc_type, OU tag, evidence grade, SHA256 dedup.
- **`kb_chunks`** — Embedded text chunks with `vector(2000)` column and HNSW index for fast cosine similarity search.

Migration: `db/v3/migrations/v3_020_kb_documents_and_chunks.sql`

## API Endpoints

All endpoints are prefixed with `/v3/rag/` and wrapped in the standard GDA envelope.

| Method | Path | Description |
|---|---|---|
| `POST` | `/v3/rag/ingest` | Ingest a document (base64-encoded file) |
| `POST` | `/v3/rag/search` | Semantic search over chunks |
| `GET` | `/v3/rag/status` | System status (doc count, chunk count, pgvector version) |
| `GET` | `/v3/rag/documents` | List documents (filterable by `ou`, `doc_type`) |
| `GET` | `/v3/rag/documents/:id` | Get single document |
| `GET` | `/v3/rag/documents/:id/chunks` | Get document chunks |
| `DELETE` | `/v3/rag/documents/:id` | Delete document (cascades to chunks) |
| `POST` | `/v3/rag/reingest/:id` | Re-chunk and re-embed a document |

### Ingest Request

```json
{
  "source_filename": "AJ_Doctrine.pdf",
  "source_url": "https://...",
  "doc_type": "ceo_doctrine",
  "ou_tag": "gda",
  "evidence_grade": "A",
  "title": "CEO Operational Doctrine",
  "file_base64": "<base64-encoded file>"
}
```

### Search Request

```json
{
  "query": "What are AJ's 8 doctrine principles?",
  "ou_filter": "gda",
  "doc_type_filter": "ceo_doctrine",
  "top_k": 8,
  "min_score": 0.5
}
```

## Document Types

`ceo_doctrine`, `business_plan`, `capabilities`, `past_performance`, `cpar`, `workflow_spec`, `rfp`, `proposal_draft`, `capture_plan`, `partner_intel`, `financial`, `news_article`, `meeting_transcript`, `sow`, `awarded_contract`, `other`

## Evidence Grades

- **A** — Primary source (CEO docs, official contracts, signed proposals)
- **B** — Secondary source (meeting notes, workflow specs, partner intel)
- **C** — Hypothesis / unverified (draft documents, catch-all uploads)

## OU Tags

- `gda` — GDA corporate/enterprise level
- `envision` — OU-I (Defense & Mission Systems)
- `pds` — OU-III (PD Systems)
- `riverstone` — OU-II (Riverstone Solutions)

## Initial Corpus Ingestion

```bash
# Set environment
export DATABASE_URL=postgresql://...
export OPENAI_API_KEY=...

# Run ingestion
npx tsx scripts/ingest_initial_corpus.ts /path/to/corpus
```

The script is idempotent (SHA256 dedup) and can be safely re-run.

## Supported File Types

PDF, DOCX, PPTX, XLSX, MD, TXT, EML, MSG

## Re-embedding / Model Upgrade

Each document records its `embed_model_version`. If the model changes:

1. Update the `EMBED_MODEL` constant in `services/rag/embeddings.ts`
2. Call `POST /v3/rag/reingest/:id` per document to re-embed with the new model
3. Dimension validation prevents silent mismatches (vector(2000) constraint)

## Frontend

The Knowledge Base admin UI at `/knowledge-base` provides:

- Document listing with filters (doc_type, OU tag)
- Document metadata display (filename, type, OU, grade, chunk count, upload date)
- Re-ingest and delete actions per document
- Semantic search interface for testing query quality
