"""SAM.gov opportunity search tool."""

from __future__ import annotations

import httpx

from src.config import SAM_GOV_API_KEY
from src.retry import with_retries
from src.tools.schemas import SamOpportunity, SamSearchInput, SamSearchOutput

SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search"


async def sam_search(inp: SamSearchInput) -> SamSearchOutput:
    params: dict[str, str | int] = {
        "api_key": SAM_GOV_API_KEY,
        "limit": inp.limit,
        "postedFrom": inp.posted_after or "",
        "keyword": inp.query,
    }
    if inp.agency:
        params["organizationId"] = inp.agency
    if inp.naics:
        params["naics"] = inp.naics
    if inp.set_aside:
        params["typeOfSetAside"] = inp.set_aside

    params = {k: v for k, v in params.items() if v}

    async def _do_request() -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(SAM_API_BASE, params=params)
            resp.raise_for_status()
            return resp.json()

    data = await with_retries(_do_request, operation="sam_search")

    opps: list[SamOpportunity] = []
    for opp in data.get("opportunitiesData", []):
        notice_id = opp.get("noticeId", "")
        opps.append(
            SamOpportunity(
                notice_id=notice_id,
                title=opp.get("title", ""),
                agency=opp.get("fullParentPathName", opp.get("organizationType", "")),
                posted_date=opp.get("postedDate", ""),
                response_deadline=opp.get("responseDeadLine"),
                naics_code=opp.get("naicsCode"),
                set_aside=opp.get("typeOfSetAside"),
                description=opp.get("description", "")[:500] if opp.get("description") else None,
                source_url=f"https://sam.gov/opp/{notice_id}/view",
            )
        )

    return SamSearchOutput(results=opps)
