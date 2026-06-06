"use client";

import { useState, useCallback } from "react";
import {
  usePrompts,
  useUpdatePrompt,
  useTestPrompt,
  usePromptVersions,
  useRestoreVersion,
  type Prompt,
  type PromptVariable,
} from "@/hooks/use-prompts";
import { cn } from "@/lib/utils";

const SURFACE_TABS = [
  { label: "All", value: "" },
  { label: "Opportunities", value: "opportunities" },
  { label: "Risks", value: "risks" },
  { label: "Capture", value: "capture" },
  { label: "Fast Track", value: "fast_track" },
  { label: "Briefing", value: "briefing" },
  { label: "Competitors", value: "competitors" },
];

function surfaceBadgeColor(surface: string): string {
  switch (surface) {
    case "opportunities": return "border-gda-green/30 bg-gda-green/10 text-gda-green";
    case "risks": return "border-gda-red/30 bg-gda-red/10 text-gda-red";
    case "capture": return "border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan";
    case "fast_track": return "border-gda-amber/30 bg-gda-amber/10 text-gda-amber";
    case "briefing": return "border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan";
    case "competitors": return "border-gda-amber/30 bg-gda-amber/10 text-gda-amber";
    default: return "border-border bg-gda-panel text-muted-foreground";
  }
}

