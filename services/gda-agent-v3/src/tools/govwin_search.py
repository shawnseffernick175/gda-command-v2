"""GovWin IQ search tool (stub until credentials wired)."""
from __future__ import annotations

from src.tools.schemas import GovwinSearchInput, GovwinSearchOutput


async def govwin_search(inp: GovwinSearchInput) -> GovwinSearchOutput:
    # Returns empty list + warning when credentials not configured (does not crash).
    return GovwinSearchOutput(
        results=[],
        warning="GovWin IQ credentials not configured. Returns empty until F-Govwin wired.",
    )
