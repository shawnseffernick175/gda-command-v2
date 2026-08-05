"use client";

import { useState } from "react";
import { useAskAi, useAgentHealth } from "@/hooks/use-llm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AskAiPanel({
  objectType,
  objectId,
  context,
  className,
  inputId,
  alwaysOpen,
}: {
  objectType: string;
  objectId: string;
  context?: Record<string, unknown>;
  className?: string;
  inputId?: string;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!alwaysOpen);
  const [question, setQuestion] = useState("");
  const askAi = useAskAi();
  const health = useAgentHealth();
  const agentDown = health.data?.agent_v3 === "unreachable";

  function handleAsk() {
    if (!question.trim()) return;
    askAi.mutate({
      question: question.trim(),
      object_type: objectType,
      object_id: objectId,
      context,
    });
  }

  if (!open && !alwaysOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-gda-cyan hover:text-gda-cyan"
        onClick={() => setOpen(true)}
      >
        Ask AI
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "rounded border border-border bg-gda-bg-raised p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-xs font-medium text-foreground">
          Ask AI — {objectType}
        </h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          x
        </button>
      </div>
      {agentDown && (
        <p className="rounded border border-gda-amber/40 bg-gda-amber/10 px-2 py-1 text-xs text-gda-amber">
          Analysis service unavailable — questions can&apos;t be answered right now.
        </p>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder={agentDown ? "Analysis service unavailable" : "Ask about this item..."}
          disabled={agentDown}
          className="flex-1 rounded border border-border bg-gda-bg-base px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none disabled:opacity-50"
        />
        <Button
          size="sm"
          onClick={handleAsk}
          disabled={agentDown || askAi.isPending || !question.trim()}
          className="bg-gda-cyan text-gda-bg-deep hover:bg-gda-cyan/80"
        >
          {askAi.isPending ? "..." : "Ask"}
        </Button>
      </div>
      {askAi.data && (
        <div className="rounded border border-border bg-gda-bg-base p-3 text-sm text-foreground space-y-2">
          {askAi.data.answer ? (
            <p className="whitespace-pre-wrap">{askAi.data.answer}</p>
          ) : (
            <p className="text-gda-amber italic">
              AI response pending — intelligence layer activating
            </p>
          )}
          {askAi.data.unverified_citations &&
            askAi.data.unverified_citations.length > 0 && (
              <div className="rounded border border-gda-red/40 bg-gda-red/10 px-2 py-1 text-xs text-gda-red">
                <span className="font-medium">
                  {askAi.data.unverified_citations.length} citation
                  {askAi.data.unverified_citations.length === 1 ? "" : "s"} not backed
                  by a retrieved source
                </span>{" "}
                — treat as unverified:
                <ul className="mt-1 list-disc space-y-0.5 pl-4 break-all">
                  {askAi.data.unverified_citations.map((url) => (
                    <li key={url}>{url}</li>
                  ))}
                </ul>
              </div>
            )}
          {askAi.data.sources && askAi.data.sources.length > 0 && (
            <div className="border-t border-border pt-2">
              <p className="mb-1 font-mono text-[12px] uppercase tracking-wide text-muted-foreground">
                Sources
              </p>
              <ul className="space-y-0.5">
                {askAi.data.sources.map((s) => (
                  <li key={s.url} className="truncate text-xs">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gda-cyan hover:underline"
                    >
                      {s.url}
                    </a>
                    {s.tool ? (
                      <span className="ml-1 text-muted-foreground">({s.tool})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {askAi.error && (
        <p className="text-xs text-gda-red">
          {(askAi.error as Error).message}
        </p>
      )}
    </div>
  );
}
