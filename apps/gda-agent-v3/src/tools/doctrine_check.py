"""Doctrine alignment check tool (F-303 rules engine stub)."""
from __future__ import annotations

from src.tools.schemas import (
    DoctrineCheckInput,
    DoctrineCheckOutput,
    DoctrineEvaluation,
)

DOCTRINE_PRINCIPLES = [
    "Alignment",
    "Ethics Always",
    "Teamwork",
    "Data First",
    "Relentless Execution",
    "Relationships",
    "Market/Mission/Brand Focus",
]


async def doctrine_check(inp: DoctrineCheckInput) -> DoctrineCheckOutput:
    # Stub until F-303 rules engine is deployed.
    # Returns neutral scores with a note that full evaluation requires F-303.
    scores = {p: 3 for p in DOCTRINE_PRINCIPLES}
    return DoctrineCheckOutput(
        evaluation=DoctrineEvaluation(
            alignment_score_by_principle=scores,
            exclusion_triggers=[],
            margin_check="Pending F-303 rules engine deployment",
            rationale=(
                f"Stub evaluation for: '{inp.claim_text[:100]}'. "
                "Full doctrine evaluation requires F-303 rules engine."
            ),
            source_url="https://docs.gda-command.internal/doctrine",
        )
    )
