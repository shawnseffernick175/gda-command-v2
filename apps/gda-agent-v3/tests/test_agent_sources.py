"""Tests for R1 source aggregation from tool outputs (agent.py)."""

from __future__ import annotations

import json

from src.agent import _extract_source_urls


class TestExtractSourceUrls:
    def test_extracts_nested_source_urls_from_result_list(self) -> None:
        output = json.dumps(
            {
                "results": [
                    {"title": "A", "source_url": "https://sam.gov/opp/1/view"},
                    {"title": "B", "source_url": "https://sam.gov/opp/2/view"},
                ]
            }
        )
        assert _extract_source_urls(output) == [
            "https://sam.gov/opp/1/view",
            "https://sam.gov/opp/2/view",
        ]

    def test_extracts_top_level_source_url(self) -> None:
        output = json.dumps({"content": "…", "source_url": "https://example.gov/doc"})
        assert _extract_source_urls(output) == ["https://example.gov/doc"]

    def test_skips_null_and_blank_source_urls(self) -> None:
        output = json.dumps(
            {
                "results": [
                    {"source_url": None},
                    {"source_url": "   "},
                    {"source_url": "https://real.gov/x"},
                ]
            }
        )
        assert _extract_source_urls(output) == ["https://real.gov/x"]

    def test_returns_empty_for_non_json(self) -> None:
        assert _extract_source_urls("not json") == []
        assert _extract_source_urls("") == []

    def test_returns_empty_when_no_source_url_present(self) -> None:
        output = json.dumps({"principle_scores": {"a": 3, "b": 3}})
        assert _extract_source_urls(output) == []
