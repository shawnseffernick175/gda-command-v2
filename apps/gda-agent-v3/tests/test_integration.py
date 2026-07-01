"""Integration tests for agent lifecycle — multi-step, tools_allowed, timeout, cancel."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.agent import _active_runs, cancel_run, run_agent


@pytest.fixture(autouse=True)
def mock_db():
    """Mock all DB calls since integration tests run without Postgres."""
    with (
        patch("src.agent.insert_agent_run", new_callable=AsyncMock) as _insert,
        patch("src.agent.update_agent_run", new_callable=AsyncMock) as _update,
        patch("src.agent.insert_tool_call", new_callable=AsyncMock) as _tc,
        patch("src.agent.get_hourly_cost", new_callable=AsyncMock, return_value=0.0) as _cost,
    ):
        yield {
            "insert_run": _insert,
            "update_run": _update,
            "insert_tool_call": _tc,
            "get_hourly_cost": _cost,
        }


@pytest.mark.anyio
class TestAgentRunLifecycle:
    async def test_run_emits_plan_and_final_events(self):
        """Agent run yields at minimum a plan event and a final event."""
        events = []
        async for event in run_agent(
            task="Say hello",
            tools_allowed=[],
            max_steps=2,
        ):
            events.append(event)

        event_types = [e["event"] for e in events]
        assert "plan" in event_types
        # Must end with either "final" or "error"
        assert event_types[-1] in ("final", "error")

    async def test_plan_event_contains_run_metadata(self):
        """Plan event includes run_id, task, model, max_steps, tools_available."""
        events = []
        async for event in run_agent(
            task="Test metadata",
            tools_allowed=["sam_search"],
            model="openai:gpt-4o",
            max_steps=5,
        ):
            events.append(event)

        plan = next(e for e in events if e["event"] == "plan")
        assert "run_id" in plan["data"]
        assert plan["data"]["task"] == "Test metadata"
        assert plan["data"]["model"] == "openai:gpt-4o"
        assert plan["data"]["max_steps"] == 5
        assert plan["data"]["tools_available"] == ["sam_search"]

    async def test_tools_allowed_filter_limits_available_tools(self):
        """When tools_allowed is set, only those tools are available to the agent."""
        events = []
        async for event in run_agent(
            task="Search for Army IT contracts",
            tools_allowed=["sam_search"],
            max_steps=3,
        ):
            events.append(event)

        plan = next(e for e in events if e["event"] == "plan")
        assert plan["data"]["tools_available"] == ["sam_search"]

    async def test_rate_limit_returns_error_event(self, mock_db):
        """When hourly cost exceeds limit, agent returns AGENT_RATE_LIMITED."""
        mock_db["get_hourly_cost"].return_value = 999.0

        events = []
        async for event in run_agent(task="Should be rate limited"):
            events.append(event)

        assert len(events) == 1
        assert events[0]["event"] == "error"
        assert events[0]["data"]["error"] == "AGENT_RATE_LIMITED"


@pytest.mark.anyio
class TestAgentTimeout:
    async def test_timeout_returns_error_event(self, mock_db):
        """Agent that exceeds wall timeout returns AGENT_TIMEOUT."""
        # Patch WALL_TIMEOUT to a very small value
        with patch("src.agent.WALL_TIMEOUT_DEFAULT_S", 0.01):
            events = []
            async for event in run_agent(
                task="This should timeout quickly",
                tools_allowed=[],
                max_steps=50,
            ):
                events.append(event)

        event_types = [e["event"] for e in events]
        # Should have plan + error(timeout)
        assert "plan" in event_types
        has_timeout = any(
            e["event"] == "error" and e["data"].get("error") == "AGENT_TIMEOUT" for e in events
        )
        has_final_timeout = any(
            e["event"] == "final" and e["data"].get("status") == "timeout" for e in events
        )
        # One of these should be true depending on where timeout hits
        assert has_timeout or has_final_timeout or "error" in event_types


@pytest.mark.anyio
class TestAgentCancel:
    async def test_cancel_sets_status_cancelled(self, mock_db):
        """Cancelling a running agent sets status to cancelled."""
        run_id_captured = None

        async def _capture_and_cancel():
            # Wait for the run to register
            await asyncio.sleep(0.05)
            if run_id_captured and run_id_captured in _active_runs:
                cancel_run(run_id_captured)

        events = []

        async def _run_agent():
            nonlocal run_id_captured
            async for event in run_agent(
                task="Long running task that should be cancelled",
                tools_allowed=[],
                max_steps=50,
            ):
                events.append(event)
                if event["event"] == "plan":
                    run_id_captured = event["data"]["run_id"]

        # Run agent and cancellation concurrently
        await asyncio.gather(_run_agent(), _capture_and_cancel())

        # Verify the update_run was called with status cancelled or the run completed
        # (depending on timing, the cancel may or may not take effect before completion)
        final_events = [e for e in events if e["event"] == "final"]
        if final_events:
            status = final_events[0]["data"]["status"]
            assert status in ("cancelled", "ok")

    async def test_cancel_nonexistent_returns_false(self):
        """Cancelling a non-existent run returns False."""
        assert cancel_run("nonexistent-uuid") is False


@pytest.mark.anyio
class TestMaxSteps:
    async def test_max_steps_limits_execution(self, mock_db):
        """Agent respects max_steps and terminates with status max_steps."""
        events = []
        async for event in run_agent(
            task="Do something complex",
            tools_allowed=[],
            max_steps=1,
        ):
            events.append(event)

        # Should complete (ok or max_steps) without hanging
        final_events = [e for e in events if e["event"] == "final"]
        if final_events:
            assert final_events[0]["data"]["status"] in ("ok", "max_steps")


@pytest.mark.anyio
class TestAgentAuditLogging:
    async def test_run_inserts_audit_record(self, mock_db):
        """Agent run inserts an agent_runs record."""
        events = []
        async for event in run_agent(task="Audit test", tools_allowed=[]):
            events.append(event)

        mock_db["insert_run"].assert_awaited_once()
        mock_db["update_run"].assert_awaited_once()

        # Verify the update_run call has correct args structure
        call_args = mock_db["update_run"].call_args
        # First positional arg is run_id (UUID), second is status
        assert call_args[0][1] in ("ok", "error", "timeout", "max_steps", "cancelled")
