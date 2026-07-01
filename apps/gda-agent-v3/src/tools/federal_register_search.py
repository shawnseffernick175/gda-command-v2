"""Federal Register notice search tool."""

from __future__ import annotations

import httpx

from src.retry import with_retries
from src.tools.schemas import (
    FederalRegisterSearchInput,
    FederalRegisterSearchOutput,
    FrNotice,
)

FR_API_BASE = "https://www.federalregister.gov/api/v1/documents.json"


async def federal_register_search(
    inp: FederalRegisterSearchInput,
) -> FederalRegisterSearchOutput:
    params: dict[str, str | int | list[str]] = {
        "per_page": inp.limit,
        "order": "newest",
    }
    if inp.query:
        params["conditions[term]"] = inp.query
    if inp.agencies:
        params["conditions[agencies][]"] = inp.agencies
    if inp.posted_after:
        params["conditions[publication_date][gte]"] = inp.posted_after

    async def _do_request() -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(FR_API_BASE, params=params)
            resp.raise_for_status()
            return resp.json()

    data = await with_retries(_do_request, operation="federal_register_search")

    notices: list[FrNotice] = []
    for doc in data.get("results", []):
        notices.append(
            FrNotice(
                document_number=doc.get("document_number", ""),
                title=doc.get("title", ""),
                agencies=[a.get("name", "") for a in doc.get("agencies", [])],
                publication_date=doc.get("publication_date", ""),
                document_type=doc.get("type", ""),
                abstract=doc.get("abstract"),
                source_url=doc.get(
                    "html_url",
                    f"https://www.federalregister.gov/d/{doc.get('document_number', '')}",
                ),
            )
        )

    return FederalRegisterSearchOutput(results=notices)
