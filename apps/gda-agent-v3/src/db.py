from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from src.config import AGENT_DB_URL, AGENT_DB_RO_URL

# Two pools: _pool (read-write, for audit tables) and _ro_pool (read-only, for db_query tool)
_pool: AsyncConnectionPool | None = None
_ro_pool: AsyncConnectionPool | None = None


async def get_pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=AGENT_DB_URL,
            min_size=1,
            max_size=5,
            open=False,
            kwargs={"row_factory": dict_row},
        )
        await _pool.open()
    return _pool


async def get_ro_pool() -> AsyncConnectionPool:
    global _ro_pool
    if _ro_pool is None:
        _ro_pool = AsyncConnectionPool(
            conninfo=AGENT_DB_RO_URL,
            min_size=1,
            max_size=3,
            open=False,
            kwargs={"row_factory": dict_row},
        )
        await _ro_pool.open()
    return _ro_pool


async def close_pool() -> None:
    global _pool, _ro_pool
    if _pool is not None:
        await _pool.close()
        _pool = None
    if _ro_pool is not None:
        await _ro_pool.close()
        _ro_pool = None


async def check_db() -> bool:
    try:
        pool = await get_pool()
        async with pool.connection() as conn:
            await conn.execute("SELECT 1")
        return True
    except Exception:
        return False


async def insert_agent_run(
    run_id: uuid.UUID,
    task: str,
    model: str,
    context: dict[str, Any] | None = None,
    caller: str | None = None,
) -> None:
    pool = await get_pool()
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO agent_runs (id, started_at, task, context, caller, model, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'running')
            """,
            (
                str(run_id),
                datetime.now(timezone.utc),
                task,
                psycopg.types.json.Json(context) if context else None,
                caller,
                model,
            ),
        )


async def update_agent_run(
    run_id: uuid.UUID,
    status: str,
    output: str | None = None,
    error: str | None = None,
    step_count: int = 0,
    token_usage: dict[str, Any] | None = None,
) -> None:
    pool = await get_pool()
    async with pool.connection() as conn:
        await conn.execute(
            """
            UPDATE agent_runs
            SET ended_at = %s, status = %s, output = %s, error = %s,
                step_count = %s, token_usage = %s
            WHERE id = %s
            """,
            (
                datetime.now(timezone.utc),
                status,
                output,
                error,
                step_count,
                psycopg.types.json.Json(token_usage) if token_usage else None,
                str(run_id),
            ),
        )


async def insert_tool_call(
    call_id: uuid.UUID,
    run_id: uuid.UUID,
    step_index: int,
    tool_name: str,
    tool_input: dict[str, Any],
    tool_output: dict[str, Any] | None = None,
    latency_ms: int | None = None,
    error: str | None = None,
) -> None:
    pool = await get_pool()
    async with pool.connection() as conn:
        ended = datetime.now(timezone.utc) if tool_output is not None or error else None
        await conn.execute(
            """
            INSERT INTO agent_tool_calls
                (id, run_id, step_index, tool_name, input, output, latency_ms, error, started_at, ended_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(call_id),
                str(run_id),
                step_index,
                tool_name,
                psycopg.types.json.Json(tool_input),
                psycopg.types.json.Json(tool_output) if tool_output is not None else None,
                latency_ms,
                error,
                datetime.now(timezone.utc),
                ended,
            ),
        )


async def get_run_trace(run_id: uuid.UUID) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.connection() as conn:
        row = await conn.execute(
            "SELECT * FROM agent_runs WHERE id = %s", (str(run_id),)
        )
        run = await row.fetchone()
        if run is None:
            return None

        tool_rows = await conn.execute(
            "SELECT * FROM agent_tool_calls WHERE run_id = %s ORDER BY step_index",
            (str(run_id),),
        )
        tools = await tool_rows.fetchall()

        return {
            "run": dict(run),
            "tool_calls": [dict(t) for t in tools],
        }


async def get_daily_usage(since: str) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.connection() as conn:
        rows = await conn.execute(
            """
            SELECT
                date_trunc('day', started_at) AS day,
                count(*) AS run_count,
                coalesce(sum((token_usage->>'total_tokens')::int), 0) AS total_tokens,
                coalesce(sum((token_usage->>'cost_usd')::numeric), 0) AS total_cost_usd
            FROM agent_runs
            WHERE started_at >= %s::timestamptz
            GROUP BY 1
            ORDER BY 1
            """,
            (since,),
        )
        return [dict(r) for r in await rows.fetchall()]


async def get_hourly_cost() -> float:
    pool = await get_pool()
    async with pool.connection() as conn:
        row = await conn.execute(
            """
            SELECT coalesce(sum((token_usage->>'cost_usd')::numeric), 0) AS cost
            FROM agent_runs
            WHERE started_at >= now() - interval '1 hour'
            """
        )
        result = await row.fetchone()
        return float(result["cost"]) if result else 0.0


# DML keywords that must not appear anywhere in agent-submitted SQL
_DML_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|COPY)\b",
    re.IGNORECASE,
)


def _validate_readonly_sql(sql: str) -> None:
    upper = sql.strip().upper()
    if not upper.startswith("SELECT") and not upper.startswith("WITH"):
        raise PermissionError("Only SELECT / WITH queries allowed via db_query tool")
    if _DML_PATTERN.search(sql):
        raise PermissionError(
            "Query contains disallowed DML keyword — only pure SELECT queries are permitted"
        )


async def run_readonly_query(sql: str) -> list[dict[str, Any]]:
    _validate_readonly_sql(sql)
    pool = await get_ro_pool()
    async with pool.connection() as conn:
        rows = await conn.execute(sql)
        return [dict(r) for r in await rows.fetchall()]
