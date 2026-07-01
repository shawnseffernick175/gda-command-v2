"""F-313: Output Generators agent tools.

Tools for generating briefings, capture plans, and win themes via the
backend /v3/output-generators endpoints.
"""

from __future__ import annotations

import os

import httpx

from src.tools.schemas import (
    GenerateBriefingInput,
    GenerateBriefingOutput,
    GenerateCapturePlanInput,
    GenerateCapturePlanOutput,
    GenerateWinThemesInput,
    GenerateWinThemesOutput,
    GeneratedDocResult,
)

BACKEND_BASE = os.getenv("BACKEND_V3_URL", "http://localhost:3001")


async def _post_generate(endpoint: str, body: dict) -> GeneratedDocResult:
    async with httpx.AsyncClient(timeout=60.0) as client:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        token = os.getenv("AGENT_SERVICE_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"

        resp = await client.post(
            f"{BACKEND_BASE}/v3/output-generators/{endpoint}",
            json=body,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json().get("data", resp.json())
        return GeneratedDocResult(
            doc_id=str(data.get("id", "")),
            doc_type=data.get("doc_type", ""),
            title=data.get("title", ""),
            download_url=f"/v3/output-generators/{data.get('id', '')}/html",
        )


async def generate_briefing(inp: GenerateBriefingInput) -> GenerateBriefingOutput:
    result = await _post_generate("briefing", {"opportunity_id": inp.opportunity_id})
    return GenerateBriefingOutput(result=result)


async def generate_capture_plan(inp: GenerateCapturePlanInput) -> GenerateCapturePlanOutput:
    result = await _post_generate("capture-plan", {"capture_id": inp.capture_id})
    return GenerateCapturePlanOutput(result=result)


async def generate_win_themes(inp: GenerateWinThemesInput) -> GenerateWinThemesOutput:
    result = await _post_generate("win-themes", {"capture_id": inp.capture_id})
    return GenerateWinThemesOutput(result=result)
