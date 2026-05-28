# Ingestion Runbooks

Procedural guides for operating and debugging the GDA Command document ingestion pipeline.

## When to use each runbook

| Runbook | Use when… |
|---------|-----------|
| [VPS Access](vps-access.md) | You need to SSH into the VPS, inspect containers, or tail logs |
| [Extractor Testing](extractor-testing.md) | Validating a new extractor end-to-end or verifying parent/child linkage |
| [Troubleshooting](troubleshooting.md) | Documents are stuck in `pending`, `skipped`, or `failed` status |

## Quick reference — format support

| Format group | MIME types | Extractor | PR |
|---|---|---|---|
| PDF | `application/pdf` | `pdf.ts` | PR 1 |
| DOCX/DOC | `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword` | `docx.ts`, `pptx.ts` | PR 1 |
| XLSX/XLS | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel` | `xlsx.ts` | PR 1 |
| PPTX | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `pptx.ts` | PR 1 |
| TXT/MD/CSV | `text/plain`, `text/markdown`, `text/csv` | plain (UTF-8) | PR 1 |
| HTML/XML | `text/html`, `application/xhtml+xml`, `application/xml`, `text/xml` | `html.ts` | PR 2 |
| JSON/YAML | `application/json`, `text/yaml`, `application/yaml`, `application/x-yaml` | `json-yaml.ts` | PR 2 |
| EML/MSG | `message/rfc822`, `application/vnd.ms-outlook` | `email.ts` | PR 2 |
| ZIP/TAR/7Z | `application/zip`, `application/x-tar`, `application/gzip`, `application/x-7z-compressed` | `archive.ts` | PR 3 |
| Images (OCR) | `image/png`, `image/jpeg`, etc. | `image-ocr.ts` | PR 4 (planned) |

## Architecture

```
Upload → multer → saveFile() → knowledge_documents row (status=pending)
                                         ↓
                              ingestDocument() gateway
                                         ↓
                    detectMime() → runExtractor(buffer, mime)
                                         ↓
                              ExtractResult { text, children[] }
                                         ↓
                    embedDocument() → document_embeddings rows
                                         ↓
                              status = indexed | skipped | failed
                                         ↓
                    processChildren() → child knowledge_documents rows
                                         ↓ (fire-and-forget)
                              ingestDocument() per child (depth + 1)
```

Recursion depth is capped at `MAX_RECURSION_DEPTH = 3`. Archive limits: 500 files, 1 GB extracted.
