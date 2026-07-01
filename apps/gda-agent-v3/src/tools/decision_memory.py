"""Decision memory lookup tool (F-302 dependency)."""

from __future__ import annotations

from src.tools.schemas import (
    DecisionMemoryLookupInput,
    DecisionMemoryLookupOutput,
)


async def decision_memory_lookup(
    inp: DecisionMemoryLookupInput,
) -> DecisionMemoryLookupOutput:
    # Stub — F-302 decision memory tables not yet deployed.
    return DecisionMemoryLookupOutput(results=[])
