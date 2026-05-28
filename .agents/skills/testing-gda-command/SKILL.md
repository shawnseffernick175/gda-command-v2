---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Environment Setup

### Local Development
- Frontend: `http://localhost:3000` (SvelteKit)
- Backend: `http://localhost:3001` (Express/Node)
- Database: PostgreSQL at `localhost:5432/gda_command`
- Start backend with: `DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command AUTH_REQUIRED=false JWT_SECRET=dev-secret-key OPENAI_API_KEY=$OPENAI_API_KEY GDA_WEBHOOK_KEY=test-webhook-key npm run dev` (from `packages/backend`)
- Start frontend with: `npm run dev` (from `packages/frontend`)
- Auth is disabled in dev (`AUTH_REQUIRED=false`) but the login page still appears — use `admin@gda-command.local` / `admin123`

### Production
- URL: `https://gda.csr-llc.tech`
- Deploy via: `docker-compose -f docker-compose.prod.yml up -d --build` on the production server
- SSH may be needed to run migrations on the production database

### Database Notes
- The `description` column may not exist locally — run `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description TEXT;` if backend returns empty results
- The `capture_stage` column stores explicit Shipley stage overrides — check it exists if stage dropdown tests fail
- Run pending migrations from `packages/backend/src/db/migrations/` if features are missing
- PostgreSQL returns NUMERIC columns as strings — always use `Number()` for comparisons in backend code
- Test data: 5 seeded opportunities (opp-test-001 through opp-test-005) plus ~42 n8n webhook-injected opportunities

### Port Management
- If port 3001 is already in use: `ss -tlnp | grep 3001` to find the PID, then `kill <PID>`
- `lsof` may not be available — use `ss` instead

## Devin Secrets Needed
- `PROD_SSH_KEY` — SSH key for production server access
- `OPENAI_API_KEY` — for AI analysis features (OODA, Capture Coach, AI Gateway summarizer)
- `N8N_API_KEY` — for n8n workflow management API (GET/PUT workflows, check executions)
- `GDA_WEBHOOK_KEY` — for n8n webhook-level auth and internal API endpoints

## Key Testing Flows

### n8n Workflow Dual-Write (Phase 2C)

**Architecture:** Workflows 3 (ai-agent-upload) and 5 (doc-ingest) write to BOTH Pinecone AND `document_embeddings` table via `/api/internal/vector-upsert`.

**Dual-layer auth pattern for n8n webhooks:**
n8n webhooks have TWO auth layers:
1. **Webhook-level auth** (n8n credential "GDA Webhook Auth v2"): Header `x-gda-key` with value = `GDA_WEBHOOK_KEY` env var
2. **Workflow Auth Guard code node**: Checks `x-gda-auth` header (or `x-gda-key`, or `body.auth_key`) against workflow-specific valid keys

You must send BOTH headers simultaneously:
```bash
curl -X POST "http://<VPS_IP>:5678/webhook/<path>" \
  -H "Content-Type: application/json" \
  -H "x-gda-key: <GDA_WEBHOOK_KEY>" \
  -H "x-gda-auth: <WORKFLOW_AUTH_KEY>" \
  -d '{...}'
```

**IMPORTANT — Different workflows accept different Auth Guard keys:**
- Workflow 5 (doc-ingest, path: `gda-ingest-direct`): Accepts `GDA_WEBHOOK_SECRET_2026` in `x-gda-auth`
- Workflow 3 (ai-agent-upload, path: `upload`): Only accepts `GDA_DEPLOY_KEY_2026` or `GDA_API_KEY_2026` (NOT `GDA_WEBHOOK_SECRET_2026`)
- Always read the Auth Guard code node to confirm which keys are valid before triggering

**Workflow 5 (doc-ingest) test payload:**
```json
{
  "file_url": "https://example.com/test.txt",
  "file_type": "txt",
  "document_id": "test-dual-write-001",
  "metadata": {"source": "devin-test"}
}
```

**Workflow 3 (ai-agent-upload) test payload:**
```json
{
  "attachments": [{
    "url": "https://example.com/test.txt",
    "name": "test-file.txt"
  }]
}
```

