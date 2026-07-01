"""Tests for the retry utility."""

from __future__ import annotations

import httpx
import pytest

from src.retry import RETRYABLE_STATUS_CODES, with_retries


@pytest.mark.anyio
class TestRetryLogic:
    async def test_succeeds_on_first_try(self):
        call_count = 0

        async def _success():
            nonlocal call_count
            call_count += 1
            return "ok"

        result = await with_retries(_success, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert call_count == 1

    async def test_retries_on_500_then_succeeds(self):
        call_count = 0

        async def _fail_then_succeed():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                resp = httpx.Response(500)
                raise httpx.HTTPStatusError(
                    "Server Error", request=httpx.Request("GET", "http://x"), response=resp
                )
            return "ok"

        result = await with_retries(_fail_then_succeed, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert call_count == 3

    async def test_retries_on_429_rate_limit(self):
        call_count = 0

        async def _rate_limited_then_ok():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                resp = httpx.Response(429)
                raise httpx.HTTPStatusError(
                    "Rate Limited", request=httpx.Request("GET", "http://x"), response=resp
                )
            return "ok"

        result = await with_retries(_rate_limited_then_ok, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert call_count == 2

    async def test_raises_after_max_retries_exhausted(self):
        async def _always_fail():
            resp = httpx.Response(503)
            raise httpx.HTTPStatusError(
                "Unavailable", request=httpx.Request("GET", "http://x"), response=resp
            )

        with pytest.raises(httpx.HTTPStatusError):
            await with_retries(_always_fail, max_retries=3, base_delay=0.01)

    async def test_non_retryable_status_raises_immediately(self):
        call_count = 0

        async def _client_error():
            nonlocal call_count
            call_count += 1
            resp = httpx.Response(400)
            raise httpx.HTTPStatusError(
                "Bad Request", request=httpx.Request("GET", "http://x"), response=resp
            )

        with pytest.raises(httpx.HTTPStatusError):
            await with_retries(_client_error, max_retries=3, base_delay=0.01)
        assert call_count == 1

    async def test_retries_on_connection_error(self):
        call_count = 0

        async def _connect_fail_then_ok():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.ConnectError("Connection refused")
            return "ok"

        result = await with_retries(_connect_fail_then_ok, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert call_count == 2

    async def test_retries_on_timeout(self):
        call_count = 0

        async def _timeout_then_ok():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.TimeoutException("Read timed out")
            return "ok"

        result = await with_retries(_timeout_then_ok, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert call_count == 2

    async def test_retryable_status_codes_complete(self):
        assert 429 in RETRYABLE_STATUS_CODES
        assert 500 in RETRYABLE_STATUS_CODES
        assert 502 in RETRYABLE_STATUS_CODES
        assert 503 in RETRYABLE_STATUS_CODES
        assert 504 in RETRYABLE_STATUS_CODES
        assert 400 not in RETRYABLE_STATUS_CODES
        assert 401 not in RETRYABLE_STATUS_CODES
        assert 404 not in RETRYABLE_STATUS_CODES
