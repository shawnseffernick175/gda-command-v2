"""Read-only database query tool (enforced via gda_agent_ro role)."""
from __future__ import annotations

from src.db import run_readonly_query
from src.tools.schemas import DbQueryInput, DbQueryOutput


async def db_query(inp: DbQueryInput) -> DbQueryOutput:
    rows = await run_readonly_query(inp.sql)
    return DbQueryOutput(rows=rows, row_count=len(rows))
