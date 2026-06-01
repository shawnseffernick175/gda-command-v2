"""GovTribe opportunity search tool — wraps backend-v3 MCP search proxy.

Calls POST /v3/govtribe/search on backend-v3, which internally invokes
the GovTribe MCP client (Search_Federal_Contract_Opportunities) with
credit-budget, cache, and cycle/monthly cap enforcement from F-323.
"""
from __future__ import annotations

import httpx

from src.config import BACKEND_V3_URL
from src.tools.schemas import (
    GovtribeSearchInput,
    GovtribeSearchOutput,
    GovtribeOpportunity,
)

SEARCH_URL = f"{BACKEND_V3_URL}/v3/govtribe/search"
REQUEST_TIMEOUT = 30.0


def _normalize_opportunity(raw: dict) -> GovtribeOpportunity | None:
    """Extract normalized fields from a raw MCP opportunity record."""
    if not isinstance(raw, dict):
        return None

    attrs = raw.get("attributes", raw)
    opp_id = raw.get("_id") or raw.get("id") or attrs.get("_id") or ""
    if not opp_id:
        return None

    title = attrs.get("title") or "Untitled"
    agency_obj = attrs.get("agency")
    agency_name: str | None = None
    if isinstance(agency_obj, dict):
        agency_name = agency_obj.get("name")
    elif isinstance(agency_obj, str):
        agency_name = agency_obj

    slug = attrs.get("slug") or opp_id
    govtribe_url = f"https://govtribe.com/opportunity/{slug}"

    est_value = attrs.get("estimatedValue")
    estimated_value: float | None = None
    if isinstance(est_value, dict):
        estimated_value = est_value.get("high") or est_value.get("low")
    elif isinstance(est_value, (int, float)):
        estimated_value = float(est_value)

    return GovtribeOpportunity(
        title=title,
        agency=agency_name,
        posted_at=attrs.get("postedDate"),
        response_due_at=attrs.get("responseDate") or attrs.get("responseDueDate"),
        notice_id=opp_id,
        govtribe_url=govtribe_url,
        estimated_value=estimated_value,
        set_aside=attrs.get("setAside"),
    )


async def govtribe_search(inp: GovtribeSearchInput) -> GovtribeSearchOutput:
    """Search GovTribe for federal contract opportunities via MCP."""
    payload: dict = {"query": inp.query, "max_results": inp.max_results}
    if inp.agency:
        payload["agency"] = inp.agency
    if inp.naics:
        payload["naics"] = inp.naics
    if inp.posted_within:
        payload["posted_within"] = inp.posted_within

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(SEARCH_URL, json=payload)
    except httpx.HTTPError as exc:
        return GovtribeSearchOutput(
            results=[],
            warning=f"GovTribe search unavailable: {exc}",
        )

    if resp.status_code != 200:
        return GovtribeSearchOutput(
            results=[],
            warning=f"GovTribe search returned HTTP {resp.status_code}",
        )

    body = resp.json()
    envelope = body.get("data", body)

    decision = envelope.get("decision")
    credits_used = envelope.get("credits_used", 0)
    from_cache = envelope.get("from_cache", False)

    if decision and decision.startswith("skipped_"):
        return GovtribeSearchOutput(
            results=[],
            decision=decision,
            credits_used=0,
            from_cache=from_cache,
            warning=f"GovTribe call skipped: {decision}",
        )

    raw_results = envelope.get("results")
    opportunities: list[GovtribeOpportunity] = []

    if isinstance(raw_results, list):
        for item in raw_results:
            opp = _normalize_opportunity(item)
            if opp is not None:
                opportunities.append(opp)
    elif isinstance(raw_results, dict):
        nested = raw_results.get("data") or raw_results.get("results") or []
        if isinstance(nested, list):
            for item in nested:
                opp = _normalize_opportunity(item)
                if opp is not None:
                    opportunities.append(opp)

    return GovtribeSearchOutput(
        results=opportunities,
        decision=decision,
        credits_used=credits_used,
        from_cache=from_cache,
    )