**Verifying dual-write results:**
```sql
-- Check new rows landed in document_embeddings
SELECT id, collection, document_id, embedding IS NOT NULL as has_embedding, created_at
FROM document_embeddings
WHERE collection IN ('gda-documents','general','financial','competitive_intel','default')
ORDER BY created_at DESC LIMIT 10;

-- Collection mapping:
-- Workflow 5 writes to: 'gda-documents' (matches Pinecone namespace)
-- Workflow 3 writes to: 'ai-agent-attachments' (maps to Pinecone ai-assistant index)
```

**Checking execution status:**
```bash
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "http://<VPS_IP>:5678/api/v1/executions?workflowId=<ID>&limit=5"
```

**Common dual-write issues:**
- Empty curl response with responseMode="responseNode": Workflow errored before reaching Respond node. Check executions API for error status.
- Auth Guard "Unauthorized" error: Wrong key for that specific workflow. Check Auth Guard jsCode.
- 403 at webhook level: Wrong value in `x-gda-key` header (needs GDA_WEBHOOK_KEY, not a 2026 key).
- pgvector write failure doesn't block Pinecone: Both dual-write nodes have `onError: "continueRegularOutput"`.

### Sentinel Health Check
**Endpoint:** `GET /api/sentinel/current` (no auth required)
**Access from VPS:**
```bash
ssh root@<VPS_IP> "docker exec gda-backend node -e \"
  const http = require('http');
  const opts = { hostname: 'localhost', port: 3001, path: '/api/sentinel/current', method: 'GET' };
  const req = http.request(opts, (res) => {
    let d = ''; res.on('data', c => d+=c); res.on('end', () => console.log(d));
  });
  req.end();
\""
```
**Expected:** 9 components, at least 8 healthy. `writers_24h` may show degraded during testing due to auth failures in test executions.

### Knowledge Reembed Sweep
**Workflow ID:** Check via n8n API (name: `GDA.maint.knowledge-reembed-sweep`)
**Verify configuration:**
- Active = true
- Fetch Documents node: NO `authentication`/`genericAuthType` params (these cause silent failure). Manual `x-gda-key` header in `headerParameters` instead.
- Schedule Trigger: 24-hour interval

### W6: Capture Discipline Dashboard
**Test procedure:**
1. Navigate to `/capture-discipline` via sidebar (Intelligence > Capture Discipline)
2. Verify KPI cards: Active Opportunities, With Gate Reviews, Overdue, At Risk
3. Verify Stage Funnel bar chart (Interest, Pursue, Won stages)
4. Verify Gate Review Summary matrix (5 gates × 5 statuses)
5. Verify Guardrail Alerts section

### W6: Guardrail Check API
**Test procedure:**
1. `POST /api/capture-discipline/check-guardrails/opp-test-003` — should return overdue alert (critical) since due_date is 2025-04-01
2. Verify `checked: 4` (all 4 guardrail rules evaluated)
3. Verify score=45 does NOT trigger missing_score (Number() fix)
4. Reload `/capture-discipline` — At Risk metric should update
5. Guardrail 4 (stage_without_gate) uses allowlist: only `["passed", "waived"]` gate statuses suppress the alert

### W8: AI Gateway
**Test procedure:**
1. Navigate to `/ai-gateway` via sidebar
2. Verify status cards: Status=Online, Fast Model=gpt-4o
3. Type text into summarizer textarea, click Summarize
4. Verify 3-sentence summary appears, Recent Activity table updates
5. `GET /api/ai-gateway/status` — verify `available: true`, `fast_model: "gpt-4o"`

**Notes:**
- Summarizer requires OPENAI_API_KEY to be set
- LLM may fall back to Anthropic ("deep" tier); actual tier returned in `result.tier`
- Usage logging stores tier from `result.tier`, not the requested tier

### W5: Opportunity Detail Tabs
**Test procedure:**
1. Navigate to any opportunity detail (e.g., `/opportunities/opp-test-001`)
2. Click through all 5 tabs: Overview, Analysis, Intelligence, Strategy, History
3. **History tab is critical** — it queries `record_version` table for timeline data
4. Verify Activity Timeline shows events and Version History shows version entries

