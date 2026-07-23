"""Web search tool via Perplexity or Tavily."""

from __future__ import annotations

import httpx

from src.config import PERPLEXITY_API_KEY, TAVILY_API_KEY
from src.retry import with_retries
from src.tools.schemas import WebResult, WebSearchInput, WebSearchOutput


async def web_search(inp: WebSearchInput) -> WebSearchOutput:
    if TAVILY_API_KEY:
        return await _tavily_search(inp)
    if PERPLEXITY_API_KEY:
        return await _perplexity_search(inp)
    # No search provider configured: return no results rather than a synthetic
    # result with a fabricated URL (R1 — every surfaced source must be real).
    return WebSearchOutput(results=[])


async def _tavily_search(inp: WebSearchInput) -> WebSearchOutput:
    async def _do_request() -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": inp.query,
                    "max_results": inp.top_k,
                    "search_depth": "basic",
                },
            )
            resp.raise_for_status()
            return resp.json()

    data = await with_retries(_do_request, operation="tavily_search")

    results = [
        WebResult(
            title=r.get("title", ""),
            url=r.get("url", ""),
            snippet=r.get("content", "")[:500],
        )
        for r in data.get("results", [])
    ]
    return WebSearchOutput(results=results)


async def _perplexity_search(inp: WebSearchInput) -> WebSearchOutput:
    async def _do_request() -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
                json={
                    "model": "sonar",
                    "messages": [{"role": "user", "content": inp.query}],
                },
            )
            resp.raise_for_status()
            return resp.json()

    data = await with_retries(_do_request, operation="perplexity_search")

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    citations = data.get("citations", [])
    results = [
        WebResult(title=f"Result {i + 1}", url=url, snippet=content[:500])
        for i, url in enumerate(citations[: inp.top_k])
    ]
    if not results:
        results = [
            WebResult(title="Perplexity result", url="https://perplexity.ai", snippet=content[:500])
        ]
    return WebSearchOutput(results=results)
