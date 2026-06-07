"""Unit tests for all 12 tools (mock external APIs)."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from src.tools.sam_search import sam_search
from src.tools.usaspending_search import usaspending_search
from src.tools.federal_register_search import federal_register_search
from src.tools.db_query import db_query
from src.tools.rag_search import rag_search
from src.tools.web_search import web_search
from src.tools.doctrine_check import doctrine_check
from src.tools.decision_memory import decision_memory_lookup
from src.tools.file_read import file_read
from src.tools.pwin_score import pwin_score
from src.tools.govwin_search import govwin_search
from src.tools.govtribe_search import govtribe_search

from src.tools.schemas import (
    SamSearchInput,
    UsaSpendingSearchInput,
    FederalRegisterSearchInput,
    DbQueryInput,
    RagSearchInput,
    WebSearchInput,
    DoctrineCheckInput,
    DecisionMemoryLookupInput,
    FileReadInput,
    PwinScoreInput,
    GovwinSearchInput,
    GovtribeSearchInput,
)
from src.tools.registry import TOOL_REGISTRY, list_tools, get_tool, get_tool_schemas


class TestToolRegistry:
    def test_all_12_tools_registered(self):
        assert len(TOOL_REGISTRY) == 12

    def test_list_tools(self):
        names = list_tools()
        assert len(names) == 12
        assert "sam_search" in names
        assert "govwin_search" in names
        assert "govtribe_search" in names

    def test_get_tool(self):
        t = get_tool("sam_search")
        assert t is not None
        assert t.name == "sam_search"

    def test_get_tool_not_found(self):
        assert get_tool("nonexistent") is None

    def test_get_tool_schemas(self):
        schemas = get_tool_schemas()
        assert len(schemas) == 12
        for s in schemas:
            assert "name" in s
            assert "input_schema" in s
            assert "output_schema" in s


@pytest.mark.anyio
class TestSamSearch:
    @respx.mock
    async def test_sam_search_returns_opportunities(self):
        respx.get("https://api.sam.gov/opportunities/v2/search").mock(
            return_value=httpx.Response(200, json={
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
            })
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
            return_value=httpx.Response(200, json={
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
            })
        )
        result = await usaspending_search(UsaSpendingSearchInput(agency="Army"))
        assert len(result.results) == 1
        assert "usaspending.gov" in result.results[0].source_url


@pytest.mark.anyio
class TestFederalRegisterSearch:
    @respx.mock
    async def test_fr_search_returns_notices(self):
        respx.get("https://www.federalregister.gov/api/v1/documents.json").mock(
            return_value=httpx.Response(200, json={
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
            })
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
    async def test_rag_stub_returns_pending(self):
        result = await rag_search(RagSearchInput(query="test"))
        assert len(result.results) == 1
        assert "F-301" in result.results[0].chunk
        assert result.results[0].source_url


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
            return_value=httpx.Response(200, json={
                "results": [
                    {"title": "Result 1", "url": "https://example.com", "content": "snippet"}
                ]
            })
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
        assert result.evaluation.source_url


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
        respx.get("http://localhost:4000/v3/files/doc-999").mock(
            return_value=httpx.Response(404)
        )
        result = await file_read(FileReadInput(doc_id="doc-999"))
        assert result.doc_text == ""
        assert "not found" in result.doc_meta.get("error", "")

    @respx.mock
    async def test_file_read_success(self):
        respx.get("http://localhost:4000/v3/files/doc-001").mock(
            return_value=httpx.Response(200, json={
                "text": "Contract document content",
                "meta": {"type": "pdf"},
                "source_url": "https://files.gda/doc-001",
            })
        )
        result = await file_read(FileReadInput(doc_id="doc-001"))
        assert result.doc_text == "Contract document content"
        assert result.source_url == "https://files.gda/doc-001"


@pytest.mark.anyio
class TestPwinScore:
    async def test_pwin_stub(self):
        result = await pwin_score(PwinScoreInput(opp_id="opp-123"))
        assert result.result.score == 50
        assert result.result.model_version == "v0.0.1-stub"
        assert result.result.source_url


@pytest.mark.anyio
class TestGovwinSearch:
    async def test_govwin_stub_returns_empty_with_warning(self):
        result = await govwin_search(GovwinSearchInput(query="Army"))
        assert result.results == []
        assert result.warning is not None
        assert "not configured" in result.warning


@pytest.mark.anyio
class TestGovtribeSearch:
    @respx.mock
    async def test_govtribe_search_returns_opportunities(self):
        respx.post("http://localhost:4000/v3/govtribe/search").mock(
            return_value=httpx.Response(200, json={
                "success": True,
                "data": {
                    "results": [
                        {
                            "_id": "gt-001",
                            "attributes": {
                                "title": "Cyber Defense Services",
                                "agency": {"name": "Department of Defense"},
                                "postedDate": "2026-05-28",
                                "responseDate": "2026-06-28",
                                "slug": "cyber-defense-services",
                                "estimatedValue": {"high": 5000000},
                                "setAside": "Total Small Business",
                            },
                        }
                    ],
                    "decision": "called",
                    "credits_used": 3,
                    "from_cache": False,
                },
            })
        )
        result = await govtribe_search(
            GovtribeSearchInput(query="cyber", agency="DoD", posted_within="7d", max_results=5)
        )
        assert len(result.results) == 1
        opp = result.results[0]
        assert opp.notice_id == "gt-001"
        assert opp.title == "Cyber Defense Services"
        assert opp.agency == "Department of Defense"
        assert "govtribe.com" in opp.govtribe_url
        assert opp.estimated_value == 5000000
        assert opp.set_aside == "Total Small Business"
        assert result.decision == "called"
        assert result.credits_used == 3
        assert result.from_cache is False

    @respx.mock
    async def test_govtribe_search_cached(self):
        respx.post("http://localhost:4000/v3/govtribe/search").mock(
            return_value=httpx.Response(200, json={
                "success": True,
                "data": {
                    "results": [
                        {
                            "_id": "gt-001",
                            "attributes": {
                                "title": "Cyber Defense Services",
                                "slug": "cyber-defense-services",
                            },
                        }
                    ],
                    "decision": "cached",
                    "credits_used": 0,
                    "from_cache": True,
                },
            })
        )
        result = await govtribe_search(
            GovtribeSearchInput(query="cyber", max_results=5)
        )
        assert len(result.results) == 1
        assert result.decision == "cached"
        assert result.credits_used == 0
        assert result.from_cache is True

    @respx.mock
    async def test_govtribe_search_skipped_cycle_cap(self):
        respx.post("http://localhost:4000/v3/govtribe/search").mock(
            return_value=httpx.Response(200, json={
                "success": True,
                "data": {
                    "results": None,
                    "decision": "skipped_cycle_cap",
                    "credits_used": 0,
                    "from_cache": False,
                },
            })
        )
        result = await govtribe_search(
            GovtribeSearchInput(query="cyber")
        )
        assert result.results == []
        assert result.decision == "skipped_cycle_cap"
        assert result.warning is not None
        assert "skipped" in result.warning

    @respx.mock
    async def test_govtribe_search_empty_results(self):
        respx.post("http://localhost:4000/v3/govtribe/search").mock(
            return_value=httpx.Response(200, json={
                "success": True,
                "data": {
                    "results": [],
                    "decision": "called",
                    "credits_used": 3,
                    "from_cache": False,
                },
            })
        )
        result = await govtribe_search(
            GovtribeSearchInput(query="nonexistent-query-xyz")
        )
        assert result.results == []
        assert result.decision == "called"

    @respx.mock
    async def test_govtribe_search_http_error(self):
        respx.post("http://localhost:4000/v3/govtribe/search").mock(
            return_value=httpx.Response(500, json={"error": "internal"})
        )
        result = await govtribe_search(
            GovtribeSearchInput(query="cyber")
        )
        assert result.results == []
        assert result.warning is not None
        assert "500" in result.warning


# ---------------------------------------------------------------------------
# _build_langchain_tools (StructuredTool construction)
# ---------------------------------------------------------------------------
from unittest.mock import AsyncMock
from langchain_core.tools import StructuredTool
from src.agent import _build_langchain_tools


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
        from src.tools.registry import ToolDef
        from src.agent import _make_tool_coroutine
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