### Sidebar Navigation — All Sprint v3 Pages
**Test procedure:**
1. Click each new nav item in sidebar:
   - Vehicles → `/vehicles` (W1)
   - Data Sources → `/sources` (W2)
   - M&A Context → `/mergers` (W4)
   - Capture Discipline → `/capture-discipline` (W6)
   - AI Gateway → `/ai-gateway` (W8)
2. Verify each page loads without error (no NotFound page)

### OpsTracker Stage Dropdown (capture_stage)
**Why adversarial:** Multiple Shipley stages map to the same DB status. "Solicitation" and "Post Submittal" both map to `"pipeline"`. Without the `capture_stage` fix, `statusToShipley("pipeline")` returns `"pursue"`, silently reverting the user's choice.

**Test procedure:**
1. Navigate to `/ops-tracker`
2. Find an opportunity (e.g., opp-004)
3. Change dropdown to "Solicitation" — wait for page data refresh
4. Press F5 for full page reload
5. Verify dropdown still shows "Solicitation" (not "Pursue")
6. Repeat with "Post Submittal" — same verification
7. Click the opportunity row to open `/opportunities/{id}`
8. Verify the detail page dropdown matches the OpsTracker dropdown

**What to check in HTML:** The `<select>` element's `selectedindex` attribute and the `selected="true"` option value.

### KPI Strip
- Should show exactly 5 KPIs: Orders, Sales, EBIT, Gross Profit, ROS
- Values should be real Q1 FY2026 data (not placeholder/mock)
- Each KPI has a drill-down on click

### No Bid Filtering
- Default OpsTracker view should NOT show "No Bid" opportunities
- "No Bid" filter option exists in the status dropdown for explicit viewing
- Expired opportunities (past due date) should be "No Bid", not "Lost"

### Knowledge Base Upload & Auto-Vectorize (F-038)
**Upload basics:**
- 27 document types available in dropdown
- 7 action options (Store & Index, Ingest into Financial Bible, etc.)
- Selecting "Financials" type auto-sets action to "Ingest into Financial Bible"
- XLSX files may arrive as `application/octet-stream` MIME type — the backend has extension-based fallback

**Auto-vectorize test procedure:**
1. Upload test files via API (faster than UI for batch testing):
   ```bash
   curl -s -X POST http://localhost:3001/api/knowledge/upload \
     -F "file=@/tmp/test-fixtures/test-vectorize.pdf" \
     -F "type=memo" -F "collection=col-contracts" -F "action=store" -F "tags=test,pdf"
   ```
2. Response should show `"status": "processing"` and `"message": "Document uploaded and vectorization started."`
3. Wait ~15 seconds for async background vectorization to complete
4. Verify in DB:
   ```sql
   SELECT file_name, status, chunk_count FROM knowledge_documents WHERE file_name LIKE 'test-%';
   ```
   All should show `status='indexed'` with `chunk_count >= 1`
5. Navigate to Knowledge UI → Semantic Search tab → search for content from uploaded files

**File types to test:** PDF, DOCX, XLSX, PPTX, TXT, HTML, JSON, YAML, EML, MSG

**Test fixtures:** Create minimal test files at `/tmp/test-fixtures/` before testing. The backend expects real file content — empty files will get `status='skipped'`.

**Common auto-vectorize issues:**
- `pdf-parse` library API may change between versions — if PDFs get stuck in `processing`, check backend logs for `pdf_parse_error`
- Status stuck at `processing` usually means the extraction threw silently — check backend logs
- Requires `OPENAI_API_KEY` env var for embeddings — without it, `isEmbeddingAvailable()` returns false
- Port 3001 is NOT exposed on VPS host — reach API via container IP. Get IP with: `docker inspect gda-backend --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'`

### Knowledge Base UI Testing (F-038 PR 5+)

**Route:** `/knowledge` (sidebar: Intelligence > Knowledge Base)

