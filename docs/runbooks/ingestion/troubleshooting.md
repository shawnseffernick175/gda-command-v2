# Troubleshooting

Common failure modes and what to check first.

## status = skipped

| status_reason | Cause | Fix |
|---------------|-------|-----|
| `unsupported format: <mime>` | File type has no wired extractor | Add extractor in `lib/extractors/`, register in `index.ts` and `storage.ts` |
| `extraction returned empty text` | Extractor ran but produced no text (e.g. image-only PDF before OCR) | Will resolve with PR 4 (OCR fallback). Check if file is actually empty |
| `recursion depth exceeded` | Nested archive/email at depth > 3 | By design — prevents infinite loops. Flatten the archive |
| `archive size limit exceeded` | Extracted content > 1 GB | Split archive into smaller chunks |
| `archive file count limit exceeded` | Archive has > 500 files | Split archive or increase `MAX_FILES` in `archive.ts` |
| `7z binary not available` | p7zip not installed in container | Add `p7zip` to Dockerfile `apk add` line |

## status = failed

| status_reason | Cause | Fix |
|---------------|-------|-----|
| `OpenAI rate limit` | Too many embedding requests | Wait and retry via `/reprocess-pending`, or check OpenAI quota |
| `extraction failed` | Extractor threw an error | Check backend logs for stack trace: `docker logs gda-backend 2>&1 \| grep ingest_failed` |
| `unable to detect archive format` | Buffer doesn't match any known magic bytes | Verify file isn't corrupted; check MIME detection in `detectMime()` |
| DB connection errors | Pool exhausted or postgres down | Check `docker logs gda-postgres`, verify connection count |

## status = pending (stuck)

Documents should not stay in `pending` for more than a few minutes (for files under 50 MB).

1. **Check if ingestDocument was called:**
   ```bash
   docker logs gda-backend 2>&1 | grep '<DOC_ID>'
   ```

2. **Check if file exists on disk:**
   ```sql
   SELECT uf.storage_key, uf.original_name
   FROM uploaded_files uf
   JOIN knowledge_documents kd ON kd.file_id = uf.id
   WHERE kd.id = '<DOC_ID>';
   ```
   Then verify: `docker exec gda-backend ls /var/uploads/gda/<storage_key>`

3. **Manually re-trigger:**
   ```bash
   curl -s -X POST "http://${BACKEND_IP}:3001/api/knowledge/reprocess-pending" \
     -H "x-gda-key: <key>"
   ```

4. **Check if MIME type is extractable:**
   ```bash
   docker logs gda-backend 2>&1 | grep 'ingest_skipped'
   ```

## Child documents not appearing

1. **Check parent extraction result:**
   ```bash
   docker logs gda-backend 2>&1 | grep 'ingest_child_created'
   ```

2. **Verify children in DB:**
   ```sql
   SELECT id, title, status, status_reason, parent_document_id
   FROM knowledge_documents
   WHERE parent_document_id = '<PARENT_ID>';
   ```

3. **Common causes:**
   - Email has no attachments (no children expected)
   - Archive is empty or contains only directories
   - Depth limit reached (check for `ingest_depth_exceeded` in logs)
   - Child file too large (> 200 MB, silently skipped)

## Embedding failures

1. **Check OPENAI_API_KEY is set:**
   ```bash
   docker exec gda-backend printenv OPENAI_API_KEY | head -c 8
   ```

2. **Check rate limits:**
   ```bash
   docker logs gda-backend 2>&1 | grep -i 'rate\|429\|quota'
   ```

3. **Re-embed specific document:**
   The `/reprocess-pending` endpoint picks up documents in `pending` status. To re-embed a failed document, reset its status:
   ```sql
   UPDATE knowledge_documents SET status = 'pending', status_reason = NULL WHERE id = '<DOC_ID>';
   ```
   Then trigger `/reprocess-pending`.

## Performance

| Symptom | Check |
|---------|-------|
| Slow extraction | Large file? Check `file_size_bytes`. PDF/DOCX over 100 MB can take 30+ seconds |
| Slow embedding | Check OpenAI response times in logs. Chunk count affects total time |
| High memory | Large archives extract all members into memory. Check `archive_max_bytes` logs |
| Container restart loop | Check `docker logs gda-backend` for crash stack. May be OOM or migration failure |
