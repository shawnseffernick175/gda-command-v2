"""RAG search tool — semantic search over the backend-v3 knowledge base.

Delegates to backend-v3 `POST /v3/rag/search`, which owns the pgvector store
and embedding model (F-301). Every returned chunk carries a searchable source
(R1): the document's own source_url when present, otherwise the backend
document endpoint that serves it.
"""

from __future__ import annotations

import httpx

from src.config import BACKEND_V3_URL
from src.retry import with_retries
from src.tools.schemas import RagChunk, RagSearchInput, RagSearchOutput


async def rag_search(inp: RagSearchInput) -> RagSearchOutput:
    url = f"{BACKEND_V3_URL}/v3/rag/search"
    payload: dict[str, object] = {"query": inp.query, "top_k": inp.top_k}
    if inp.ou_filter:
        payload["ou_filter"] = inp.ou_filter
    if inp.doc_type_filter:
        payload["doc_type_filter"] = inp.doc_type_filter

    async def _do_request() -> httpx.Response:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return resp

    resp = await with_retries(_do_request, operation="rag_search")
    envelope = resp.json()
    results = (envelope.get("data") or {}).get("results", [])

    chunks: list[RagChunk] = []
    for r in results:
        document_id = r.get("document_id", "")
        source_url = r.get("source_url") or (
            f"{BACKEND_V3_URL}/v3/rag/documents/{document_id}" if document_id else None
        )
        if not source_url:
            # R1: never surface a chunk without a searchable source.
            continue
        chunks.append(
            RagChunk(
                chunk=r.get("chunk_text", ""),
                source_doc=r.get("source_filename", document_id),
                grade=r.get("evidence_grade") or "C",
                source_url=source_url,
            )
        )

    return RagSearchOutput(results=chunks)
