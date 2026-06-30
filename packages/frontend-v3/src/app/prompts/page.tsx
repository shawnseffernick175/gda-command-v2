"use client";

import { useState, useCallback, useRef } from "react";
import {
  usePrompts,
  useUpdatePrompt,
  useTestPrompt,
  usePromptVersions,
  useRestoreVersion,
  usePromptBuild,
  useCreatePrompt,
  type Prompt,
  type PromptVariable,
  type BuildResult,
} from "@/hooks/use-prompts";
import {
  useDoctrinePrinciples,
  useUpdateDoctrinePrinciple,
  type DoctrinePrinciple,
} from "@/hooks/use-doctrine";
import { COLOR_TEAM_CONFIGS, colorBadgeClasses } from "@/lib/color-team-configs";
import {
  promptStatus,
  promptStatusLabel,
  promptStatusTooltip,
  promptStatusClasses,
} from "@/lib/prompt-status";
import { FRAMEWORKS, getFramework } from "@/lib/prompt-frameworks";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/* ── Surface tabs ─────────────────────────────────────────────── */

const SURFACE_TABS = [
  { label: "All", value: "" },
  { label: "Opportunities", value: "opportunities" },
  { label: "Risks", value: "risks" },
  { label: "Capture", value: "capture" },
  { label: "FasTrac", value: "fast_track" },
  { label: "Briefing", value: "briefing" },
  { label: "Competitors", value: "competitors" },
];

const SPECIAL_TABS = [
  { label: "Doctrine", value: "__doctrine" },
  { label: "Color Teams", value: "__color_teams" },
  { label: "Build", value: "__build" },
  { label: "Frameworks", value: "__frameworks" },
];

