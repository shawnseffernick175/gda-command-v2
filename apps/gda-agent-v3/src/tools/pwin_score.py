"""Probability of Win scoring tool (F-302 dependency)."""
from __future__ import annotations

from src.tools.schemas import PwinScoreInput, PwinScoreOutput, PwinResult


async def pwin_score(inp: PwinScoreInput) -> PwinScoreOutput:
    # Stub — F-302 PWin model not yet deployed.
    return PwinScoreOutput(
        result=PwinResult(
            score=50,
            feature_weights={"stub": 1.0},
            model_version="v0.0.1-stub",
            confidence=0.0,
            source_url=f"https://docs.gda-command.internal/pwin/{inp.opp_id}",
        )
    )
