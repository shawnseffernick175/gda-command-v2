"""Pydantic I/O schemas for every tool in the agent runtime."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# sam_search
# ---------------------------------------------------------------------------
class SamSearchInput(BaseModel):
    query: str
    agency: str | None = None
    naics: str | None = None
    set_aside: str | None = None
    posted_after: str | None = None
    limit: int = Field(default=10, ge=1, le=100)


class SamOpportunity(BaseModel):
    notice_id: str
    title: str
    agency: str
    posted_date: str
    response_deadline: str | None = None
    naics_code: str | None = None
    set_aside: str | None = None
    description: str | None = None
    source_url: str


class SamSearchOutput(BaseModel):
    results: list[SamOpportunity]


# ---------------------------------------------------------------------------
# usaspending_search
# ---------------------------------------------------------------------------
class UsaSpendingSearchInput(BaseModel):
    recipient_uei: str | None = None
    agency: str | None = None
    naics: str | None = None
    posted_after: str | None = None
    limit: int = Field(default=10, ge=1, le=100)


class UsaSpendingAward(BaseModel):
    award_id: str
    recipient_name: str
    agency: str
    award_amount: float
    start_date: str
    naics_code: str | None = None
    description: str | None = None
    source_url: str


class UsaSpendingSearchOutput(BaseModel):
    results: list[UsaSpendingAward]


# ---------------------------------------------------------------------------
# federal_register_search
# ---------------------------------------------------------------------------
class FederalRegisterSearchInput(BaseModel):
    query: str | None = None
    agencies: list[str] | None = None
    posted_after: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class FrNotice(BaseModel):
    document_number: str
    title: str
    agencies: list[str]
    publication_date: str
    document_type: str
    abstract: str | None = None
    source_url: str


class FederalRegisterSearchOutput(BaseModel):
    results: list[FrNotice]


# ---------------------------------------------------------------------------
# db_query
# ---------------------------------------------------------------------------
class DbQueryInput(BaseModel):
    sql: str = Field(description="READ ONLY SQL — enforced via DB role")


class DbQueryOutput(BaseModel):
    rows: list[dict]
    row_count: int


# ---------------------------------------------------------------------------
# rag_search
# ---------------------------------------------------------------------------
class RagSearchInput(BaseModel):
    query: str
    ou_filter: str | None = None
    doc_type_filter: str | None = None
    top_k: int = Field(default=8, ge=1, le=50)


class RagChunk(BaseModel):
    chunk: str
    source_doc: str
    grade: str = Field(description="A, B, or C")
    source_url: str


class RagSearchOutput(BaseModel):
    results: list[RagChunk]


# ---------------------------------------------------------------------------
# web_search
# ---------------------------------------------------------------------------
class WebSearchInput(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)


class WebResult(BaseModel):
    title: str
    url: str
    snippet: str


class WebSearchOutput(BaseModel):
    results: list[WebResult]


# ---------------------------------------------------------------------------
# doctrine_check
# ---------------------------------------------------------------------------
class DoctrineCheckInput(BaseModel):
    claim_text: str
    context: str | None = None


class DoctrineEvaluation(BaseModel):
    alignment_score_by_principle: dict[str, int] = Field(
        description="1-5 score per doctrine principle"
    )
    exclusion_triggers: list[str]
    margin_check: str | None = None
    rationale: str
    source_url: str | None = None


class DoctrineCheckOutput(BaseModel):
    evaluation: DoctrineEvaluation


# ---------------------------------------------------------------------------
# decision_memory_lookup
# ---------------------------------------------------------------------------
class DecisionMemoryLookupInput(BaseModel):
    entity_kind: str
    entity_id: str | None = None
    filters: dict | None = None


class AgentDecision(BaseModel):
    decision_id: str
    entity_kind: str
    entity_id: str
    decision: str
    rationale: str
    created_at: str
    source_url: str


class DecisionMemoryLookupOutput(BaseModel):
    results: list[AgentDecision]


# ---------------------------------------------------------------------------
# file_read
# ---------------------------------------------------------------------------
class FileReadInput(BaseModel):
    doc_id: str


class FileReadOutput(BaseModel):
    doc_text: str
    doc_meta: dict
    source_url: str


# ---------------------------------------------------------------------------
# pwin_score
# ---------------------------------------------------------------------------
class PwinScoreInput(BaseModel):
    opp_id: str


class PwinResult(BaseModel):
    score: int = Field(ge=0, le=100)
    feature_weights: dict[str, float] = Field(default_factory=dict)
    model_version: str
    confidence: float | None = None
    source_url: str


class PwinScoreOutput(BaseModel):
    result: PwinResult | None = None
    warning: str | None = None


# ---------------------------------------------------------------------------
# govwin_search
# ---------------------------------------------------------------------------
class GovwinSearchInput(BaseModel):
    query: str
    agency: str | None = None


class GovwinResult(BaseModel):
    title: str
    agency: str
    status: str
    source_url: str


class GovwinSearchOutput(BaseModel):
    results: list[GovwinResult]
    warning: str | None = None
