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

**PR 2**: Cut 5 read workflows from Pinecone to pgvector via
`/api/internal/vector-query`.

**PR 3**: Remove Pinecone write nodes from workflows 3 and 5, revoke
Pinecone API key, cancel subscription.

### HTTP Request Node Configuration (for workflows 3 & 5)

- **Method**: POST
- **URL**: `{{ $env.GDA_BACKEND_URL }}/api/internal/vector-upsert`
- **Authentication**: Header Auth
  - Header Name: `x-gda-key`
  - Header Value: `{{ $env.GDA_WEBHOOK_KEY }}`
- **Body**: JSON, map from the Pinecone upsert node's input
- **Continue On Fail**: `true` (pgvector failure must not break the workflow)
- **Timeout**: 10000 (10s)

### Delete Endpoints

```
POST /api/internal/vector-delete
Body: { "ids": ["id1", "id2"] }

POST /api/internal/vector-delete-by-document
Body: { "documentId": "doc-123" }
```
