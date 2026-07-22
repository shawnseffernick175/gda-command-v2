"""Unit tests for all 11 tools (mock external APIs)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from langchain_core.tools import StructuredTool

from src.agent import _build_langchain_tools
from src.tools.decision_memory import decision_memory_lookup
from src.tools.doctrine_check import doctrine_check
from src.tools.federal_register_search import federal_register_search
from src.tools.file_read import file_read
from src.tools.govwin_search import govwin_search
from src.tools.pwin_score import pwin_score
from src.tools.rag_search import rag_search
from src.tools.registry import TOOL_REGISTRY, get_tool, get_tool_schemas, list_tools
from src.tools.sam_search import sam_search
from src.tools.schemas import (
    DecisionMemoryLookupInput,
    DoctrineCheckInput,
    FederalRegisterSearchInput,
    FileReadInput,
    GovwinSearchInput,
    PwinScoreInput,
    RagSearchInput,
    SamSearchInput,
    UsaSpendingSearchInput,
    WebSearchInput,
)
from src.tools.usaspending_search import usaspending_search
from src.tools.web_search import web_search


class TestToolRegistry:
    def test_all_11_tools_registered(self):
        assert len(TOOL_REGISTRY) == 11

    def test_list_tools(self):
        names = list_tools()
        assert len(names) == 11
        assert "sam_search" in names
        assert "govwin_search" in names

    def test_get_tool(self):
        t = get_tool("sam_search")
        assert t is not None
        assert t.name == "sam_search"

    def test_get_tool_not_found(self):
        assert get_tool("nonexistent") is None

    def test_get_tool_schemas(self):
        schemas = get_tool_schemas()
        assert len(schemas) == 11
        for s in schemas:
            assert "name" in s
            assert "input_schema" in s
            assert "output_schema" in s


@pytest.mark.anyio
class TestSamSearch:
    @respx.mock
    async def test_sam_search_returns_opportunities(self):
        respx.get("https://api.sam.gov/opportunities/v2/search").mock(
            return_value=httpx.Response(
                200,
                json={
                    "opportunitiesData": [
                        {
                            "noticeId": "SAM-001",
                            "title": "Army IT Services",
                            "fullParentPathName": "Department of the Army",
                            "postedDate": "2026-05-01",
                            "responseDeadLine": "2026-06-01",
                            "naicsCode": "541512",
                            "typeOfSetAside": "SBA",
                            "description": "IT modernization services",
                        }
                    ]
                },
            )
        )
        result = await sam_search(SamSearchInput(query="Army IT"))
        assert len(result.results) == 1
        opp = result.results[0]
        assert opp.notice_id == "SAM-001"
        assert "sam.gov" in opp.source_url

    @respx.mock
    async def test_sam_search_empty(self):
        respx.get("https://api.sam.gov/opportunities/v2/search").mock(
            return_value=httpx.Response(200, json={"opportunitiesData": []})
        )
        result = await sam_search(SamSearchInput(query="nonexistent"))
        assert len(result.results) == 0


@pytest.mark.anyio
class TestUsaSpendingSearch:
    @respx.mock
    async def test_usaspending_returns_awards(self):
        respx.post("https://api.usaspending.gov/api/v2/search/spending_by_award/").mock(
            return_value=httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "Award ID": "AWD-001",
                            "Recipient Name": "Envision",
                            "Awarding Agency": "Army",
                            "Award Amount": 1000000,
                            "Start Date": "2026-01-01",
                            "NAICS Code": "541512",
                            "Description": "IT services contract",
                        }
                    ]
                },
            )
        )
        result = await usaspending_search(UsaSpendingSearchInput(agency="Army"))
        assert len(result.results) == 1
        assert "usaspending.gov" in result.results[0].source_url


@pytest.mark.anyio
class TestFederalRegisterSearch:
    @respx.mock
    async def test_fr_search_returns_notices(self):
        respx.get("https://www.federalregister.gov/api/v1/documents.json").mock(
            return_value=httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "document_number": "2026-12345",
                            "title": "Notice of Proposed Rulemaking",
                            "agencies": [{"name": "DOD"}],
                            "publication_date": "2026-05-01",
                            "type": "Rule",
                            "abstract": "Defense procurement rule",
                            "html_url": "https://www.federalregister.gov/d/2026-12345",
                        }
                    ]
                },
            )
        )
        result = await federal_register_search(
            FederalRegisterSearchInput(query="defense procurement")
        )
        assert len(result.results) == 1
        assert "federalregister.gov" in result.results[0].source_url


@pytest.mark.anyio
class TestDbQuery:
    async def test_write_rejected(self):
        from src.db import run_readonly_query

        with pytest.raises(PermissionError, match="Only SELECT"):
            await run_readonly_query("DELETE FROM users")

    async def test_insert_rejected(self):
        from src.db import run_readonly_query

        with pytest.raises(PermissionError, match="Only SELECT"):
            await run_readonly_query("INSERT INTO users VALUES (1)")

    async def test_update_rejected(self):
        from src.db import run_readonly_query

        with pytest.raises(PermissionError, match="Only SELECT"):
            await run_readonly_query("UPDATE users SET name='x'")

    async def test_writable_cte_rejected(self):
        from src.db import run_readonly_query

        with pytest.raises(PermissionError, match="disallowed DML keyword"):
            await run_readonly_query(
                "WITH d AS (DELETE FROM agent_runs RETURNING *) SELECT * FROM d"
            )

    async def test_drop_rejected(self):
        from src.db import run_readonly_query

        with pytest.raises(PermissionError, match="Only SELECT"):
            await run_readonly_query("DROP TABLE agent_runs")

    async def test_truncate_rejected(self):
        from src.db import run_readonly_query

        with pytest.raises(PermissionError, match="Only SELECT"):
            await run_readonly_query("TRUNCATE agent_runs")


@pytest.mark.anyio
class TestRagSearch:
    @respx.mock
    async def test_rag_maps_backend_results(self):
        respx.post("http://localhost:4000/v3/rag/search").mock(
            return_value=httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "results": [
                            {
                                "chunk_text": "Envision won the X contract.",
                                "document_id": "doc-1",
                                "source_filename": "past_perf.pdf",
                                "source_url": "https://files.gda/doc-1",
                                "evidence_grade": "A",
                            }
                        ]
                    },
                },
            )
        )
        result = await rag_search(RagSearchInput(query="contract wins"))
        assert len(result.results) == 1
        assert result.results[0].chunk == "Envision won the X contract."
        assert result.results[0].grade == "A"
        assert result.results[0].source_url == "https://files.gda/doc-1"

    @respx.mock
    async def test_rag_falls_back_to_document_url_when_no_source(self):
        respx.post("http://localhost:4000/v3/rag/search").mock(
            return_value=httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "results": [
                            {
                                "chunk_text": "text",
                                "document_id": "doc-9",
                                "source_filename": "f.pdf",
                                "source_url": None,
                                "evidence_grade": None,
                            }
                        ]
                    },
                },
            )
        )
        result = await rag_search(RagSearchInput(query="x"))
        assert len(result.results) == 1
        assert result.results[0].source_url == "http://localhost:4000/v3/rag/documents/doc-9"
        assert result.results[0].grade == "C"

    @respx.mock
    async def test_rag_empty_when_no_results(self):
        respx.post("http://localhost:4000/v3/rag/search").mock(
            return_value=httpx.Response(200, json={"success": True, "data": {"results": []}})
        )
        result = await rag_search(RagSearchInput(query="nothing"))
        assert result.results == []


@pytest.mark.anyio
class TestWebSearch:
    async def test_web_search_no_keys(self, monkeypatch):
        import src.tools.web_search as ws

        monkeypatch.setattr(ws, "TAVILY_API_KEY", "")
        monkeypatch.setattr(ws, "PERPLEXITY_API_KEY", "")
        result = await web_search(WebSearchInput(query="test"))
        assert len(result.results) == 1
        assert "unavailable" in result.results[0].title.lower()
        assert result.results[0].url

    @respx.mock
    async def test_web_search_tavily(self, monkeypatch):
        import src.tools.web_search as ws

        monkeypatch.setattr(ws, "TAVILY_API_KEY", "test-key")
        respx.post("https://api.tavily.com/search").mock(
            return_value=httpx.Response(
                200,
                json={
                    "results": [
                        {"title": "Result 1", "url": "https://example.com", "content": "snippet"}
                    ]
                },
            )
        )
        result = await web_search(WebSearchInput(query="test"))
        assert len(result.results) == 1
        assert result.results[0].url == "https://example.com"


@pytest.mark.anyio
class TestDoctrineCheck:
    async def test_doctrine_stub(self):
        result = await doctrine_check(
            DoctrineCheckInput(claim_text="We should pursue this Army contract")
        )
        assert len(result.evaluation.alignment_score_by_principle) == 7
        # Honest stub: no fabricated source URL (R1).
        assert result.evaluation.source_url is None


@pytest.mark.anyio
class TestDecisionMemory:
    async def test_decision_memory_stub(self):
        result = await decision_memory_lookup(
            DecisionMemoryLookupInput(entity_kind="opportunity", entity_id="123")
        )
        assert result.results == []


@pytest.mark.anyio
class TestFileRead:
    @respx.mock
    async def test_file_read_not_found(self):
        respx.get("http://localhost:4000/v3/files/doc-999").mock(return_value=httpx.Response(404))
        result = await file_read(FileReadInput(doc_id="doc-999"))
        assert result.doc_text == ""
        assert "not found" in result.doc_meta.get("error", "")

    @respx.mock
    async def test_file_read_success(self):
        respx.get("http://localhost:4000/v3/files/doc-001").mock(
            return_value=httpx.Response(
                200,
                json={
                    "text": "Contract document content",
                    "meta": {"type": "pdf"},
                    "source_url": "https://files.gda/doc-001",
                },
            )
        )
        result = await file_read(FileReadInput(doc_id="doc-001"))
        assert result.doc_text == "Contract document content"
        assert result.source_url == "https://files.gda/doc-001"


@pytest.mark.anyio
class TestPwinScore:
    async def test_pwin_reads_cached_analysis(self, monkeypatch):
        import src.tools.pwin_score as ps

        monkeypatch.setattr(
            ps,
            "fetch_readonly",
            AsyncMock(
                return_value=[
                    {
                        "pwin": 0.72,
                        "version": "v1",
                        "opp_pk": "5",
                        "sam_notice_id": "abc",
                        "source_url": "https://sam.gov/opp/abc/view",
                    }
                ]
            ),
        )
        result = await pwin_score(PwinScoreInput(opp_id="5"))
        assert result.result is not None
        assert result.result.score == 72
        assert result.result.model_version == "analysis-cache:v1"
        assert result.result.source_url == "https://sam.gov/opp/abc/view"

    async def test_pwin_warns_when_not_analyzed(self, monkeypatch):
        import src.tools.pwin_score as ps

        monkeypatch.setattr(ps, "fetch_readonly", AsyncMock(return_value=[]))
        result = await pwin_score(PwinScoreInput(opp_id="opp-123"))
        assert result.result is None
        assert result.warning is not None


@pytest.mark.anyio
class TestGovwinSearch:
    async def test_govwin_returns_ingested_rows(self, monkeypatch):
        import src.tools.govwin_search as gs

        monkeypatch.setattr(
            gs,
            "fetch_readonly",
            AsyncMock(
                return_value=[
                    {
                        "title": "Army ISR services",
                        "agency": "Department of the Army",
                        "status": "tracking",
                        "source_url": "https://iq.govwin.com/opp/123",
                    }
                ]
            ),
        )
        result = await govwin_search(GovwinSearchInput(query="Army"))
        assert len(result.results) == 1
        assert result.results[0].source_url == "https://iq.govwin.com/opp/123"
        assert result.warning is None

    async def test_govwin_warns_when_no_match(self, monkeypatch):
        import src.tools.govwin_search as gs

        monkeypatch.setattr(gs, "fetch_readonly", AsyncMock(return_value=[]))
        result = await govwin_search(GovwinSearchInput(query="nonexistent"))
        assert result.results == []
        assert result.warning is not None


# ---------------------------------------------------------------------------
# _build_langchain_tools (StructuredTool construction)
# ---------------------------------------------------------------------------


class TestBuildLangchainTools:
    def test_build_all_tools_no_error(self):
        tools = _build_langchain_tools(None)
        assert len(tools) == len(TOOL_REGISTRY)
        for t in tools:
            assert isinstance(t, StructuredTool)
            assert t.name in TOOL_REGISTRY
            assert t.coroutine is not None

    def test_build_single_tool_filter(self):
        tools = _build_langchain_tools(["sam_search"])
        assert len(tools) == 1
        assert tools[0].name == "sam_search"

    @pytest.mark.anyio
    async def test_tool_coroutine_returns_json(self):
        """Build a tool and invoke its coroutine with a mocked fn."""
        from src.agent import _make_tool_coroutine
        from src.tools.registry import ToolDef
        from src.tools.schemas import SamSearchInput, SamSearchOutput

        mock_output = SamSearchOutput(results=[])
        mock_fn = AsyncMock(return_value=mock_output)

        tdef = ToolDef(
            name="test_tool",
            description="test",
            input_schema=SamSearchInput,
            output_schema=SamSearchOutput,
            fn=mock_fn,
        )
        coro = _make_tool_coroutine(tdef)
        result = await coro(query="test")
        parsed = json.loads(result)
        assert parsed["results"] == []
        mock_fn.assert_awaited_once()
