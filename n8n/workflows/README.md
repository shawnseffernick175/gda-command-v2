# n8n Workflow Version Control

This directory stores exported n8n workflow JSON files for version control.
Workflows run on the live n8n instance at `n8n.csr-llc.tech` — this repo
is the source of truth for workflow definitions.

## Import Procedure

1. Open n8n admin UI
2. Go to **Workflows** → **Import from File**
3. Select the `.json` file
4. Review the imported workflow — verify credentials are mapped correctly
5. Activate the workflow

## Phase 2C: Unified pgvector Migration

### Architecture

All vectors live in one table: `document_embeddings` (extended with
`collection` and `metadata` columns in migration 125). No parallel
`vector_embeddings` table — the backend already writes here via
`embedDocument()`, and n8n writer workflows now write here too via
`POST /api/internal/vector-upsert`.

### Collection → Pinecone Namespace Mapping

| Pinecone Namespace | `collection` Column |
|--------------------|---------------------|
| *(default)* | `knowledge` |
| `gda-documents` | `gda-documents` |
| `general` | `general` |
| `financial` | `financial` |
| `competitive_intel` | `competitive_intel` |
| *(none — ai-assistant index)* | `ai-agent-attachments` |

Existing rows default to `collection = 'knowledge'` (backend writes).

### Endpoint

```
POST https://<backend-host>/api/internal/vector-upsert
```

### Auth

Header: `x-gda-key: <GDA_WEBHOOK_KEY value>`

### Body

```json
{
  "collection": "gda-documents",
  "items": [
    {
      "id": "doc-123_chunk_0",
      "content": "The text that was embedded",
      "embedding": [0.123, -0.456, ...],
      "metadata": {
        "document_id": "doc-123",
        "chunk_index": 0,
        "source": "uploaded-file.pdf",
        "file_type": "pdf"
      }
    }
  ]
}
```

Fields in `metadata` that have dedicated columns (`document_id`,
`chunk_index`, `page_number`, `section_title`, `token_count`) are
extracted into those columns automatically. Remaining metadata is
stored in the `metadata` JSONB column.

### Workflow Inventory

| # | Workflow | ID | Pinecone Usage | PR 1 Action |
|---|----------|----|----------------|-------------|
| 1 | GDA.api.rag-query | rii6IYWRxh9TMNjd | Read (query) | No change (PR 2) |
| 2 | GDA.api.doc-compare | dKibEwHO773kehFg | Read (query) | No change (PR 2) |
| 3 | GDA.api.ai-agent-upload | qFKuS53JnToOjnZD | Write (upsert) | Add parallel pgvector write |
| 4 | GDA.api.export-engine | VxK95EhAJW1o48cS | Read (query) | No change (PR 2) |
| 5 | GDA.api.doc-ingest | 8UPZHbcTwJstPKAS | Write (upsert) | Add parallel pgvector write |
| 6 | GDA.api.report-builder | RqtftSynjqEKbs9Q | Read (query) | No change (PR 2) |
| 7 | GDA.api.sitrep 2 | G9US1e01oY1cgJIF | Read (query) | No change (PR 2) |

**PR 1**: Workflows 3 and 5 keep their existing Pinecone write nodes
and add a parallel HTTP Request node calling `/api/internal/vector-upsert`.
Both stores receive writes; Pinecone remains source of truth.

**PR 2** (this PR): Server-side read endpoints deployed. Read cutover
for 5 workflows DEFERRED pending Pinecone→pgvector backfill (pgvector
only has vectors from dual-write start date; historical vectors are
Pinecone-only). Backfill plan documented below.

**PR 2b** (follow-up): Execute backfill, verify parity ≥7/10, then cut
over all 5 read workflows.

**PR 3**: Remove Pinecone write nodes from workflows 3 and 5, revoke
Pinecone API key, cancel subscription.

### Exported Workflow Files

| File | Workflow | Status |
|------|----------|--------|
| `gda-api-doc-ingest.json` | GDA.api.doc-ingest | Dual-write active |
| `gda-api-ai-agent-upload.json` | GDA.api.ai-agent-upload | Dual-write active |
| `gda-maint-knowledge-reembed-sweep.json` | GDA.maint.knowledge-reembed-sweep | Active (24h schedule) |

### Workflow 5 (doc-ingest) — Dual-Write Architecture

- **"Embed Chunks"** → outputs to BOTH **"Upsert to Pinecone"** AND **"Upsert to pgvector"**
- pgvector node: HTTP POST to `http://gda-backend:3001/api/internal/vector-upsert`
- Error handling: `onError: "continueRegularOutput"` — Pinecone write is NOT affected by pgvector failures
- Collection mapped from Pinecone namespace (e.g. `gda-documents`, `general`, `financial`)