function VersionHistoryDrawer({
  promptKey,
  displayName,
  onClose,
}: {
  promptKey: string;
  displayName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = usePromptVersions(promptKey);
  const restoreVersion = useRestoreVersion();
  const versions = data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gda-bg-base border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-gda-bg-base px-4 py-3">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">Version History</h2>
            <p className="text-[11px] text-muted-foreground">{displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {!isLoading && versions.length === 0 && (
            <p className="text-xs text-muted-foreground">No previous versions.</p>
          )}
          {versions.map((v) => (
            <div key={v.id} className="rounded border border-border bg-gda-panel p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-medium text-foreground">v{v.version}</span>
                  <span className="text-[11px] text-muted-foreground">by {v.changed_by}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString()}
                </span>
              </div>
              {v.change_note && (
                <p className="text-[11px] text-muted-foreground italic">{v.change_note}</p>
              )}
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show system prompt
                </summary>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-gda-bg-base rounded border border-border p-2 text-foreground max-h-40 overflow-y-auto">
                  {v.system_prompt}
                </pre>
              </details>
              {v.user_prompt_template && (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show user prompt template
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-gda-bg-base rounded border border-border p-2 text-foreground max-h-40 overflow-y-auto">
                    {v.user_prompt_template}
                  </pre>
                </details>
              )}
              <button
                type="button"
                disabled={restoreVersion.isPending}
                onClick={() => restoreVersion.mutate({ key: promptKey, version: v.version })}
                className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-3 py-1 text-[11px] font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
              >
                {restoreVersion.isPending ? "Restoring..." : "Restore this version"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditorPanel({
  prompt,
}: {
  prompt: Prompt;
}) {
  const [systemPrompt, setSystemPrompt] = useState(prompt.system_prompt);
  const [userTemplate, setUserTemplate] = useState(prompt.user_prompt_template ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const updatePrompt = useUpdatePrompt();
  const testPrompt = useTestPrompt();

  const variables: PromptVariable[] = prompt.variables ?? [];
  const isDirty = systemPrompt !== prompt.system_prompt || userTemplate !== (prompt.user_prompt_template ?? "");


  const handleSave = useCallback(() => {
    updatePrompt.mutate({
      key: prompt.prompt_key,
      system_prompt: systemPrompt,
      user_prompt_template: userTemplate || undefined,
      change_note: changeNote || undefined,
    });
  }, [updatePrompt, prompt.prompt_key, systemPrompt, userTemplate, changeNote]);

  const handleDiscard = useCallback(() => {
    setSystemPrompt(prompt.system_prompt);
    setUserTemplate(prompt.user_prompt_template ?? "");
    setChangeNote("");
  }, [prompt.system_prompt, prompt.user_prompt_template]);

  const handleTest = useCallback(() => {
    testPrompt.mutate({
      key: prompt.prompt_key,
      variable_values: variableValues,
    });
  }, [testPrompt, prompt.prompt_key, variableValues]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-foreground">{prompt.display_name}</h2>
            <span className="font-mono text-[11px] text-muted-foreground">v{prompt.version}</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono", surfaceBadgeColor(prompt.surface))}>
              {prompt.surface}
            </span>
          </div>
        </div>
        {prompt.description && (
          <p className="text-xs text-muted-foreground">{prompt.description}</p>
        )}

        {/* System Prompt */}
        <div className="space-y-1.5">
          <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            System Prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-2 rounded resize-y min-h-[150px] text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            rows={6}
          />
        </div>

        {/* User Prompt Template */}
        <div className="space-y-1.5">
          <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            User Prompt Template
          </label>
          <textarea
            value={userTemplate}
            onChange={(e) => setUserTemplate(e.target.value)}
            className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-2 rounded resize-y min-h-[100px] text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            rows={4}
          />
          {variables.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {variables.map((v) => (
                <span
                  key={v.name}
                  title={v.description ?? v.name}
                  className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-1.5 py-0.5 text-[11px] font-mono text-gda-cyan"
                >
                  {`{${v.name}}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Change Note */}
        {isDirty && (
          <div className="space-y-1.5">
            <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Change Note (optional)
            </label>
            <input
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="What changed?"
              className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-1.5 rounded text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
        )}

        {/* Test Preview */}
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Test Preview
          </h3>
          {variables.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {variables.map((v) => (
                <div key={v.name} className="space-y-0.5">
                  <label className="text-[11px] font-mono text-muted-foreground">{v.name}</label>
                  <input
                    type="text"
                    value={variableValues[v.name] ?? ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                    }
                    placeholder={v.example ?? v.description ?? v.name}
                    className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2 py-1 rounded text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                  />
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleTest}
            disabled={testPrompt.isPending}
            className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
          >
            {testPrompt.isPending ? "Running..." : "Run Preview"}
          </button>

          {testPrompt.isError && (
            <p className="text-xs text-gda-red">
              {testPrompt.error instanceof Error ? testPrompt.error.message : "Test failed"}
            </p>
          )}

          {testPrompt.isSuccess && testPrompt.data && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>Model: {testPrompt.data.model_used}</span>
                <span>Tokens: {testPrompt.data.tokens_used}</span>
                <span>Time: {testPrompt.data.duration_ms}ms</span>
              </div>
              <pre className="whitespace-pre-wrap text-xs font-mono bg-gda-bg-base rounded border border-border p-3 text-foreground max-h-80 overflow-y-auto">
                {testPrompt.data.raw_output}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || updatePrompt.isPending}
            className="rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {updatePrompt.isPending ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty}
            className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel disabled:opacity-50 transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => setShowVersions(true)}
            className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors"
          >
            View Version History
          </button>
        </div>

        {updatePrompt.isSuccess && (
          <p className="text-xs text-gda-green">Saved successfully.</p>
        )}
        {updatePrompt.isError && (
          <p className="text-xs text-gda-red">
            {updatePrompt.error instanceof Error ? updatePrompt.error.message : "Save failed"}
          </p>
        )}
      </div>

      {showVersions && (
        <VersionHistoryDrawer
          promptKey={prompt.prompt_key}
          displayName={prompt.display_name}
          onClose={() => setShowVersions(false)}
        />
      )}
    </>
  );
}

export default function PromptCreatorPage() {
  const [surfaceFilter, setSurfaceFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data, isLoading } = usePrompts(
    surfaceFilter ? { surface: surfaceFilter } : {},
  );

  const prompts: Prompt[] = data?.items ?? [];
  const selectedPrompt = prompts.find((p) => p.prompt_key === selectedKey) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="font-mono text-base font-bold text-foreground">Prompt Creator</h1>
        <span className="rounded border border-gda-green/30 bg-gda-green/10 px-2 py-0.5 text-[11px] font-mono text-gda-green">
          {prompts.length} prompts
        </span>
      </div>

      {/* Surface filter tabs */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 overflow-x-auto">
        {SURFACE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSurfaceFilter(tab.value)}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-mono transition-colors whitespace-nowrap",
              surfaceFilter === tab.value
                ? "bg-gda-green/10 text-gda-green border border-gda-green/30"
                : "text-muted-foreground hover:text-foreground hover:bg-gda-panel border border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Prompt list (left 35%) */}
        <div className="w-[35%] shrink-0 border-r border-border overflow-y-auto">
          {isLoading && (
            <p className="px-4 py-8 text-xs text-muted-foreground">Loading prompts...</p>
          )}
          {!isLoading && prompts.length === 0 && (
            <p className="px-4 py-8 text-xs text-muted-foreground">No prompts found.</p>
          )}
          {prompts.map((p) => (
            <button
              key={p.prompt_key}
              type="button"
              onClick={() => setSelectedKey(p.prompt_key)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-border transition-colors",
                selectedKey === p.prompt_key
                  ? "border-l-2 border-l-gda-green bg-gda-panel"
                  : "hover:bg-gda-panel/50",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-foreground truncate">
                  {p.display_name}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground shrink-0 ml-2">
                  v{p.version}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono", surfaceBadgeColor(p.surface))}>
                  {p.surface}
                </span>
                {!p.is_active && (
                  <span className="rounded border border-gda-red/30 bg-gda-red/10 px-1.5 py-0.5 text-[11px] font-mono text-gda-red">
                    inactive
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Editor panel (right 65%) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPrompt ? (
            <EditorPanel
              key={selectedPrompt.prompt_key + "-" + selectedPrompt.version}
              prompt={selectedPrompt}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-xs text-muted-foreground">
                Select a prompt from the list to edit
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
