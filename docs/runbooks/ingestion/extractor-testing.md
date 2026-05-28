# Extractor Testing

How to validate a new extractor end-to-end after deployment.

## 1. Upload a test file

```bash
# Generate a JWT for authentication (run inside gda-backend container)
TOKEN=$(docker exec gda-backend node -e "
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET;
  console.log(jwt.sign({ userId: 'test-user', email: 'test@csr-llc.tech' }, secret, { expiresIn: '1h' }));
")

# Upload via curl (use container IP, port 3001 is not exposed on host)
BACKEND_IP=$(docker inspect gda-backend --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

curl -s -X POST "http://${BACKEND_IP}:3001/api/knowledge/upload" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@/path/to/test-file.zip" \
  | python3 -m json.tool
```

For YAML files, specify the MIME type explicitly:
```bash
curl -s -X POST "http://${BACKEND_IP}:3001/api/knowledge/upload" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@sample.yaml;type=text/yaml"
```

## 2. Verify document status

```sql
-- Check the uploaded document
SELECT id, title, status, status_reason, extraction_method,
       file_size_bytes, chunk_count, parent_document_id,
       created_at, updated_at
FROM knowledge_documents
ORDER BY created_at DESC
LIMIT 10;
```

Expected flow: `pending` → `processing` → `indexed` (or `skipped`/`failed`).

## 3. Verify parent/child linkage (archives and emails)

```sql
-- Find all children of an archive or email
SELECT
  p.id AS parent_id,
  p.title AS parent_title,
  p.status AS parent_status,
  c.id AS child_id,
  c.title AS child_title,
  c.status AS child_status,
  c.file_name AS child_file,
  c.status_reason
FROM knowledge_documents p
JOIN knowledge_documents c ON c.parent_document_id = p.id
WHERE p.id = '<PARENT_DOC_ID>'
ORDER BY c.created_at;
```

```sql
-- Count children per parent
SELECT parent_document_id, count(*) AS child_count
FROM knowledge_documents
WHERE parent_document_id IS NOT NULL
GROUP BY parent_document_id;
```

## 4. Verify embeddings were created

```sql
-- Check embeddings exist for a document
SELECT document_id, count(*) AS chunk_count
FROM document_embeddings
WHERE document_id = '<DOC_ID>'
GROUP BY document_id;
```

## 5. Read ingestion log lines

Filter backend logs for the `ingest_` prefix:

```bash
docker logs gda-backend 2>&1 | grep 'ingest_' | tail -20
```

Key log events:
| Event | Meaning |
|-------|---------|
| `ingest_complete` | Document successfully extracted + embedded |
| `ingest_skipped` | Unsupported format or empty extraction |
| `ingest_failed` | Extraction or embedding error |
| `ingest_child_created` | Child document row inserted (fire-and-forget ingestion started) |
| `ingest_child_error` | Child ingestion failed |
| `ingest_depth_exceeded` | Recursion depth > 3, skipped |
| `archive_max_files` | Archive hit 500-file limit |
| `archive_max_bytes` | Archive hit 1 GB extracted size limit |

## 6. Manually trigger reprocess-pending

```bash
curl -s -X POST "http://${BACKEND_IP}:3001/api/knowledge/reprocess-pending" \
  -H "x-gda-key: <GDA_QA_N8N_API_KEY first 8 chars...>" \
  | python3 -m json.tool
```

This re-ingests any documents stuck in `pending` status that have a file on disk.
