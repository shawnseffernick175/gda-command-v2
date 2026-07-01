"""File read tool — retrieves document content from gda-backend-v3 file store."""

from __future__ import annotations

import httpx

from src.config import BACKEND_V3_URL
from src.retry import with_retries
from src.tools.schemas import FileReadInput, FileReadOutput


async def file_read(inp: FileReadInput) -> FileReadOutput:
    url = f"{BACKEND_V3_URL}/v3/files/{inp.doc_id}"

    async def _do_request() -> httpx.Response:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp

    try:
        resp = await with_retries(_do_request, operation="file_read")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return FileReadOutput(
                doc_text="",
                doc_meta={"error": f"Document {inp.doc_id} not found"},
                source_url=url,
            )
        raise

    data = resp.json()
    return FileReadOutput(
        doc_text=data.get("text", data.get("content", "")),
        doc_meta=data.get("meta", {}),
        source_url=data.get("source_url", url),
    )
