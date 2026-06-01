"""USAspending award search tool."""
from __future__ import annotations

import httpx

from src.tools.schemas import (
    UsaSpendingSearchInput,
    UsaSpendingSearchOutput,
    UsaSpendingAward,
)

USASPENDING_API_BASE = "https://api.usaspending.gov/api/v2/search/spending_by_award/"


async def usaspending_search(inp: UsaSpendingSearchInput) -> UsaSpendingSearchOutput:
    filters: dict = {"award_type_codes": ["A", "B", "C", "D"]}
    if inp.recipient_uei:
        filters["recipient_search_text"] = [inp.recipient_uei]
    if inp.agency:
        filters["agencies"] = [
            {"type": "awarding", "tier": "toptier", "name": inp.agency}
        ]
    if inp.naics:
        filters["naics_codes"] = {"require": [inp.naics]}
    if inp.posted_after:
        filters["time_period"] = [{"start_date": inp.posted_after, "end_date": "2099-12-31"}]

    body = {
        "filters": filters,
        "fields": [
            "Award ID",
            "Recipient Name",
            "Awarding Agency",
            "Award Amount",
            "Start Date",
            "NAICS Code",
            "Description",
        ],
        "limit": inp.limit,
        "page": 1,
        "sort": "Award Amount",
        "order": "desc",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(USASPENDING_API_BASE, json=body)
        resp.raise_for_status()
        data = resp.json()

    awards: list[UsaSpendingAward] = []
    for row in data.get("results", []):
        award_id = row.get("Award ID", row.get("internal_id", ""))
        awards.append(
            UsaSpendingAward(
                award_id=str(award_id),
                recipient_name=row.get("Recipient Name", ""),
                agency=row.get("Awarding Agency", ""),
                award_amount=float(row.get("Award Amount", 0)),
                start_date=row.get("Start Date", ""),
                naics_code=row.get("NAICS Code"),
                description=row.get("Description", "")[:500] if row.get("Description") else None,
                source_url=f"https://www.usaspending.gov/award/{award_id}",
            )
        )

    return UsaSpendingSearchOutput(results=awards)
