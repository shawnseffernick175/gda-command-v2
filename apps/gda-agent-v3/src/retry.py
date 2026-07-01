"""Retry utility with exponential backoff for external API calls."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

import httpx

logger = logging.getLogger("gda-agent.retry")

T = TypeVar("T")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_RETRIES = 3
BASE_DELAY_S = 1.0


async def with_retries(
    fn: Callable[[], Awaitable[T]],
    *,
    max_retries: int = MAX_RETRIES,
    base_delay: float = BASE_DELAY_S,
    operation: str = "api_call",
) -> T:
    """Execute fn with exponential backoff on retryable HTTP errors.

    Retries on httpx.HTTPStatusError with status in RETRYABLE_STATUS_CODES
    and on httpx.ConnectError / httpx.TimeoutException.
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            return await fn()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in RETRYABLE_STATUS_CODES:
                raise
            last_exc = exc
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "%s attempt %d/%d failed (HTTP %d), retrying in %.1fs",
                operation,
                attempt,
                max_retries,
                exc.response.status_code,
                delay,
            )
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            last_exc = exc
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "%s attempt %d/%d failed (%s), retrying in %.1fs",
                operation,
                attempt,
                max_retries,
                type(exc).__name__,
                delay,
            )

        if attempt < max_retries:
            await asyncio.sleep(delay)

    raise last_exc  # type: ignore[misc]
