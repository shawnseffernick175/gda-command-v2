# F-304: Universal Ingestion — Drag-Drop on Every Door + Email-In + Auto-Classify

## Status
**Queued** — depends on F-300 (Agent Runtime) and F-301 (RAG Corpus) merging first. Do NOT add `devin-ready` until F-300 + F-301 are merged to main.

## Why this exists (verbatim from Shawn)
> "Universal Ingestion (drag-drop every door + email-in, .msg/.eml unpack, auto-classify and route)"

Today the tool has fragmented upload paths (Capture has one, Action Items has another, Opportunity Detail has none). Email forwarding doesn't exist. .msg / .eml attachments are opaque blobs. Shawn loses context every time he has to manually decide where a doc belongs.

## Objective

Make every surface accept any document, email, or .msg/.eml in two ways:
1. **Drag-drop zone** on every primary door (Launchpad, Opportunities, Pipeline, Capture, Partner Intel, Action Items, Daily News, Sentinel)
2. **Email-in address** per surface (e.g. `capture+envision@gda.csr-llc.tech`) that accepts forwarded mail and unpacks attachments

After ingest, the Agent Runtime (F-300) classifies the doc and routes it to the right surface with a draft action item. The user confirms or corrects classification — corrections feed F-302 Decision Memory.

## Hard rules

1. **Universal acceptance** — no surface is allowed to reject a file type. PDF, DOCX, XLSX, PPTX, MSG, EML, TXT, MD, RTF, HTML, images (OCR), audio (transcribe), video (transcribe + key-frame OCR).
2. **No silent failures** — every upload returns a tracked ingest_job_id. User can see status at `/v3/ingest/jobs/:id`.
3. **R1 source citations** — every extracted fact carries a source reference back to the original file + page/line/cell.
4. **Doctrine-routed** — classifier respects Envision-only scope (F-303). Docs flagged as OU1/OU2 are tagged read-only "teaming context" not "qualified pursuit."
5. **PII-safe** — no doc body is sent to external LLMs without redaction pass (SSN, DoB, full names of cleared personnel).

## Acceptance criteria

### Backend
- [ ] `POST /v3/ingest/upload` — multipart accepts any file type, returns `ingest_job_id`
- [ ] `POST /v3/ingest/email-webhook` — receives forwarded mail (Postmark/Mailgun-compatible payload), unpacks attachments
- [ ] `GET /v3/ingest/jobs/:id` — status: pending → extracting → classifying → routing → routed | failed (with reason)
- [ ] `GET /v3/ingest/jobs` — list with filters (status, surface, owner, date range)
- [ ] Workers: `extract.worker.ts` (PDF/DOCX/XLSX/PPTX/MSG/EML/image/audio/video), `classify.worker.ts` (calls F-300 agent), `route.worker.ts` (creates action item + attaches doc to target entity)

### Frontend
- [ ] `UniversalDropZone` component mounted on every primary door (passive — only activates on drag-over)
- [ ] `IngestJobsPanel` — slide-out tray showing in-flight + recent ingest jobs with status, classification, target surface
- [ ] Toast on completion: "Classified as [type] for [surface] — review or reclassify"

### Classifier (F-300 tool)
- [ ] Tool: `ingest.classify(doc_text, doc_metadata) → { surface, entity_type, owner, doctrine_flag, evidence_grade, confidence }`
- [ ] Outputs include: opportunity, capture-doc, partner-doc, action-item, regulatory-notice, news-item, financial-doc, CPAR, doctrine-doc, other
- [ ] Classifier consults RAG (F-301) for similar past docs to assign type
- [ ] Low-confidence (<0.7) routes to "Inbox / Needs Triage" with explanation

### Decision Memory hook
- [ ] User reclassifications POST to `/v3/decision-memory/classification-correction` and feed F-302 retraining queue

### Tests
- [ ] Fixture pack: 30 representative docs (5 per type) — classifier accuracy must be ≥85% on this set before PR can merge
- [ ] .msg/.eml round-trip test — header + body + attachments all extracted
- [ ] PII redaction unit tests

## Migration
- [ ] Backfill existing Capture/Action Item uploads into `ingest_jobs` table with `status=routed` and original `target_entity_id` preserved

## Files to touch (estimate)
- `apps/backend-v3/src/ingest/` (new module)
- `apps/backend-v3/src/db/migrations/v3_NNN_ingest_jobs.sql`
- `packages/frontend-v3/src/components/UniversalDropZone.tsx`
- `packages/frontend-v3/src/components/IngestJobsPanel.tsx`
- Each surface page in `packages/frontend-v3/src/pages/` gets `<UniversalDropZone target="…" />`

## Risks
- Email webhook auth: must verify webhook signing secret (Postmark/Mailgun). Spec the chosen provider in the PR description.
- OCR/transcription cost: cap doc size at 50MB; videos route to async transcription queue.
- PII leak: redaction must run before classifier sees text.

## Definition of done
- Drag a `.msg` onto Launchpad → file unpacks → body extracted → classified as "opportunity" → routes to Opportunities with draft action item "Triage this RFP" → user clicks accept → action item materialized with source citation back to the .msg attachment.
