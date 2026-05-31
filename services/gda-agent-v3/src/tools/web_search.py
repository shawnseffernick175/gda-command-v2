"""Web search tool via Perplexity or Tavily."""
from __future__ import annotations

import httpx

from src.config import PERPLEXITY_API_KEY, TAVILY_API_KEY
from src.tools.schemas import WebSearchInput, WebSearchOutput, WebResult


async def web_search(inp: WebSearchInput) -> WebSearchOutput:
    if TAVILY_API_KEY:
        return await _tavily_search(inp)
    if PERPLEXITY_API_KEY:
        return await _perplexity_search(inp)
    return WebSearchOutput(
        results=[
            WebResult(
                title="Web search unavailable",
                url="https://docs.gda-command.internal/config",
                snippet="Neither PERPLEXITY_API_KEY nor TAVILY_API_KEY configured.",
            )
        ]
    )


async def _tavily_search(inp: WebSearchInput) -> WebSearchOutput:
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
        data = resp.json()

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
        data = resp.json()

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    citations = data.get("citations", [])
    results = [
        WebResult(title=f"Result {i+1}", url=url, snippet=content[:500])
        for i, url in enumerate(citations[: inp.top_k])
    ]
    if not results:
        results = [
            WebResult(title="Perplexity result", url="https://perplexity.ai", snippet=content[:500])
        ]
    return WebSearchOutput(results=results)
