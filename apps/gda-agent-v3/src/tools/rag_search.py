"""RAG search tool — pgvector semantic search over kb_chunks (F-301)."""
from __future__ import annotations

import logging

from src.config import OPENAI_API_KEY
from src.db import get_pool
from src.tools.schemas import RagSearchInput, RagSearchOutput, RagChunk

logger = logging.getLogger(__name__)

_EMBED_MODEL = "text-embedding-3-large"
_EMBED_DIMENSIONS = 2000


async def _generate_query_embedding(query: str) -> list[float]:
    """Call OpenAI embeddings API for a single query string."""
    import httpx

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": _EMBED_MODEL,
                "input": query,
                "dimensions": _EMBED_DIMENSIONS,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]


async def rag_search(inp: RagSearchInput) -> RagSearchOutput:
    if not OPENAI_API_KEY:
        return RagSearchOutput(
            results=[
                RagChunk(
                    chunk="RAG search unavailable: OPENAI_API_KEY not configured.",
                    source_doc="system",
                    grade="C",
                    source_url="https://docs.gda-command.internal/f-301",
                )
            ]
        )

    try:
        pool = await get_pool()
        async with pool.connection() as conn:
            # Verify kb_chunks table exists and has data
            row = await conn.execute("SELECT count(*) AS cnt FROM kb_chunks")
            result = await row.fetchone()
            if not result or int(result["cnt"]) == 0:
                return RagSearchOutput(
                    results=[
                        RagChunk(
                            chunk="RAG corpus is empty (0 chunks). Run seed-rag to populate.",
                            source_doc="system",
                            grade="C",
                            source_url="https://docs.gda-command.internal/f-301",
                        )
                    ]
                )

        # Generate query embedding
        query_embedding = await _generate_query_embedding(inp.query)
        vector_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        # Perform pgvector cosine similarity search
        where_clauses = ["1=1"]
        params: list[object] = [vector_str, inp.top_k]

        if inp.ou_filter:
            where_clauses.append(f"d.ou_tag = ${len(params) + 1}")
            params.append(inp.ou_filter)

        if inp.doc_type_filter:
            where_clauses.append(f"d.doc_type = ${len(params) + 1}")
            params.append(inp.doc_type_filter)

        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                c.chunk_text,
                d.source_filename,
                d.source_url,
                d.evidence_grade,
                1 - (c.embedding <=> $1::vector) AS score
            FROM kb_chunks c
            JOIN kb_documents d ON d.id = c.document_id
            WHERE {where_sql}
            ORDER BY c.embedding <=> $1::vector
            LIMIT $2
        """

        async with pool.connection() as conn:
            rows = await conn.execute(sql, params)
            results_raw = await rows.fetchall()

        chunks: list[RagChunk] = []
        for row in results_raw:
            score = float(row["score"]) if row["score"] else 0.0
            if score < 0.5:
                continue
            chunks.append(
                RagChunk(
                    chunk=row["chunk_text"],
                    source_doc=row["source_filename"],
                    grade=row["evidence_grade"] or "C",
                    source_url=row["source_url"] or f"internal://kb/{row['source_filename']}",
                )
            )

        if not chunks:
            chunks.append(
                RagChunk(
                    chunk="No relevant chunks found above similarity threshold.",
                    source_doc="system",
                    grade="C",
                    source_url="https://docs.gda-command.internal/f-301",
                )
            )

        return RagSearchOutput(results=chunks)

    except Exception as exc:
        logger.warning("rag_search failed: %s", exc)
        return RagSearchOutput(
            results=[
                RagChunk(
                    chunk=f"RAG search error: {exc}",
                    source_doc="system",
                    grade="C",
                    source_url="https://docs.gda-command.internal/f-301",
                )
            ]
        )
