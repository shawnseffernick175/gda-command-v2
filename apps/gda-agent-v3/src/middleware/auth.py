"""Service-token auth middleware. Public endpoints bypass."""

from __future__ import annotations

from fastapi import HTTPException, Request

from src.config import AGENT_SERVICE_TOKEN

PUBLIC_PATHS = {"/healthz", "/agent/tools"}


async def require_service_token(request: Request) -> None:
    if request.url.path in PUBLIC_PATHS:
        return
    if not AGENT_SERVICE_TOKEN:
        return  # no token configured = development mode, allow all
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if token != AGENT_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing service token")
