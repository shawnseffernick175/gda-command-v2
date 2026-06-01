from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str | None = None) -> str:
    val = os.getenv(key, default)
    if val is None:
        raise RuntimeError(f"Missing required env var: {key}")
    return val


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None:
        return default
    return int(raw)


def _env_float(key: str, default: float) -> float:
    raw = os.getenv(key)
    if raw is None:
        return default
    return float(raw)


OPENAI_API_KEY: str = _env("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY: str = _env("ANTHROPIC_API_KEY", "")

AGENT_DB_URL: str = _env(
    "AGENT_DB_URL",
    "postgresql://gda_agent_ro:agent_ro_default@postgres-staging:5432/gda_staging",
)
AGENT_DB_RO_URL: str = _env(
    "AGENT_DB_RO_URL",
    "postgresql://gda_agent_ro:agent_ro_default@postgres-staging:5432/gda_staging",
)

AGENT_SERVICE_TOKEN: str = _env("AGENT_SERVICE_TOKEN", "")

DEFAULT_MODEL: str = _env("AGENT_DEFAULT_MODEL", "openai:gpt-4o")
MAX_STEPS_DEFAULT: int = _env_int("AGENT_MAX_STEPS", 12)
WALL_TIMEOUT_DEFAULT_S: float = _env_float("AGENT_WALL_TIMEOUT_S", 30.0)

HOURLY_COST_LIMIT_USD: float = _env_float("AGENT_HOURLY_COST_LIMIT_USD", 5.0)

SAM_GOV_API_KEY: str = _env("SAM_GOV_API_KEY", "")
PERPLEXITY_API_KEY: str = _env("PERPLEXITY_API_KEY", "")
TAVILY_API_KEY: str = _env("TAVILY_API_KEY", "")

BACKEND_V3_URL: str = _env("BACKEND_V3_URL", "http://gda-backend-v3:4000")
