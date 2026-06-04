"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPut, apiPost } from "@/lib/api";

function formatLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type PwinWeights = Record<string, number>;

export default function PwinSettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PwinWeights | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: weights, isLoading } = useQuery({
    queryKey: ["pwin-config"],
    queryFn: () => apiGet<PwinWeights>("/v3/pwin/config"),
  });

  const displayed = draft ?? weights ?? null;

  const saveMutation = useMutation({
    mutationFn: (body: PwinWeights) =>
      apiPut<PwinWeights>("/v3/pwin/config", body),
    onSuccess: () => {
      setMessage("Saved");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["pwin-config"] });
    },
    onError: () => setMessage("Failed to save"),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiPost<PwinWeights>("/v3/pwin/config/reset"),
    onSuccess: () => {
      setMessage("Reset to defaults");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["pwin-config"] });
    },
    onError: () => setMessage("Failed to reset"),
  });

  const handleSave = () => {
    if (!displayed) return;
    setMessage(null);
    saveMutation.mutate(displayed);
  };

  const handleReset = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Pwin Scoring Weights
      </h1>

      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Weight Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !displayed ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded bg-gda-bg-base"
                />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(displayed).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="flex-1 text-xs font-mono text-muted-foreground">
                      {formatLabel(key)}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={value}
                      onChange={(e) => {
                        const num = parseFloat(e.target.value);
                        if (!isNaN(num)) {
                          setDraft((prev) => ({
                            ...(prev ?? displayed),
                            [key]: num,
                          }));
                        }
                      }}
                      className="w-24 rounded border border-border bg-gda-bg-base px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="rounded bg-gda-cyan px-4 py-1.5 text-xs font-mono font-medium text-gda-bg-base hover:bg-gda-cyan/90 disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetMutation.isPending}
                  className="rounded border border-border px-4 py-1.5 text-xs font-mono text-muted-foreground hover:bg-gda-bg-base disabled:opacity-50"
                >
                  {resetMutation.isPending ? "Resetting..." : "Reset to Defaults"}
                </button>
                {message && (
                  <span className="text-xs text-muted-foreground">
                    {message}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