### Workflow 3 (ai-agent-upload) — Dual-Write Architecture

- **"Auth Guard"** → outputs to BOTH **"Embed for pgvector"** (Code node) AND **"HTTP Request"** (Pinecone path)
- pgvector Code node: Downloads file from URL, chunks text, generates embeddings via OpenAI, calls `/vector-upsert`
- Collection: `default` (these are ad-hoc file uploads, not categorized into namespaces)
- Error handling: `onError: "continueRegularOutput"` on pgvector node AND on Pinecone path nodes
- Note: Pinecone path has a pre-existing pdf-parse v1 dependency issue (langchain loader)

### Knowledge Reembed Sweep

- Runs every 24 hours
- Fetches knowledge documents and re-embeds them to pgvector
- Uses `POST /api/internal/vector-ingest-url` (requires backend deployment of Phase 2C prep PR)
- Collection: `gda-documents`

### HTTP Request Node Configuration (for workflows 3 & 5)

- **Method**: POST
- **URL**: `http://gda-backend:3001/api/internal/vector-upsert` (container-internal)
- **Authentication**: Header `x-gda-key: {{ $env.GDA_WEBHOOK_KEY }}`
- **Body**: JSON with `collection` and `items[]` array
- **Continue On Fail**: `true` (pgvector failure must not break the workflow)

### Read Endpoints (PR 2)

```
POST /api/internal/vector-query
Body: { "collection": "gda-documents", "embedding": [...1536 floats...], "topK": 10, "filter": {} }
Returns: { "data": { "results": [{ "id", "document_id", "chunk_text", "similarity", ... }] } }

POST /api/internal/vector-query-compare (parity debugging only)
Body: { "collection": "gda-documents", "embedding": [...], "topK": 10 }
Returns: { "data": { "pgvector": [...], "pinecone": [...], "overlap": { "top1_match", "top5_overlap", "top10_overlap" } } }

POST /api/internal/vector-fetch
Body: { "ids": ["id1", "id2"] }
Returns: { "data": { "vectors": [{ "id", "document_id", "chunk_text", "chunk_index", ... }] } }

POST /api/internal/vector-list-document
Body: { "collection": "gda-documents", "documentId": "doc-123" }
Returns: { "data": { "vectors": [{ "id", "chunk_index" }] } }
```

### Delete Endpoints

```
POST /api/internal/vector-delete
Body: { "ids": ["id1", "id2"] }

POST /api/internal/vector-delete-by-document
Body: { "documentId": "doc-123" }
```

### Backfill Plan (prerequisite for PR 2b read cutover)

**Problem**: pgvector only has vectors written since dual-write went live
(PR #354 merge). Historical vectors uploaded via n8n before that date
exist only in Pinecone. Read cutover cannot proceed until pgvector has
parity with Pinecone.

**Approach**:
1. Create a one-time n8n export workflow using the existing PineconeApi
   credential (ID `wRjQmgKElTHbBf5J`) to page through all vectors:
   - `POST /vectors/list` (paginate with `paginationToken`) for namespace `gda-documents`
   - `POST /vectors/fetch` in batches of 100 to get full vector data
   - For each batch, POST to `/api/internal/vector-upsert` with `collection: 'gda-documents'`
2. Repeat for namespace `` (default/empty → collection `ai-agent-attachments`)
3. Verify: `SELECT count(*) FROM document_embeddings WHERE collection = 'gda-documents'`
   should match Pinecone's `describe_index_stats` for that namespace
4. Run parity comparison via `/api/internal/vector-query-compare` for 3+ queries
5. If top10_overlap ≥ 7/10 across queries → proceed with workflow cutover

**Blocker**: PINECONE_API_KEY env var (`01dedd34-...`) returns 401.
The actual key is encrypted in n8n's credential store. Backfill must
use n8n's credential (run as n8n workflow) OR obtain valid API key.

### Reader Workflow Response Shape Mapping

When read cutover is executed (PR 2b), each workflow will need a
reshape Function node to convert pgvector response → Pinecone format:

| pgvector field | Pinecone field |
|---------------|----------------|
| `id` | `matches[].id` |
| `similarity` | `matches[].score` |
| `chunk_text` | `matches[].metadata.text` |
| `document_id` | `matches[].metadata.document_id` |
| `chunk_index` | `matches[].metadata.chunk_index` |
| `metadata.source` | `matches[].metadata.source` |
| `metadata.file_type` | `matches[].metadata.file_type` |
| `metadata.filename` | `matches[].metadata.filename` |
| `page_number` | `matches[].metadata.page` |
