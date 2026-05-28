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

## Dual-Write Configuration (Phase 2C)

Seven workflows write vectors to Pinecone. Each needs a parallel HTTP Request
node that writes the same vector to pgvector via the internal API:

### Endpoint

```
POST https://<backend-host>/api/internal/vector-upsert
```

### Auth

Header: `x-gda-key: <GDA_WEBHOOK_KEY value>`

### Body

```json
{
  "collection": "ai-assistant",
  "items": [
    {
      "id": "unique-vector-id",
      "content": "The text that was embedded",
      "embedding": [0.123, -0.456, ...],
      "metadata": {
        "document_id": "source-doc-id",
        "source_type": "proposal",
        "title": "Example Document"
      }
    }
  ]
}
```

### Workflows Requiring Dual-Write Nodes

| # | Workflow | ID | Pinecone Usage |
|---|----------|----|----------------|
| 1 | GDA.api.rag-query | rii6IYWRxh9TMNjd | Read (query) |
| 2 | GDA.api.doc-compare | dKibEwHO773kehFg | Read (query) |
| 3 | GDA.api.ai-agent-upload | qFKuS53JnToOjnZD | Write (upsert) |
| 4 | GDA.api.export-engine | VxK95EhAJW1o48cS | Read (query) |
| 5 | GDA.api.doc-ingest | 8UPZHbcTwJstPKAS | Write (upsert) |
| 6 | GDA.api.report-builder | RqtftSynjqEKbs9Q | Read (query) |
| 7 | GDA.api.sitrep 2 | G9US1e01oY1cgJIF | Read (query) |

**Write workflows (3, 5)** need a parallel HTTP Request node after the
Pinecone upsert node that calls `/api/internal/vector-upsert`.

**Read-only workflows (1, 2, 4, 6, 7)** do NOT need changes in PR 1.
They will be updated in PR 2 when reads switch from Pinecone to pgvector.

### HTTP Request Node Configuration

- **Method**: POST
- **URL**: `{{ $env.GDA_BACKEND_URL }}/api/internal/vector-upsert`
- **Authentication**: Header Auth
  - Header Name: `x-gda-key`
  - Header Value: `{{ $env.GDA_WEBHOOK_KEY }}`
- **Body**: JSON, map from the Pinecone upsert node's input
- **Continue On Fail**: `true` (pgvector failure must not break the workflow)
- **Timeout**: 10000 (10s)

### Delete Endpoint

For workflows that delete vectors:

```
POST /api/internal/vector-delete
Body: { "collection": "ai-assistant", "ids": ["id1", "id2"] }

POST /api/internal/vector-delete-by-document
Body: { "collection": "ai-assistant", "documentId": "doc-123" }
```
