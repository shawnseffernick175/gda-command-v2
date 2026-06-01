"""GovTribe search tool — proxies through backend-v3 for credit-ledger enforcement."""
from __future__ import annotations

import httpx

from src.config import BACKEND_V3_URL, AGENT_SERVICE_TOKEN
from src.tools.schemas import GovtribeSearchInput, GovtribeSearchOutput, GovtribeHit


async def govtribe_search(inp: GovtribeSearchInput) -> GovtribeSearchOutput:
    url = f"{BACKEND_V3_URL}/v3/govtribe/search"

    payload: dict = {
        "query": inp.query,
        "category": inp.category,
        "max_results": inp.max_results,
        "caller": "agent-v3",
    }
    if inp.naics_filter:
        payload["naics_filter"] = inp.naics_filter

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if AGENT_SERVICE_TOKEN:
        headers["Authorization"] = f"Bearer {AGENT_SERVICE_TOKEN}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code == 429:
            return GovtribeSearchOutput(
                results=[],
                credits_used=0,
                throttled=True,
                warning="GovTribe credit cap reached — search throttled.",
            )

        resp.raise_for_status()
        body = resp.json()

    data = body.get("data", {})
    raw_hits = data.get("results", [])
    credits_used = data.get("credits_used", 0)
    decision = data.get("decision", "called")
    throttled = decision != "called"

    hits: list[GovtribeHit] = []
    for hit in raw_hits:
        attrs = hit.get("attributes", hit)
        agency_obj = attrs.get("agency", {})
        agency_name = (
            agency_obj.get("name", "") if isinstance(agency_obj, dict) else str(agency_obj)
        )
        govtribe_id = hit.get("_id") or hit.get("id") or ""
        hits.append(
            GovtribeHit(
                govtribe_id=govtribe_id,
                title=attrs.get("title", ""),
                agency=agency_name,
                naics_code=attrs.get("naicsCode"),
                set_aside=attrs.get("setAside"),
                posted_date=attrs.get("postedDate"),
                response_deadline=attrs.get("responseDate"),
                description=(attrs.get("description", "") or "")[:500] or None,
                source_url=attrs.get("url")
                or f"https://govtribe.com/opportunity/{govtribe_id}",
            )
        )

    warning = None
    if throttled:
        warning = f"GovTribe budget constraint: {decision}. Results may be from cache."

    return GovtribeSearchOutput(
        results=hits,
        credits_used=credits_used,
        throttled=throttled,
        warning=warning,
    )
