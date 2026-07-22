"""GovWin IQ search tool.

Searches GovWin-sourced opportunities that backend-v3 has already ingested
(kind = 'govwin'), via the read-only DB role. Results are restricted to rows
with a real source URL (R1); nothing is fabricated. Returns a warning instead
of an error when the query matches no ingested GovWin rows.
"""

from __future__ import annotations

from src.db import fetch_readonly
from src.tools.schemas import GovwinResult, GovwinSearchInput, GovwinSearchOutput

_GOVWIN_SQL = """
SELECT
  o.title                 AS title,
  COALESCE(o.agency, '')  AS agency,
  o.status                AS status,
  s.url                   AS source_url
FROM opportunities o
JOIN sources s ON s.id = o.source_id
WHERE o.deleted_at IS NULL
  AND s.kind = 'govwin'
  AND s.url IS NOT NULL
  AND (
    %(query)s = ''
    OR o.title ILIKE %(pattern)s
    OR COALESCE(o.agency, '') ILIKE %(pattern)s
  )
  AND (%(agency)s IS NULL OR o.agency ILIKE %(agency_pattern)s)
ORDER BY o.posted_at DESC NULLS LAST
LIMIT 25
"""


async def govwin_search(inp: GovwinSearchInput) -> GovwinSearchOutput:
    query = inp.query or ""
    rows = await fetch_readonly(
        _GOVWIN_SQL,
        {
            "query": query,
            "pattern": f"%{query}%",
            "agency": inp.agency,
            "agency_pattern": f"%{inp.agency}%" if inp.agency else "%",
        },
    )

    results = [
        GovwinResult(
            title=r.get("title", ""),
            agency=r.get("agency", ""),
            status=r.get("status", ""),
            source_url=r["source_url"],
        )
        for r in rows
    ]

    warning = None
    if not results:
        warning = f"No ingested GovWin opportunities matched '{query}'."

    return GovwinSearchOutput(results=results, warning=warning)
