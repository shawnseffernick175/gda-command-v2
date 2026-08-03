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
    # Stub until the F-303 rules engine is deployed. It returns NO numeric
    # scores — emitting placeholder scores (e.g. a flat 3/5) would read as a
    # real evaluation downstream, which is a fabricated metric. Instead we
    # signal not_evaluated and list the principles that would be scored.
    return DoctrineCheckOutput(
        evaluation=DoctrineEvaluation(
            status="not_evaluated",
            alignment_score_by_principle={},
            principles=DOCTRINE_PRINCIPLES,
            exclusion_triggers=[],
            margin_check=None,
            rationale=(
                f"Doctrine evaluation not available for: '{inp.claim_text[:100]}'. "
                "The F-303 rules engine is not deployed; no scores are produced "
                "rather than returning placeholder values."
            ),
            source_url=None,
        )
    )
