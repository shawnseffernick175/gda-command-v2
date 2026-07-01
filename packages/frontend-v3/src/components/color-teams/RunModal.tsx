"use client";

import { useState } from "react";
import {
  useColorTeamDocuments,
  useStartColorTeamRun,
} from "@/hooks/use-color-teams";
import type { ColorTeamColor } from "@/lib/types";

const ALL_COLORS: { value: ColorTeamColor; label: string }[] = [
  { value: "pink", label: "Pink - Storyboard Review" },
  { value: "red", label: "Red - Proposal Evaluation" },
  { value: "black", label: "Black Hat - Competitor Simulation" },
  { value: "blue", label: "Blue - Customer Perspective" },
  { value: "white", label: "White - Compliance Sweep" },
  { value: "green", label: "Green - Executive / Final Pass" },
];

const COLOR_DOT_CLASSES: Record<string, string> = {
  pink: "bg-pink-400",
  red: "bg-gda-red",
  black: "bg-zinc-400",
  blue: "bg-blue-400",
  white: "bg-gray-300",
  green: "bg-gda-green",
};

interface RunModalProps {
  documentId?: number | string;
  onClose: () => void;
  onCreated: (runId: number) => void;
}

export function RunModal({ documentId, onClose, onCreated }: RunModalProps) {
  const [selectedColors, setSelectedColors] = useState<Set<ColorTeamColor>>(new Set());
  const [runAll, setRunAll] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>(documentId ? String(documentId) : "");
  const { data: docsData } = useColorTeamDocuments({ limit: 100 });
  const startRun = useStartColorTeamRun();

  function toggleColor(color: ColorTeamColor) {
    const next = new Set(selectedColors);
    if (next.has(color)) {
      next.delete(color);
    } else {
      next.add(color);
    }
    setSelectedColors(next);
    setRunAll(next.size === ALL_COLORS.length);
  }

  function toggleAll() {
    if (runAll) {
      setSelectedColors(new Set());
      setRunAll(false);
    } else {
      setSelectedColors(new Set(ALL_COLORS.map((c) => c.value)));
      setRunAll(true);
    }
  }

  async function handleSubmit() {
    const docId = selectedDocId;
    if (!docId || selectedColors.size === 0) return;
    const result = await startRun.mutateAsync({
      document_id: docId,
      colors: Array.from(selectedColors),
    });
    onCreated(result.run_id);
  }

  const colorsArr = Array.from(selectedColors);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded border border-border bg-gda-bg-raised p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Run Color Team</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {"\u00D7"}
          </button>
        </div>

        {!documentId && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted-foreground uppercase tracking-wider">
              Document
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full rounded border border-border bg-gda-panel px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">Select a document...</option>
              {docsData?.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} ({d.doc_type})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              Colors
            </label>
            <button
              onClick={toggleAll}
              className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-gda-panel hover:text-foreground"
            >
              {runAll ? "Deselect All" : "Run All"}
            </button>
          </div>
          <div className="space-y-1">
            {ALL_COLORS.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gda-panel"
              >
                <input
                  type="checkbox"
                  checked={selectedColors.has(c.value)}
                  onChange={() => toggleColor(c.value)}
                  className="accent-gda-green"
                />
                <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT_CLASSES[c.value]}`} />
                <span className="text-foreground">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-gda-panel hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedDocId || colorsArr.length === 0 || startRun.isPending}
            className="rounded bg-gda-green px-4 py-1.5 text-sm font-medium text-gda-bg-deep hover:bg-gda-green/90 disabled:opacity-40"
          >
            {startRun.isPending ? "Starting..." : `Run ${colorsArr.length} Color${colorsArr.length !== 1 ? "s" : ""}`}
          </button>
        </div>

        {startRun.isError && (
          <p className="mt-2 text-xs text-gda-red">
            {startRun.error instanceof Error ? startRun.error.message : "Failed to start run"}
          </p>
        )}
      </div>
    </div>
  );
}
