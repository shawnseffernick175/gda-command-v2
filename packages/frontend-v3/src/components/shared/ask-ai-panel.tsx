"use client";

import { useState } from "react";
import { useAskAi } from "@/hooks/use-llm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AskAiPanel({
  objectType,
  objectId,
  context,
  className,
}: {
  objectType: string;
  objectId: string;
  context?: Record<string, unknown>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const askAi = useAskAi();

  function handleAsk() {
    if (!question.trim()) return;
    askAi.mutate({
      question: question.trim(),
      object_type: objectType,
      object_id: objectId,
      context,
    });
  }

  if (!open) {
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
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="Ask about this item..."
          className="flex-1 rounded border border-border bg-gda-bg-base px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-gda-cyan focus:outline-none"
        />
        <Button
          size="sm"
          onClick={handleAsk}
          disabled={askAi.isPending || !question.trim()}
          className="bg-gda-cyan text-gda-bg-deep hover:bg-gda-cyan/80"
        >
          {askAi.isPending ? "..." : "Ask"}
        </Button>
      </div>
      {askAi.data && (
        <div className="rounded border border-border bg-gda-bg-base p-3 text-sm text-foreground">
          {askAi.data.ok && askAi.data.output ? (
            <div>
              <p className="whitespace-pre-wrap">
                {String(
                  (askAi.data.output as Record<string, unknown>).answer ??
                    JSON.stringify(askAi.data.output, null, 2),
                )}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground italic">
                Model: {askAi.data.model_used} · {askAi.data.latency_ms}ms
              </p>
            </div>
          ) : (
            <p className="text-gda-amber italic">
              AI response pending — intelligence layer activating
            </p>
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