**What to verify:**
1. **Status badges** — color-coded: indexed=green (#22c55e), processing=gold (#f59e0b), failed=red (#ef4444), skipped=purple (#a855f7). Non-indexed docs show AlertCircle icon + status_reason text inline.
2. **Format icons** — MIME→lucide-react mapping: Mail (EML/MSG), Archive (ZIP/TAR/7Z), Image (PNG/JPG/TIFF), FileText (PDF/TXT/DOCX), FileSpreadsheet (XLSX), Presentation (PPTX), Braces (JSON), Globe (HTML), Code (XML/YAML). If all icons look the same, the DocFormatIcon component may not be wired into DocumentRow.
3. **Child nesting** — Parent docs with children show ChevronRight + "N children" badge (#6366f1). Clicking chevron expands children with 24px indentation per depth level. Children inherit parent's collection/tags.
4. **Retry button** — RotateCcw icon appears ONLY on `status='failed'` + `status_reason IN ('timeout','transient_error','ocr_timeout')`. Does NOT appear on non-retryable failures or skipped docs.
5. **Bulk upload** — "+ Upload" button opens modal. Multi-file picker via drag-drop or click. Pre-upload list shows per-file size + format icon + remove button. Upload hits `POST /api/knowledge/bulk-upload` (207 Multi-Status). Per-file results show in modal. After close, new docs appear in list.
6. **Child selection state** — Clicking a child row selects IT (blue border + tint), not the parent. Detail panel on right shows child's metadata. This was a Devin Review fix (changed `isSelected` boolean prop to `selectedDocId` string comparison).

**Seeding test data for UI verification:**
```sql
-- Parent with children (email attachment pattern)
INSERT INTO knowledge_documents (id, file_name, original_name, mime_type, file_size, status, collection_id, tags, created_at, updated_at)
VALUES ('doc-parent-test', 'test-email.eml', 'test-email.eml', 'message/rfc822', 26000, 'indexed', 'col-contracts', '["test","eml"]', NOW(), NOW());

INSERT INTO knowledge_documents (id, file_name, original_name, mime_type, file_size, status, parent_document_id, collection_id, tags, created_at, updated_at)
VALUES ('doc-child-1', 'attachment.pdf', 'attachment.pdf', 'application/pdf', 102400, 'indexed', 'doc-parent-test', 'col-contracts', '["test"]', NOW(), NOW());

-- Failed retryable
INSERT INTO knowledge_documents (id, file_name, original_name, mime_type, file_size, status, status_reason, created_at, updated_at)
VALUES ('doc-failed-retry', 'failed-doc.txt', 'failed-doc.txt', 'text/plain', 1024, 'failed', 'timeout', NOW(), NOW());

-- Failed non-retryable
INSERT INTO knowledge_documents (id, file_name, original_name, mime_type, file_size, status, status_reason, created_at, updated_at)
VALUES ('doc-failed-noretry', 'encrypted.zip', 'encrypted.zip', 'application/zip', 51200, 'failed', 'archive is encrypted', NOW(), NOW());

-- Skipped
INSERT INTO knowledge_documents (id, file_name, original_name, mime_type, file_size, status, status_reason, created_at, updated_at)
VALUES ('doc-skipped', 'noise.png', 'noise.png', 'image/png', 8192, 'skipped', 'OCR returned no meaningful text', NOW(), NOW());
```

**Bulk upload via Playwright CDP (workaround for native file picker):**
The browser's native file picker dialog cannot be controlled via computer-use tools. Use Playwright CDP to set files on the hidden `<input type="file">` element:
```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const page = browser.contexts()[0].pages()[0];
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(['/tmp/test-fixtures/file1.txt', '/tmp/test-fixtures/file2.json']);
  await browser.close();
})();
```
Install Playwright first: `mkdir -p /home/ubuntu/pw-test && cd /home/ubuntu/pw-test && npm init -y && npm i playwright`

**Common Knowledge Base UI issues:**
- Migration 124 columns (`status_reason`, `parent_document_id`, `extraction_method`) may not exist locally — apply manually via `ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS ...`
- Document list is sorted by `created_at DESC` by default — newly seeded/uploaded docs appear at top
- The document list container scrolls independently — if test data is offscreen, scroll within the list panel (not the page)
- Stats cards at top (DOCUMENTS, INDEXED, etc.) count from DB — seeded test data with `status='indexed'` increments both DOCUMENTS and INDEXED counts
- `chunk_count` in the list comes from a LEFT JOIN on `document_embeddings` — seeded docs without embeddings show "0 chunks"
- Upload modal file count header says "N file(s) selected" — verify this matches the number of files set via Playwright

### Vector Read Endpoints (Phase 2C PR 2)

**Endpoints:** All require `x-gda-key` header matching `GDA_WEBHOOK_KEY` env var.
- `POST /api/internal/vector-query` — cosine similarity search
- `POST /api/internal/vector-query-compare` — queries both pgvector AND Pinecone, returns overlap
- `POST /api/internal/vector-fetch` — fetch vectors by ID array
- `POST /api/internal/vector-list-document` — list vector IDs for a document

**VPS testing setup:**
```bash
# Get the auth key from the backend container
export VPS_KEY=$(ssh root@100.100.80.78 "docker exec gda-backend printenv GDA_WEBHOOK_KEY")
# All curl commands must go through SSH since port 3001 is not exposed on host
ssh root@100.100.80.78 "curl -s -X POST http://172.22.0.3:3001/api/internal/vector-query ..."
```

**Critical: Keep VPS_KEY in the same shell session.** If you run tests across multiple shell sessions, re-export the key in each one or you'll get 401 errors.

**Test procedure (insert → query → verify → cleanup):**
1. Insert test vector via `/vector-upsert` with known embedding (e.g., all 0.1 values, 1536 dims)
2. Query with same embedding → expect top result with `similarity: 1.0`
3. Query different collection → expect test vector NOT present (collection isolation)
4. Validation checks: missing collection→400, wrong dim→400, topK=0→400
5. Auth checks: no key→401, wrong key→401
6. `vector-query-compare` for knowledge collection → 200 (proves namespace mapping works)
7. `vector-fetch` with known IDs → returns full vector records
8. `vector-list-document` → returns `{id, chunk_index}` only (NOT document_id in response)
9. Cleanup: delete test vector via `/vector-delete`

**Collection→namespace mapping (Pinecone):**
- `knowledge` → empty string `""` (Pinecone default namespace)
- `ai-agent-attachments` → empty string `""` (Pinecone ai-assistant index, no namespace)
- `gda-documents` → `"gda-documents"`

**Common pitfalls:**
- `vector-list-document` returns `{id, chunk_index}` — do NOT expect `document_id` in the response
- Pinecone comparison may return 0 results if `PINECONE_API_KEY` env var is stale/invalid — this is a known issue, not a test failure
- Backend container IP might change — verify with: `docker inspect gda-backend --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'`
- Embedding arrays must be exactly 1536 dimensions — anything else returns 400 `INVALID_EMBEDDING`

### Vector Read Endpoints (Phase 2C PR 2)

**Endpoints:** All require `x-gda-key` header matching `GDA_WEBHOOK_KEY` env var.
- `POST /api/internal/vector-query` — cosine similarity search
- `POST /api/internal/vector-query-compare` — queries both pgvector AND Pinecone, returns overlap
- `POST /api/internal/vector-fetch` — fetch vectors by ID array
- `POST /api/internal/vector-list-document` — list vector IDs for a document

**VPS testing setup:**
```bash
# Get the auth key from the backend container
export VPS_KEY=$(ssh root@<VPS_IP> "docker exec gda-backend printenv GDA_WEBHOOK_KEY")
# All curl commands must go through SSH since port 3001 is not exposed on host
ssh root@<VPS_IP> "curl -s -X POST http://172.22.0.3:3001/api/internal/vector-query ..."
```

**Critical: Keep VPS_KEY in the same shell session.** If you run tests across multiple shell sessions, re-export the key in each one or you'll get 401 errors.

**Test procedure (insert → query → verify → cleanup):**
1. Insert test vector via `/vector-upsert` with known embedding (e.g., all 0.1 values, 1536 dims)
2. Query with same embedding → expect top result with `similarity: 1.0`
3. Query different collection → expect test vector NOT present (collection isolation)
4. Validation checks: missing collection→400, wrong dim→400, topK=0→400
5. Auth checks: no key→401, wrong key→401
6. `vector-query-compare` for knowledge collection → 200 (proves namespace mapping works)
7. `vector-fetch` with known IDs → returns full vector records
8. `vector-list-document` → returns `{id, chunk_index}` only (NOT document_id in response)
9. Cleanup: delete test vector via `/vector-delete`

**Collection→namespace mapping (Pinecone):**
- `knowledge` → empty string `""` (Pinecone default namespace)
- `ai-agent-attachments` → empty string `""` (Pinecone ai-assistant index, no namespace)
- `gda-documents` → `"gda-documents"`

**Common pitfalls:**
- `vector-list-document` returns `{id, chunk_index}` — do NOT expect `document_id` in the response
- Pinecone comparison may return 0 results if `PINECONE_API_KEY` env var is stale/invalid — this is a known issue, not a test failure
- Backend container IP might change — verify with: `docker inspect gda-backend --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'`
- Embedding arrays must be exactly 1536 dimensions — anything else returns 400 `INVALID_EMBEDDING`

### Postgres Role & Privilege Testing (F-020 pattern)

**When to use:** After creating or modifying DB roles, running privilege grants, or testing least-privilege configurations.

**Staging vs production access:**
- Staging: `psql -h localhost -p 5432 -U gda -d gda` (from Devin dev environment, password in `DATABASE_URL`)
- Production: `ssh root@<VPS_IP> "docker exec -i gda-postgres psql -U gda -d gda"` (via SSH + docker exec)

**Dual-path migration testing:**
1. Run migration on staging first: verify it applies cleanly
2. Check privilege state after migration:
   ```sql
   -- List all roles
   SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE 'pg_%';
   -- Check table privileges for a role
   SELECT table_schema, table_name, privilege_type FROM information_schema.table_privileges WHERE grantee = 'gda_runtime';
   -- Check default privileges
   SELECT * FROM pg_default_acl WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'gda');
   ```
3. Verify the app still works with the restricted role: restart backend with `DATABASE_URL` pointing to the restricted user
4. Run migrations on production only after staging passes

**Common privilege issues:**
- `permission denied for table X`: Role lacks SELECT/INSERT/UPDATE/DELETE on that table. Grant with: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE X TO role_name;`
- New tables created by migrations don't automatically inherit grants: Use `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ... TO role_name;` BEFORE creating tables, or grant explicitly after.
- `GRANT ALL` is too broad: Use explicit privilege lists (SELECT, INSERT, UPDATE, DELETE) for least-privilege.
- Sequences: If a table has serial/identity columns, the role also needs `USAGE, SELECT` on the associated sequence.

### Financial Bible
- Monthly trend charts (Revenue, Orders, Profitability, Cost Breakdown)
- YTD vs Annual Target progress bars with pace markers
- Monthly breakdown table with Jan/Feb/Mar actuals
- Variance analysis with month-over-month changes

## Common Issues
- **Backend returns empty results:** Check `DATABASE_URL` env var is set, and required columns exist
- **Stage dropdown reverts after reload:** The `capture_stage` column or the frontend `opp.capture_stage ?? statusToShipley(opp.status)` logic may be missing
- **XLSX upload fails:** Check MIME type handling — extension-based fallback should handle `application/octet-stream`
- **Health tab errors:** Check for missing columns in agent queries (e.g., `summary` column)
- **401 errors on pages:** JWT token may have expired — check auto-refresh logic
- **PostgreSQL NUMERIC as string:** pg driver returns NUMERIC columns as strings. Use `Number()` for all numeric comparisons in backend code (e.g., `Number(row.score) === 0` not `row.score === 0`)
- **Backend won't start:** Ensure all required env vars are exported: DATABASE_URL, AUTH_REQUIRED, JWT_SECRET, OPENAI_API_KEY, GDA_WEBHOOK_KEY
- **Port 3001 in use:** Use `ss -tlnp | grep 3001` to find PID, then kill it. `lsof` might not be available.
- **Session expiration during testing:** Log in once and use sidebar navigation to stay in the SPA. Direct URL navigation may trigger session expiry.
- **n8n webhook 403:** Wrong value in `x-gda-key` header. Needs GDA_WEBHOOK_KEY (the long hex hash), not a 2026 deploy/api key.
- **n8n Auth Guard "Unauthorized":** The `x-gda-auth` value doesn't match the workflow's valid keys. Read the Auth Guard code node to see which env vars it checks — they differ per workflow.
- **Dual-write rows missing:** Check n8n execution status. If pgvector node errored, it won't block Pinecone but no row appears. Check backend logs for the internal endpoint error.
