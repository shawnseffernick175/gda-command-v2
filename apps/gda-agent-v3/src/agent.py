"""LangGraph-based agent runtime with SSE streaming and audit logging."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
import uuid
from typing import Annotated, Any, AsyncGenerator

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel

from src.config import (
    ANTHROPIC_API_KEY,
    DEFAULT_MODEL,
    HOURLY_COST_LIMIT_USD,
    MAX_STEPS_DEFAULT,
    OPENAI_API_KEY,
    WALL_TIMEOUT_DEFAULT_S,
)
from src.db import (
    get_hourly_cost,
    insert_agent_run,
    insert_tool_call,
    update_agent_run,
)
from src.tools.registry import TOOL_REGISTRY, ToolDef

logger = logging.getLogger("gda-agent")

# Cost per token (approximate — updated periodically)
COST_TABLE: dict[str, dict[str, float]] = {
    "gpt-4o": {"prompt": 2.5 / 1_000_000, "completion": 10.0 / 1_000_000},
    "gpt-5": {"prompt": 2.5 / 1_000_000, "completion": 10.0 / 1_000_000},
    "claude-sonnet-4-6": {"prompt": 3.0 / 1_000_000, "completion": 15.0 / 1_000_000},
}

# Running agent tasks keyed by run_id
_active_runs: dict[str, asyncio.Event] = {}


class AgentState(BaseModel):
    messages: Annotated[list[BaseMessage], add_messages]
    step_count: int = 0


def _parse_model_spec(spec: str) -> tuple[str, str]:
    """Parse 'provider:model_name' into (provider, model_name)."""
    if ":" in spec:
        provider, model = spec.split(":", 1)
        return provider, model
    return "openai", spec


def _build_llm(model_spec: str) -> ChatOpenAI | ChatAnthropic:
    provider, model_name = _parse_model_spec(model_spec)
    if provider == "anthropic":
        return ChatAnthropic(
            model=model_name,
            api_key=ANTHROPIC_API_KEY,
            max_tokens=4096,
        )
    return ChatOpenAI(
        model=model_name,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )


def _make_tool_coroutine(tool_def: ToolDef):
    """Factory that returns a coroutine with *tool_def* correctly bound."""

    async def _invoke(**kwargs: Any) -> str:
        inp = tool_def.input_schema(**kwargs)
        result = await tool_def.fn(inp)
        return result.model_dump_json()

    return _invoke


def _build_langchain_tools(
    allowed: list[str] | None,
) -> list[Any]:
    """Convert our Pydantic-typed tools into LangChain tool callables."""
    tools = []
    registry_items = (
        {k: v for k, v in TOOL_REGISTRY.items() if k in allowed}
        if allowed is not None
        else TOOL_REGISTRY
    )

    for name, tdef in registry_items.items():
        tools.append(
            StructuredTool.from_function(
                coroutine=_make_tool_coroutine(tdef),
                name=name,
                description=tdef.description,
                args_schema=tdef.input_schema,
            )
        )

    return tools


async def run_agent(
    task: str,
    context: dict[str, Any] | None = None,
    tools_allowed: list[str] | None = None,
    model: str | None = None,
    max_steps: int | None = None,
    caller: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Execute agent task, yielding SSE events."""
    run_id = uuid.uuid4()
    model_spec = model or DEFAULT_MODEL
    effective_max_steps = max_steps or MAX_STEPS_DEFAULT

    # Rate limit check
    hourly_cost = await get_hourly_cost()
    if hourly_cost > HOURLY_COST_LIMIT_USD:
        yield {
            "event": "error",
            "data": {
                "run_id": str(run_id),
                "error": "AGENT_RATE_LIMITED",
                "detail": f"Hourly cost ${hourly_cost:.2f} exceeds limit ${HOURLY_COST_LIMIT_USD:.2f}",
            },
        }
        return

    # Insert run record
    await insert_agent_run(run_id, task, model_spec, context, caller)

    # Set up cancellation
    cancel_event = asyncio.Event()
    _active_runs[str(run_id)] = cancel_event

    lc_tools = _build_langchain_tools(tools_allowed)
    llm = _build_llm(model_spec)
    llm_with_tools = llm.bind_tools(lc_tools) if lc_tools else llm

    # Build LangGraph
    def should_continue(state: AgentState) -> str:
        last = state.messages[-1] if state.messages else None
        if isinstance(last, AIMessage) and last.tool_calls:
            return "tools"
        return END

    async def call_model(state: AgentState) -> dict[str, Any]:
        response = await llm_with_tools.ainvoke(state.messages)
        return {"messages": [response], "step_count": state.step_count + 1}

    tool_node = ToolNode(lc_tools) if lc_tools else None

    graph_builder = StateGraph(AgentState)
    graph_builder.add_node("agent", call_model)
    if tool_node:
        graph_builder.add_node("tools", tool_node)
    graph_builder.add_edge(START, "agent")
    if tool_node:
        graph_builder.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
        graph_builder.add_edge("tools", "agent")
    else:
        graph_builder.add_edge("agent", END)

    graph = graph_builder.compile()

    # Yield plan event
    yield {
        "event": "plan",
        "data": {
            "run_id": str(run_id),
            "task": task,
            "model": model_spec,
            "max_steps": effective_max_steps,
            "tools_available": tools_allowed or list(TOOL_REGISTRY.keys()),
        },
    }

    step_count = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    final_output = ""
    status = "ok"
    error_msg = None

    try:
        context_str = json.dumps(context) if context else ""
        system_msg = (
            "You are GDA Command's AI agent. You analyze government contracting "
            "opportunities, check doctrine alignment, search federal databases, "
            "and provide evidence-backed recommendations. Every data point must "
            "include a source URL. Use the available tools to complete the task."
        )
        if context_str:
            system_msg += f"\n\nContext: {context_str}"

        initial_messages: list[BaseMessage] = [
            HumanMessage(content=f"{system_msg}\n\nTask: {task}")
        ]

        start_time = time.monotonic()

        async for event in graph.astream_events(
            {"messages": initial_messages, "step_count": 0},
            version="v2",
        ):
            if cancel_event.is_set():
                status = "cancelled"
                break

            elapsed = time.monotonic() - start_time
            if elapsed > WALL_TIMEOUT_DEFAULT_S:
                status = "timeout"
                error_msg = "AGENT_TIMEOUT"
                break

            if step_count >= effective_max_steps:
                status = "max_steps"
                break

            kind = event.get("event", "")

            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    yield {
                        "event": "intermediate",
                        "data": {"run_id": str(run_id), "content": chunk.content},
                    }

            elif kind == "on_chat_model_end":
                output = event.get("data", {}).get("output")
                if output and hasattr(output, "usage_metadata") and output.usage_metadata:
                    usage = output.usage_metadata
                    total_prompt_tokens += usage.get("input_tokens", 0)
                    total_completion_tokens += usage.get("output_tokens", 0)

                if output and isinstance(output, AIMessage):
                    if output.tool_calls:
                        for tc in output.tool_calls:
                            step_count += 1
                            call_id = uuid.uuid4()
                            yield {
                                "event": "tool_call",
                                "data": {
                                    "run_id": str(run_id),
                                    "call_id": str(call_id),
                                    "tool": tc["name"],
                                    "input": tc["args"],
                                    "step_index": step_count,
                                },
                            }
                    elif output.content:
                        final_output = (
                            output.content
                            if isinstance(output.content, str)
                            else str(output.content)
                        )

            elif kind == "on_tool_end":
                tool_output = event.get("data", {}).get("output")
                tool_name = event.get("name", "")

                output_data = str(tool_output) if tool_output else ""
                yield {
                    "event": "tool_result",
                    "data": {
                        "run_id": str(run_id),
                        "tool": tool_name,
                        "output_preview": output_data[:500],
                        "step_index": step_count,
                    },
                }

                # Log tool call to DB
                await insert_tool_call(
                    call_id=uuid.uuid4(),
                    run_id=run_id,
                    step_index=step_count,
                    tool_name=tool_name,
                    tool_input={},
                    tool_output={"result": output_data[:2000]},
                    latency_ms=0,
                )

    except Exception as exc:
        status = "error"
        error_msg = str(exc)
        logger.error("Agent run %s failed: %s\n%s", run_id, exc, traceback.format_exc())

    finally:
        _active_runs.pop(str(run_id), None)

    # Compute cost
    _, model_name = _parse_model_spec(model_spec)
    cost_rates = COST_TABLE.get(model_name, {"prompt": 0, "completion": 0})
    total_tokens = total_prompt_tokens + total_completion_tokens
    cost_usd = (
        total_prompt_tokens * cost_rates["prompt"]
        + total_completion_tokens * cost_rates["completion"]
    )

    token_usage = {
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost_usd, 6),
    }

    await update_agent_run(run_id, status, final_output or None, error_msg, step_count, token_usage)

    if status == "timeout":
        yield {
            "event": "error",
            "data": {
                "run_id": str(run_id),
                "error": "AGENT_TIMEOUT",
                "partial_output": final_output[:500] if final_output else None,
            },
        }
    else:
        yield {
            "event": "final",
            "data": {
                "run_id": str(run_id),
                "status": status,
                "output": final_output,
                "step_count": step_count,
                "token_usage": token_usage,
            },
        }


def cancel_run(run_id: str) -> bool:
    event = _active_runs.get(run_id)
    if event is not None:
        event.set()
        return True
    return False
