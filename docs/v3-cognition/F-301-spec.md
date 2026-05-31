# F-301 — RAG Knowledge Base (Cognition Layer foundation)

**Phase:** Cognition Layer — Track A
**Depends on:** none — can run fully in parallel with F-300
**Required by:** F-300 (agent calls `rag_search`), F-Opp-Auto-Analysis, F-Color-Team-Reviews, F-Capability-Matching, F-Doctrine-Check, F-Briefing-Generator, F-Capture-Plan-Generator, F-Win-Theme-Generator

---

## Objective

Build the vector-search knowledge base over Shawn's full GDA corpus so the agent can ground every analysis in retrievable, citable, OU-tagged, evidence-graded chunks.

Without this, the agent hallucinates. With this, every claim cites a source the user can click.

---

## Architecture

**Storage:** `pgvector` extension on existing Postgres (`gda-postgres-staging`).
**Embeddings model:** `text-embedding-3-large` (3072 dims) — quality > cost.
**Chunking:** semantic chunking with overlap (target 400-600 tokens per chunk, 50-token overlap).
**Ingestion:** runs as a job in `gda-agent-v3` (reuse runtime).

---

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_documents (
  id UUID PRIMARY KEY,
  source_filename TEXT NOT NULL,
  source_url TEXT,                  -- e.g., S3 URL or upload URL
  doc_type TEXT NOT NULL,           -- 'ceo_doctrine', 'business_plan', 'capabilities', 'past_performance', 'cpar', 'workflow_spec', 'rfp', 'proposal_draft', 'capture_plan', 'partner_intel', 'financial', 'news_article', 'meeting_transcript', 'sow', 'awarded_contract', 'other'
  ou_tag TEXT,                       -- 'gda', 'envision' (OU3), 'pds' (OU1), 'riverstone' (OU2), or null
  evidence_grade CHAR(1),            -- 'A' primary, 'B' secondary, 'C' hypothesis
  title TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_chunked_at TIMESTAMPTZ,
  chunk_count INT DEFAULT 0,
  byte_size INT,
  sha256 CHAR(64) UNIQUE,            -- dedup
  metadata JSONB                      -- doc-type-specific extras (contract #, agency, POP, etc.)
);

CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(3072) NOT NULL,
  token_count INT,
  page_number INT,                   -- if PDF/PPTX
  section_title TEXT,                -- e.g., 'OU3 Risk Register'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX kb_chunks_embedding_idx ON kb_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX kb_chunks_doc_idx ON kb_chunks(document_id);
CREATE INDEX kb_documents_type_ou ON kb_documents(doc_type, ou_tag);
```

---

## Minimum corpus at V3 completion (Track A success criteria)

This is the corpus the agent MUST have ingested before any agentic surface is allowed to go live.

### CEO / Strategy
- [ ] `1_AJ_Insight-Into-Future.pdf` — doc_type=ceo_doctrine, ou=gda, grade=A
- [ ] `2_AJ-Strat-Op-Plan.pdf` — doc_type=ceo_doctrine, ou=gda, grade=A
- [ ] `3_-AJ-OP-Doctorine.pdf` — doc_type=ceo_doctrine, ou=gda, grade=A
- [ ] `4_Meeting_Op-Doctrine-and-Strategic-Vision-transcript.pdf` — doc_type=meeting_transcript, ou=gda, grade=B
- [ ] `5_AJ_Business-Plan-Slides.pdf` — doc_type=business_plan, ou=gda, grade=A
- [ ] `6_GDA_Business_Plan_FY26_FY28_0408-26.pptx` — doc_type=business_plan, ou=gda, grade=A
- [ ] `7_GDA_Business_Plan_FY26_FY28_0408-26.docx` — doc_type=business_plan, ou=gda, grade=A (the definitive FY26-FY28 plan)

### Doctrine canonical chunks (synthetic; pulled from doc 3)
- [ ] 8 Principles (Alignment, Ethics Always, Teamwork, Data First Then Debate, Relentless Execution, Relationships Relationships Relationships, Market Mission Brand Focus, Customer Facing) — one chunk per principle, doc_type=ceo_doctrine, grade=A
- [ ] 6 Strategic Exclusions — one chunk each, doc_type=ceo_doctrine, grade=A
- [ ] 8% margin floor rule — one chunk, doc_type=ceo_doctrine, grade=A
- [ ] Evidence A/B/C rubric — one chunk, doc_type=ceo_doctrine, grade=A

### Envision OU3 operational
- [ ] OU3 Capabilities Statement (5 core offerings) — synthesized from business plan, grade=A
- [ ] OU3 Past Performance Library (IEW&S SETA, TRADOC/FORSCOM, PEO C3T) — grade=A (when CPARs sourced)
- [ ] Active Contract Portfolio (IEW&S SETA $54M, TRADOC/FORSCOM $25M+, PEO C3T $11M) — grade=A
- [ ] Must-Win Pursuits (MAPS, 63rd BSB Recompete, IEW&S SETA Recompete RS3-25-0034, BAMBOOTIGER) — grade=A
- [ ] Vehicle Portfolio (RS3, EAGLE, TACOM TS3 ERS, TSS-E, SeaPort-NxG, GSA PSS, OASIS+, Polaris, CIO-SP3, MDA SHIELD) — grade=A
- [ ] Key Accounts (CECOM C5ISR, PEO STRI, TRADOC, PEO C3T, MDA) — grade=B

### V1/V2 workflow archive
- [ ] All 28 V1/V2 workflow specs from `feb_apr_uploads/` (capture-plan, opp-tracker, morning-briefing-v1, launchpad-funnel, dashboard-mega, deep-research, pwin-calculator, opp-classifier, intel-feed, recompete-early-warning, win-rate-weekly-digest, idiq-task-order-alert, teaming-scorer, learning-engine, win-loss-db, capture-milestone-alerts, weekly-comp-scan, + others) — doc_type=workflow_spec, ou=envision, grade=B (architectural reference)

### Catch-all
- [ ] Every PDF / DOCX / PPTX / XLSX Shawn has uploaded since Feb (any file under `feb_apr_uploads/` or `uploaded_attachments/`) that doesn't fit above buckets — doc_type='other', grade=C until reviewed

---

## HTTP surface (extends gda-agent-v3)

```
POST /rag/ingest
  body: { source_filename, source_url?, doc_type, ou_tag?, evidence_grade?, title?, file_bytes? OR file_url }
  response: { document_id, chunk_count, status }

POST /rag/search
  body: { query, ou_filter?, doc_type_filter?, top_k=8, min_score?=0.5 }
  response: { results: [{ chunk_id, chunk_text, document_id, source_filename, source_url, doc_type, evidence_grade, page_number, section_title, score }] }

GET /rag/status
  response: { documents: int, chunks: int, last_ingest: timestamp, pgvector_version: str, embed_model: str }

GET /rag/documents?ou=...&doc_type=...&limit=...
  response: list of documents with chunk counts

DELETE /rag/documents/:id
  response: 200 (cascades to chunks)

POST /rag/reingest/:id
  response: re-chunks and re-embeds a document (used when chunking strategy improves)
```

---

## Acceptance criteria

### Schema + extension
- [ ] `pgvector` extension installed on `gda-postgres-staging`
- [ ] All tables created via versioned migration
- [ ] HNSW index built on `kb_chunks.embedding`
- [ ] Migration is idempotent and reversible

### Ingestion
- [ ] `POST /rag/ingest` accepts PDF, DOCX, PPTX, XLSX, MD, TXT, EML, MSG
- [ ] PDF chunking preserves page numbers
- [ ] PPTX chunking preserves slide numbers
- [ ] Tables extracted from PPTX/DOCX as separate chunks with `section_title='table'`
- [ ] SHA256 dedup: re-uploading the same file does NOT duplicate (returns existing document_id)
- [ ] OCR fallback for image-only PDFs (use tesseract or OpenAI Vision)
- [ ] Failed ingestion records the error and does not leave partial chunks

### Minimum corpus ingested
- [ ] All 7 CEO docs ingested (run inspection: `SELECT doc_type, count(*) FROM kb_documents WHERE doc_type IN ('ceo_doctrine','business_plan','meeting_transcript') GROUP BY 1;` returns ≥7 rows total)
- [ ] All 28 V1/V2 workflow specs ingested
- [ ] OU3 capabilities + past performance + contracts + must-wins canonical chunks present
- [ ] Doctrine 8 principles + 6 exclusions + margin floor + evidence rubric as discrete chunks

### Search quality
- [ ] `POST /rag/search` with `{ query: "What are AJ's 8 doctrine principles?" }` returns 8 chunks, one per principle, with score > 0.7
- [ ] `POST /rag/search` with `{ query: "GDA strategic exclusions", ou_filter: "gda" }` returns the 6 exclusions
- [ ] `POST /rag/search` with `{ query: "IEW&S SETA recompete competitors", ou_filter: "envision" }` returns OST Inc., capability statement, and past performance chunks
- [ ] Filter by ou_filter works (chunks tagged 'envision' only)
- [ ] Filter by doc_type_filter works
- [ ] Every result includes a clickable source_url and evidence_grade

### UI surface
- [ ] Admin page `/v3/knowledge-base` lists every ingested document
- [ ] Each document shows: filename, doc_type, ou_tag, grade, chunk_count, uploaded_at, source_url
- [ ] "Re-ingest" button per document
- [ ] "Delete" button per document with confirmation
- [ ] Search box that calls `/rag/search` and shows ranked chunks for sanity testing
- [ ] Filterable by doc_type and ou_tag

### Performance
- [ ] `rag_search` returns top-8 within 500ms for a corpus of 10K chunks (single-query latency, p95)
- [ ] Concurrent search (10 parallel queries) does not exceed 2s p95
- [ ] Embedding generation: batch 100 chunks at a time to OpenAI

### Container-level
- [ ] `curl http://gda-agent-v3:8001/rag/status` returns 200 with non-zero counts after initial ingest
- [ ] DB query `SELECT count(*) FROM kb_chunks;` returns ≥ chunks expected from minimum corpus (estimate: 1500+ chunks from CEO docs alone)
- [ ] `psql ... -c "\\d+ kb_chunks"` shows HNSW index present

### Re-embedding / model upgrade path
- [ ] Each `kb_documents` row records `embed_model_version`
- [ ] If model changes (e.g., to text-embedding-4), `POST /rag/reingest/:id` re-embeds with new model
- [ ] No silent vector-dimension mismatch (validation on insert)

### Test coverage
- [ ] Unit tests: chunking, dedup, OCR fallback
- [ ] Integration test: ingest the 7 CEO docs, run 10 representative queries, assert expected results
- [ ] Integration test: re-ingest is idempotent
- [ ] Integration test: cascade delete removes chunks

---

## Non-negotiables

- Container-level verification on every AC
- Every chunk traces back to a source document with a clickable URL
- Evidence grade is on every chunk via the document
- OU tag is on every chunk via the document
- pgvector chosen over external vector DB to keep one source of truth (Postgres)
- No "good enough" — if a doc fails to ingest, fix it; do not silently skip

---

## Deliverables

- PR titled `feat(F-301): RAG knowledge base — pgvector + ingest + search + admin UI`
- Files added: `services/gda-agent-v3/rag/` (Python module), `apps/frontend-v3/src/pages/KnowledgeBase.tsx`
- Migration: `migrations/v3_NNN_kb_documents_and_chunks.sql`
- Initial ingestion script: `services/gda-agent-v3/scripts/ingest_initial_corpus.py` that reads from `/data/initial_corpus/` and ingests
- Documentation: `services/gda-agent-v3/RAG.md`

---

## Initial corpus location

Files for initial ingestion are at:
- `/home/user/workspace/uploaded_attachments/7299a35a7e4541c58b664ca83fa830b4/` (the 7 CEO docs)
- `/home/user/workspace/feb_apr_uploads/` (V1/V2 archive)

Shawn will copy these to the VPS at `/srv/gda-agent-v3/initial_corpus/` before triggering the ingestion script. The script is idempotent so it can be re-run safely.
