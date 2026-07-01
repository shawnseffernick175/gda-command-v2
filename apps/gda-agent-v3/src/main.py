"""GDA Agent V3 — FastAPI HTTP surface."""

from __future__ import annotations

import importlib.metadata
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from src.agent import cancel_run, run_agent
from src.config import ANTHROPIC_API_KEY, OPENAI_API_KEY
from src.db import check_db, check_rag, close_pool, get_daily_usage, get_run_trace
from src.middleware.auth import require_service_token
from src.tools.registry import get_tool_schemas, list_tools


def _pkg_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("gda-agent")


# Filter secrets from logs
class SecretFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = str(record.getMessage())
        for key_var in (OPENAI_API_KEY, ANTHROPIC_API_KEY):
            if key_var and key_var in msg:
                record.msg = str(record.msg).replace(key_var, "***REDACTED***")
        return True


logging.getLogger().addFilter(SecretFilter())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("gda-agent-v3 starting up")
    yield
    logger.info("gda-agent-v3 shutting down")
    await close_pool()


app = FastAPI(
    title="GDA Agent V3",
    version="1.0.0",
    description="Sandboxed agent runtime for GDA Command V3 agentic surfaces",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class AgentRunRequest(BaseModel):
    task: str
    context: dict[str, Any] | None = None
    tools_allowed: list[str] | None = None
    model: str | None = None
    max_steps: int | None = Field(default=None, ge=1, le=50)


class HealthResponse(BaseModel):
    ok: bool
    ready: bool
    tools: list[str]
    models_available: list[str]
    rag_ready: bool
    rag_chunk_count: int
    db_ready: bool
    langgraph: str
    langgraph_prebuilt: str


class CancelResponse(BaseModel):
    ok: bool
    run_id: str


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------
@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    db_ready = await check_db()
    rag_ready, rag_chunk_count = await check_rag()
    models: list[str] = []
    if OPENAI_API_KEY:
        models.extend(["openai:gpt-4o", "openai:gpt-5"])
    if ANTHROPIC_API_KEY:
        models.append("anthropic:claude-sonnet-4-6")

    return HealthResponse(
        ok=True,
        ready=db_ready,
        tools=list_tools(),
        models_available=models,
        rag_ready=rag_ready,
        rag_chunk_count=rag_chunk_count,
        db_ready=db_ready,
        langgraph=_pkg_version("langgraph"),
        langgraph_prebuilt=_pkg_version("langgraph-prebuilt"),
    )


@app.get("/agent/tools")
async def agent_tools() -> list[dict[str, Any]]:
    return get_tool_schemas()


# ---------------------------------------------------------------------------
# Protected endpoints
# ---------------------------------------------------------------------------
@app.post("/agent/run")
async def agent_run(
    body: AgentRunRequest,
    request: Request,
    _auth: None = Depends(require_service_token),
) -> EventSourceResponse:
    caller = request.headers.get("X-GDA-Caller")

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        async for event in run_agent(
            task=body.task,
            context=body.context,
            tools_allowed=body.tools_allowed,
            model=body.model,
            max_steps=body.max_steps,
            caller=caller,
        ):
            yield {"event": event["event"], "data": json.dumps(event["data"])}

    return EventSourceResponse(event_generator())


@app.get("/agent/trace/{run_id}")
async def agent_trace(
    run_id: str,
    _auth: None = Depends(require_service_token),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run_id format")

    trace = await get_run_trace(uid)
    if trace is None:
        raise HTTPException(status_code=404, detail="Run not found")

    # Serialize datetime objects
    def serialize(obj: Any) -> Any:
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        return obj

    return JSONResponse(content=json.loads(json.dumps(trace, default=serialize)))


@app.post("/agent/cancel/{run_id}")
async def agent_cancel(
    run_id: str,
    _auth: None = Depends(require_service_token),
) -> CancelResponse:
    cancelled = cancel_run(run_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Run not found or already completed")
    return CancelResponse(ok=True, run_id=run_id)


@app.get("/agent/usage/daily")
async def agent_usage_daily(
    since: str = Query(description="ISO date e.g. 2026-01-01"),
    _auth: None = Depends(require_service_token),
) -> list[dict[str, Any]]:
    rows = await get_daily_usage(since)
    # Serialize dates
    result = []
    for r in rows:
        serialized = {}
        for k, v in r.items():
            if hasattr(v, "isoformat"):
                serialized[k] = v.isoformat()
            else:
                serialized[k] = v
        result.append(serialized)
    return result