const SURFACE_OPTIONS = [
  { label: "Briefing", value: "briefing" },
  { label: "Capture", value: "capture" },
  { label: "Opportunities", value: "opportunities" },
  { label: "Risks", value: "risks" },
  { label: "Competitors", value: "competitors" },
  { label: "FasTrac", value: "fast_track" },
  { label: "Doctrine", value: "doctrine" },
  { label: "Color Teams", value: "color_teams" },
  { label: "Build", value: "build" },
  { label: "General", value: "general" },
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

/* ── Version History Drawer ───────────────────────────────────── */

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

/* ── Prompt Editor Panel ──────────────────────────────────────── */

function EditorPanel({
  prompt,
}: {
  prompt: Prompt;
}) {
  const [systemPrompt, setSystemPrompt] = useState(prompt.system_prompt);
  const [userTemplate, setUserTemplate] = useState(prompt.user_prompt_template ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const updatePrompt = useUpdatePrompt();
  const testPrompt = useTestPrompt();
  const { toast } = useToast();

  const variables: PromptVariable[] = prompt.variables ?? [];
  const isDirty = systemPrompt !== prompt.system_prompt || userTemplate !== (prompt.user_prompt_template ?? "");

  const handleSave = useCallback(() => {
    updatePrompt.mutate(
      {
        key: prompt.prompt_key,
        system_prompt: systemPrompt,
        user_prompt_template: userTemplate || undefined,
        change_note: changeNote || undefined,
      },
      {
        onSuccess: () => {
          toast("Prompt saved successfully", "success");
          setChangeNote("");
        },
        onError: (err) => {
          toast(
            err instanceof Error ? err.message : "Save failed — check console",
            "error",
          );
        },
      },
    );
  }, [updatePrompt, prompt.prompt_key, systemPrompt, userTemplate, changeNote, toast]);

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
            {(() => {
              const status = promptStatus(prompt.prompt_key);
              return (
                <span
                  title={promptStatusTooltip(status)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px] font-mono",
                    promptStatusClasses(status),
                  )}
                >
                  {promptStatusLabel(status)}
                </span>
              );
            })()}
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="rounded border border-border px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors"
          >
            {showAdvanced ? "Hide Advanced" : "Advanced"}
          </button>
        </div>
        {prompt.description && (
          <p className="text-xs text-muted-foreground">{prompt.description}</p>
        )}

        {promptStatus(prompt.prompt_key) === "live" ? (
          <div className="rounded border border-gda-green/30 bg-gda-green/5 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-mono text-gda-green">How to use this:</span>{" "}
            Type your instructions in plain English in the{" "}
            <span className="text-foreground">System Prompt</span> box below —
            no code or JSON needed — then hit{" "}
            <span className="text-foreground">Save</span>. The AI uses your new
            wording the next time this task runs. The required output format is
            handled automatically, so you can rewrite the instructions freely.
          </div>
        ) : (
          <div className="rounded border border-border bg-gda-panel px-3 py-2 text-[11px] text-muted-foreground">
            This prompt is stored but not currently read by any AI task, so
            editing it will not change AI behavior yet. The live prompts are the
            ones marked{" "}
            <span className="font-mono text-gda-green">Live</span>.
          </div>
        )}

        {/* System Prompt — always visible */}
        <div className="space-y-1.5">
          <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            System Prompt {"\u2014"} plain English, no JSON needed
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-2 rounded resize-y min-h-[200px] text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            rows={10}
          />
        </div>

        {/* Save — always visible */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || updatePrompt.isPending}
            className="rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {updatePrompt.isPending ? "Saving..." : "Save"}
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={handleDiscard}
              className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors"
            >
              Discard
            </button>
          )}
        </div>

        {/* ── Advanced section (collapsed by default) ──────────── */}
        {showAdvanced && (
          <div className="space-y-4 border-t border-border pt-4">
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

            {/* Version History */}
            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowVersions(true)}
                className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors"
              >
                View Version History
              </button>
            </div>
          </div>
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

/* ── Doctrine Principle Card ──────────────────────────────────── */

function DoctrinePrincipleCard({ principle }: { principle: DoctrinePrinciple }) {
  const [draft, setDraft] = useState(principle.evaluation_prompt);
  const [flashGreen, setFlashGreen] = useState(false);
  const updatePrinciple = useUpdateDoctrinePrinciple();

  const isDirty = draft !== principle.evaluation_prompt;

  const handleSave = useCallback(() => {
    updatePrinciple.mutate(
      { id: principle.id, evaluation_prompt: draft },
      {
        onSuccess: () => {
          setFlashGreen(true);
          setTimeout(() => setFlashGreen(false), 1500);
        },
      },
    );
  }, [updatePrinciple, principle.id, draft]);

  const handleDiscard = useCallback(() => {
    setDraft(principle.evaluation_prompt);
  }, [principle.evaluation_prompt]);

  return (
    <div
      className={cn(
        "rounded border p-4 transition-colors duration-300",
        flashGreen ? "border-gda-green bg-gda-green/5" : "border-border bg-gda-panel",
      )}
    >
      <div className="flex items-center gap-3 mb-1">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {principle.display_order}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">
          {principle.name}
        </span>
        <span className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-1.5 py-0.5 text-[11px] font-mono text-gda-cyan">
          {principle.short_form}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{principle.long_form}</p>

      <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Evaluation Prompt
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="mt-1 w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-2 rounded resize-y min-h-[100px] text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        rows={4}
      />

      {isDirty && (
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={updatePrinciple.isPending}
            className="rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {updatePrinciple.isPending ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel transition-colors"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Doctrine Editor Panel ────────────────────────────────────── */

function DoctrineEditorPanel() {
  const { data, isLoading } = useDoctrinePrinciples();
  const principles: DoctrinePrinciple[] = data ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="font-mono text-base font-bold text-foreground">Doctrine Principles</h2>
        <p className="text-xs text-muted-foreground mt-1">
          These evaluation prompts drive the AI{"'"}s bid/no-bid scoring. Each principle is scored 0–10 on every opportunity.
        </p>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading principles...</p>}

      {principles.map((p) => (
        <DoctrinePrincipleCard key={`${p.id}-${p.evaluation_prompt}`} principle={p} />
      ))}
    </div>
  );
}

/* ── Color Teams Panel ────────────────────────────────────────── */

function ColorTeamsPanel() {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="font-mono text-base font-bold text-foreground">Color Team Review Configs</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Reference view of each color team{"'"}s role, tool access, and output schema.
        </p>
      </div>

      {COLOR_TEAM_CONFIGS.map((ct) => (
        <div key={ct.color} className="rounded border border-border bg-gda-panel p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "rounded border px-2 py-0.5 text-xs font-mono font-medium capitalize",
                colorBadgeClasses(ct.color),
              )}
            >
              {ct.color}
            </span>
            <span className="font-mono text-sm font-semibold text-foreground">{ct.role}</span>
          </div>

          <div>
            <span className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Description
            </span>
            <p className="text-xs text-foreground mt-0.5">{ct.description}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide mr-1">
              Tools
            </span>
            {ct.tools.map((tool) => (
              <span
                key={tool}
                className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-[11px] font-mono text-foreground"
              >
                {tool}
              </span>
            ))}
          </div>

          <div>
            <span className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Output
            </span>
            <pre className="mt-0.5 font-mono text-xs text-foreground bg-gda-bg-base border border-border rounded px-2.5 py-1.5 whitespace-pre-wrap">
              {ct.outputSchema}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Build Panel ──────────────────────────────────────────────── */

function BuildPanel({ onNavigateToPrompt }: { onNavigateToPrompt: (key: string) => void }) {
  const [topic, setTopic] = useState("");
  const [points, setPoints] = useState<string[]>([""]);
  const [surface, setSurface] = useState("opportunities");
  const [result, setResult] = useState<BuildResult | null>(null);
  const [outputFlash, setOutputFlash] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pointRefs = useRef<(HTMLInputElement | null)[]>([]);

  const buildPrompt = usePromptBuild();
  const createPrompt = useCreatePrompt();
  const { toast } = useToast();

  const canCreate = topic.trim().length > 0 && points.some((p) => p.trim().length > 0);

  const addPoint = useCallback(() => {
    if (points.length >= 12) return;
    setPoints((prev) => [...prev, ""]);
    setTimeout(() => {
      pointRefs.current[points.length]?.focus();
    }, 0);
  }, [points.length]);

  const removePoint = useCallback((index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updatePoint = useCallback((index: number, value: string) => {
    setPoints((prev) => prev.map((p, i) => (i === index ? value : p)));
  }, []);

  const handlePointKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (points.length < 12) {
          setPoints((prev) => {
            const next = [...prev];
            next.splice(index + 1, 0, "");
            return next;
          });
          setTimeout(() => {
            pointRefs.current[index + 1]?.focus();
          }, 0);
        }
      }
    },
    [points.length],
  );

  const handleCreate = useCallback(() => {
    const filteredPoints = points.filter((p) => p.trim().length > 0);
    buildPrompt.mutate(
      { topic: topic.trim(), points: filteredPoints, surface },
      {
        onSuccess: (data) => {
          setResult(data);
          setSavedKey(null);
          setCopied(false);
          setOutputFlash(true);
          setTimeout(() => setOutputFlash(false), 1500);
        },
      },
    );
  }, [buildPrompt, topic, points, surface]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    void navigator.clipboard.writeText(result.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const handleSaveToLibrary = useCallback(() => {
    if (!result) return;
    const slug = topic
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    createPrompt.mutate(
      {
        prompt_key: slug,
        display_name: result.display_name || topic.trim(),
        surface,
        system_prompt: result.prompt,
      },
      {
        onSuccess: (saved) => {
          toast("Prompt saved to library", "success");
          setSavedKey(saved.prompt_key);
          setTopic("");
          setPoints([""]);
          setResult(null);
          setSurface("opportunities");
          setCopied(false);
        },
        onError: (err) => {
          toast(
            err instanceof Error ? err.message : "Failed to save prompt",
            "error",
          );
        },
      },
    );
  }, [createPrompt, result, topic, surface, toast]);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-mono text-base font-bold text-foreground">Build a Prompt</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Give it a topic and some bullet points. Hit Create.
        </p>
      </div>

      {/* Topic */}
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="e.g. Analyze a competitor"
        className="w-full font-mono text-lg bg-transparent border-b border-border px-1 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-gda-green/50"
      />

      {/* Points */}
      <div className="space-y-1">
        {points.map((point, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-muted-foreground/30 text-xs select-none">–</span>
            <input
              ref={(el) => {
                pointRefs.current[i] = el;
              }}
              type="text"
              value={point}
              onChange={(e) => updatePoint(i, e.target.value)}
              onKeyDown={(e) => handlePointKeyDown(e, i)}
              placeholder={i === 0 ? "First point..." : ""}
              className="flex-1 font-mono text-xs bg-transparent border-b border-border/50 px-1 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-gda-green/50"
            />
            {points.length > 1 && (
              <button
                type="button"
                onClick={() => removePoint(i)}
                className="text-muted-foreground/40 hover:text-gda-red text-xs px-1 transition-colors"
              >
                x
              </button>
            )}
          </div>
        ))}
        {points.length < 12 && (
          <button
            type="button"
            onClick={addPoint}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground mt-1 transition-colors"
          >
            + Add Point
          </button>
        )}
      </div>

      {/* Surface */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-muted-foreground">Surface</span>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
          className="font-mono text-xs bg-gda-bg-base border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          {SURFACE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Create button */}
      <button
        type="button"
        onClick={handleCreate}
        disabled={!canCreate || buildPrompt.isPending}
        className="w-full rounded border border-gda-green bg-gda-green/10 px-4 py-2.5 text-sm font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
      >
        {buildPrompt.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3 h-3 border border-gda-green/50 border-t-gda-green rounded-full animate-spin" />
            Building...
          </span>
        ) : (
          "Create Prompt"
        )}
      </button>

      {buildPrompt.isError && (
        <p className="text-xs text-gda-red">
          {buildPrompt.error instanceof Error ? buildPrompt.error.message : "Build failed"}
        </p>
      )}

      {/* Generated Output */}
      {result && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Your Prompt
            </label>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre
            className={cn(
              "whitespace-pre-wrap font-mono text-xs rounded border p-4 text-foreground bg-gda-bg-base transition-colors duration-300 max-h-[500px] overflow-y-auto",
              outputFlash ? "border-gda-green" : "border-border",
            )}
          >
            {result.prompt}
          </pre>

          <button
            type="button"
            onClick={handleSaveToLibrary}
            disabled={createPrompt.isPending}
            className="rounded border border-border px-3 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel disabled:opacity-50 transition-colors"
          >
            {createPrompt.isPending ? "Saving..." : "Save to Library"}
          </button>
        </div>
      )}

      {/* Saved confirmation */}
      {savedKey && (
        <div className="rounded border border-gda-green/30 bg-gda-green/5 p-3 text-xs font-mono text-gda-green">
          Saved to Library.{" "}
          <button
            type="button"
            onClick={() => onNavigateToPrompt(savedKey)}
            className="underline hover:text-gda-green/80"
          >
            View {'"'}{savedKey}{'"'} in All tab
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */

function FrameworkBuilder({ onNavigateToPrompt }: { onNavigateToPrompt: (key: string) => void }) {
  const [frameworkId, setFrameworkId] = useState(FRAMEWORKS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [surface, setSurface] = useState("general");
  const [copied, setCopied] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const createPrompt = useCreatePrompt();
  const { toast } = useToast();

  const framework = getFramework(frameworkId) ?? FRAMEWORKS[0];
  const assembled = framework.assemble(values);
  const hasContent = assembled.trim().length > 0;

  const handlePickFramework = useCallback((id: string) => {
    setFrameworkId(id);
    setValues({});
    setSavedKey(null);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(() => {
    if (!hasContent) return;
    void navigator.clipboard.writeText(assembled).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [assembled, hasContent]);

  const handleSave = useCallback(() => {
    if (!hasContent) return;
    const displayName = name.trim() || `${framework.acronym} prompt`;
    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    createPrompt.mutate(
      {
        prompt_key: slug,
        display_name: displayName,
        surface,
        system_prompt: assembled,
      },
      {
        onSuccess: (saved) => {
          toast("Prompt saved to library", "success");
          setSavedKey(saved.prompt_key);
        },
        onError: (err) => {
          toast(
            err instanceof Error ? err.message : "Failed to save prompt",
            "error",
          );
        },
      },
    );
  }, [createPrompt, hasContent, name, framework.acronym, surface, assembled, toast]);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-mono text-base font-bold text-foreground">Framework Builder</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Pick a proven prompt structure, answer a few questions, and it
          assembles a clean prompt you can copy or save to your library.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Framework
        </label>
        <select
          value={frameworkId}
          onChange={(e) => handlePickFramework(e.target.value)}
          className="w-full font-mono text-xs bg-gda-bg-base border border-border rounded px-2.5 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.acronym} {"\u2014"} {f.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground italic">{framework.tagline}</p>
      </div>

      <div className="space-y-4">
        {framework.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="flex items-center gap-2 font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <span className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-1.5 py-0.5 text-gda-cyan">
                {field.letter}
              </span>
              {field.label}
            </label>
            {field.multiline ? (
              <textarea
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                rows={3}
                className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-2 rounded resize-y text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              />
            ) : (
              <input
                type="text"
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-1.5 rounded text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Your Prompt
          </label>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasContent}
            className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="whitespace-pre-wrap font-mono text-xs rounded border border-border p-4 text-foreground bg-gda-bg-base min-h-[80px] max-h-[400px] overflow-y-auto">
          {hasContent ? (
            assembled
          ) : (
            <span className="text-muted-foreground/50">
              Fill in the fields above to assemble your prompt{"\u2026"}
            </span>
          )}
        </pre>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Capture summary prompt"
              className="w-full font-mono text-xs bg-gda-bg-base border border-border px-2.5 py-1.5 rounded text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Surface
            </label>
            <select
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              className="w-full font-mono text-xs bg-gda-bg-base border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            >
              {SURFACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasContent || createPrompt.isPending}
          className="rounded border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel disabled:opacity-50 transition-colors"
        >
          {createPrompt.isPending ? "Saving\u2026" : "Save to Library"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Saved prompts appear in the All tab. Note: prompts saved here are
          stored for reuse but are not wired to a live AI task.
        </p>
      </div>

      {savedKey && (
        <div className="rounded border border-gda-green/30 bg-gda-green/5 p-3 text-xs font-mono text-gda-green">
          Saved to Library.{" "}
          <button
            type="button"
            onClick={() => onNavigateToPrompt(savedKey)}
            className="underline hover:text-gda-green/80"
          >
            View {'"'}{savedKey}{'"'} in All tab
          </button>
        </div>
      )}
    </div>
  );
}

export default function PromptsPage() {
  const [activeTab, setActiveTab] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const isSpecialTab = activeTab.startsWith("__");
  const surfaceFilter = isSpecialTab ? "" : activeTab;

  const { data, isLoading } = usePrompts(
    surfaceFilter ? { surface: surfaceFilter } : {},
  );

  const prompts: Prompt[] = data?.items ?? [];
  const selectedPrompt = prompts.find((p) => p.prompt_key === selectedKey) ?? null;

  const handleNavigateToPrompt = useCallback((key: string) => {
    setActiveTab("");
    setSelectedKey(key);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pt-6 sticky-page-header">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 font-mono text-base font-bold text-foreground">Prompts</h1>
            {!isSpecialTab && (
              <span className="shrink-0 rounded border border-gda-green/30 bg-gda-green/10 px-2 py-0.5 text-[11px] font-mono text-gda-green">
                {prompts.length} prompts
              </span>
            )}
            <p className="truncate text-xs text-muted-foreground">
              Reusable AI prompts that power analysis across GDA Command — browse, edit, and tune system reasoning.
            </p>
          </div>
        </div>

        {/* Tab row */}
        <div className="flex items-center gap-1 border-b border-border px-4 py-2 overflow-x-auto">
        {SURFACE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setActiveTab(tab.value); setSelectedKey(null); }}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-mono transition-colors whitespace-nowrap",
              activeTab === tab.value
                ? "bg-gda-green/10 text-gda-green border border-gda-green/30"
                : "text-muted-foreground hover:text-foreground hover:bg-gda-panel border border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {SPECIAL_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setActiveTab(tab.value); setSelectedKey(null); }}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-mono transition-colors whitespace-nowrap",
              activeTab === tab.value
                ? "bg-gda-green/10 text-gda-green border border-gda-green/30"
                : "text-muted-foreground hover:text-foreground hover:bg-gda-panel border border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
        </div>
      </div>

      {/* Main content */}
      {activeTab === "__doctrine" ? (
        <DoctrineEditorPanel />
      ) : activeTab === "__color_teams" ? (
        <ColorTeamsPanel />
      ) : activeTab === "__build" ? (
        <BuildPanel onNavigateToPrompt={handleNavigateToPrompt} />
      ) : activeTab === "__frameworks" ? (
        <FrameworkBuilder onNavigateToPrompt={handleNavigateToPrompt} />
      ) : (
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
                  {(() => {
                    const status = promptStatus(p.prompt_key);
                    return (
                      <span
                        title={promptStatusTooltip(status)}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px] font-mono",
                          promptStatusClasses(status),
                        )}
                      >
                        {promptStatusLabel(status)}
                      </span>
                    );
                  })()}
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
      )}
    </div>
  );
}
