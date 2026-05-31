"""Shared test fixtures."""
from __future__ import annotations

import os

# Ensure config doesn't fail during tests
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("AGENT_DB_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("AGENT_SERVICE_TOKEN", "test-token")
os.environ.setdefault("SAM_GOV_API_KEY", "test-sam-key")
os.environ.setdefault("BACKEND_V3_URL", "http://localhost:4000")

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}
