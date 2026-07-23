"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useUpdatePrinciple } from "@/hooks/use-scoring-doctrine";
import type { DoctrinePrinciple } from "@/hooks/use-doctrine";

function PrincipleCard({ principle, index }: { principle: DoctrinePrinciple; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingShort, setEditingShort] = useState(false);
  const [editingLong, setEditingLong] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [shortDraft, setShortDraft] = useState(principle.short_form);
  const [longDraft, setLongDraft] = useState(principle.long_form);
  const [promptDraft, setPromptDraft] = useState(principle.evaluation_prompt);

  const updatePrinciple = useUpdatePrinciple();

  function saveShort() {
    updatePrinciple.mutate(
      { id: principle.id, short_form: shortDraft },
      { onSuccess: () => setEditingShort(false) },
    );
  }

  function saveLong() {
    updatePrinciple.mutate(
      { id: principle.id, long_form: longDraft },
      { onSuccess: () => setEditingLong(false) },
    );
  }

  function savePrompt() {
    updatePrinciple.mutate(
      { id: principle.id, evaluation_prompt: promptDraft },
      { onSuccess: () => setEditingPrompt(false) },
    );
  }

  return (
    <div className="rounded border border-border bg-gda-bg-base">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gda-panel/50 transition-colors"
      >
        <span className="font-mono text-[12px] text-muted-foreground w-5 shrink-0 pt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{principle.name}</p>
          <p className="text-[12px] text-muted-foreground">{principle.short_form}</p>
        </div>
        <span className={cn("text-xs text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")}>
          ∨
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Short form */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">Short form</span>
              {!editingShort && (
                <button
                  type="button"
                  onClick={() => { setShortDraft(principle.short_form); setEditingShort(true); }}
                  className="text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Edit
                </button>
              )}
            </div>
            {editingShort ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={shortDraft}
                  onChange={(e) => setShortDraft(e.target.value)}
                  className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveShort}
                    disabled={updatePrinciple.isPending}
                    className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[12px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingShort(false)}
                    className="text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-foreground">{principle.short_form}</p>
            )}
          </div>

          {/* Long form */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">Long form</span>
              {!editingLong && (
                <button
                  type="button"
                  onClick={() => { setLongDraft(principle.long_form); setEditingLong(true); }}
                  className="text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Edit
                </button>
              )}
            </div>
            {editingLong ? (
              <div className="space-y-1.5">
                <textarea
                  rows={3}
                  value={longDraft}
                  onChange={(e) => setLongDraft(e.target.value)}
                  className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveLong}
                    disabled={updatePrinciple.isPending}
                    className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[12px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLong(false)}
                    className="text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{principle.long_form}</p>
            )}
          </div>

          {/* Advanced toggle for evaluation_prompt */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[12px] font-mono text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? "Hide Advanced" : "Advanced"}
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-1.5">
                <span className="text-[12px] font-mono text-muted-foreground uppercase tracking-wider">
                  Evaluation prompt (Devin/admin)
                </span>
                {editingPrompt ? (
                  <div className="space-y-1.5">
                    <textarea
                      rows={5}
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 font-mono text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={savePrompt}
                        disabled={updatePrinciple.isPending}
                        className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[12px] text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPrompt(false)}
                        className="text-[12px] text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-mono text-[12px] text-muted-foreground whitespace-pre-wrap break-words">
                      {principle.evaluation_prompt}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setPromptDraft(principle.evaluation_prompt); setEditingPrompt(true); }}
                      className="text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Edit prompt
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PrinciplesSection({ principles }: { principles: DoctrinePrinciple[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The 8 GDA doctrine principles. CEO can edit short and long form descriptions.
        The evaluation prompt (behind Advanced) controls how Sonnet scores each principle.
      </p>
      <div className="space-y-2">
        {principles
          .sort((a, b) => a.display_order - b.display_order)
          .map((p, i) => (
            <PrincipleCard key={p.id} principle={p} index={i} />
          ))}
      </div>
    </div>
  );
}
