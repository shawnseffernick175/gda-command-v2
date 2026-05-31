"""RAG search tool (F-301 pgvector). Stub until F-301 is deployed."""
from __future__ import annotations

from src.tools.schemas import RagSearchInput, RagSearchOutput, RagChunk

# When F-301 is deployed this will call the pgvector-backed search.
# For now returns empty with a note.

_RAG_AVAILABLE = False


async def rag_search(inp: RagSearchInput) -> RagSearchOutput:
    if not _RAG_AVAILABLE:
        return RagSearchOutput(
            results=[
                RagChunk(
                    chunk="RAG corpus not yet available (pending F-301 deployment).",
                    source_doc="system",
                    grade="C",
                    source_url="https://docs.gda-command.internal/f-301",
                )
            ]
        )

    # Future: query pgvector via psycopg
    return RagSearchOutput(results=[])
