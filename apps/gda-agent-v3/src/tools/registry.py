"""Central tool registry — maps tool names to callables + schemas."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from pydantic import BaseModel

from src.tools.db_query import db_query
from src.tools.decision_memory import decision_memory_lookup
from src.tools.doctrine_check import doctrine_check
from src.tools.federal_register_search import federal_register_search
from src.tools.file_read import file_read
from src.tools.govtribe_search import govtribe_search
from src.tools.govwin_search import govwin_search
from src.tools.pwin_score import pwin_score
from src.tools.rag_search import rag_search
from src.tools.sam_search import sam_search
from src.tools.schemas import (
    DbQueryInput,
    DbQueryOutput,
    DecisionMemoryLookupInput,
    DecisionMemoryLookupOutput,
    DoctrineCheckInput,
    DoctrineCheckOutput,
    FederalRegisterSearchInput,
    FederalRegisterSearchOutput,
    FileReadInput,
    FileReadOutput,
    GovtribeSearchInput,
    GovtribeSearchOutput,
    GovwinSearchInput,
    GovwinSearchOutput,
    PwinScoreInput,
    PwinScoreOutput,
    RagSearchInput,
    RagSearchOutput,
    SamSearchInput,
    SamSearchOutput,
    UsaSpendingSearchInput,
    UsaSpendingSearchOutput,
    WebSearchInput,
    WebSearchOutput,
    GenerateBriefingInput,
    GenerateBriefingOutput,
    GenerateCapturePlanInput,
    GenerateCapturePlanOutput,
    GenerateWinThemesInput,
    GenerateWinThemesOutput,
)
from src.tools.output_generators import (
    generate_briefing,
    generate_capture_plan,
    generate_win_themes,
)
from src.tools.usaspending_search import usaspending_search
from src.tools.web_search import web_search


class ToolDef:
    """Definition of a registered agent tool."""

    def __init__(
        self,
        name: str,
        description: str,
        input_schema: type[BaseModel],
        output_schema: type[BaseModel],
        fn: Callable[..., Awaitable[BaseModel]],
    ) -> None:
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.output_schema = output_schema
        self.fn = fn

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema.model_json_schema(),
            "output_schema": self.output_schema.model_json_schema(),
        }


TOOL_REGISTRY: dict[str, ToolDef] = {}


def _register(
    name: str,
    description: str,
    input_schema: type[BaseModel],
    output_schema: type[BaseModel],
    fn: Callable[..., Awaitable[BaseModel]],
) -> None:
    TOOL_REGISTRY[name] = ToolDef(name, description, input_schema, output_schema, fn)


_register(
    "sam_search",
    "Search SAM.gov for federal contract opportunities",
    SamSearchInput,
    SamSearchOutput,
    sam_search,
)
_register(
    "usaspending_search",
    "Search USAspending.gov for federal awards and contracts",
    UsaSpendingSearchInput,
    UsaSpendingSearchOutput,
    usaspending_search,
)
_register(
    "federal_register_search",
    "Search Federal Register for regulatory notices and rules",
    FederalRegisterSearchInput,
    FederalRegisterSearchOutput,
    federal_register_search,
)
_register(
    "db_query",
    "Execute read-only SQL queries against the GDA Command database",
    DbQueryInput,
    DbQueryOutput,
    db_query,
)
_register(
    "rag_search",
    "Search the RAG knowledge base (pgvector) for relevant documents",
    RagSearchInput,
    RagSearchOutput,
    rag_search,
)
_register(
    "web_search",
    "Search the web via Perplexity or Tavily for current information",
    WebSearchInput,
    WebSearchOutput,
    web_search,
)
_register(
    "doctrine_check",
    "Evaluate a claim against GDA enterprise doctrine principles",
    DoctrineCheckInput,
    DoctrineCheckOutput,
    doctrine_check,
)
_register(
    "decision_memory_lookup",
    "Look up past agent decisions from decision memory (F-302)",
    DecisionMemoryLookupInput,
    DecisionMemoryLookupOutput,
    decision_memory_lookup,
)
_register(
    "file_read",
    "Read a document from the GDA Command file store",
    FileReadInput,
    FileReadOutput,
    file_read,
)
_register(
    "pwin_score",
    "Get probability-of-win score for an opportunity (F-302 model)",
    PwinScoreInput,
    PwinScoreOutput,
    pwin_score,
)
_register(
    "govwin_search",
    "Search GovWin IQ for government contract intelligence",
    GovwinSearchInput,
    GovwinSearchOutput,
    govwin_search,
)
_register(
    "govtribe_search",
    "Search GovTribe for federal contract opportunities (MCP-backed, credit-budgeted)",
    GovtribeSearchInput,
    GovtribeSearchOutput,
    govtribe_search,
)
_register(
    "generate_briefing",
    "Generate an Opportunity Briefing PDF for a given opportunity (F-313)",
    GenerateBriefingInput,
    GenerateBriefingOutput,
    generate_briefing,
)
_register(
    "generate_capture_plan",
    "Generate a Capture Plan PDF for a given capture (F-313)",
    GenerateCapturePlanInput,
    GenerateCapturePlanOutput,
    generate_capture_plan,
)
_register(
    "generate_win_themes",
    "Generate a Win Theme deck PDF for a given capture (F-313)",
    GenerateWinThemesInput,
    GenerateWinThemesOutput,
    generate_win_themes,
)


def get_tool(name: str) -> ToolDef | None:
    return TOOL_REGISTRY.get(name)


def list_tools() -> list[str]:
    return list(TOOL_REGISTRY.keys())


def get_tool_schemas() -> list[dict[str, Any]]:
    return [t.to_dict() for t in TOOL_REGISTRY.values()]
