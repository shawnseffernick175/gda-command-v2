"use client";

import { useState } from "react";
import { useTodayBriefing, useGenerateBriefing } from "@/hooks/use-briefing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Download } from "lucide-react";
import { getToken } from "@/lib/api";
import type { BriefingAction } from "@/lib/types";

function urgencyColor(u: BriefingAction["urgency"]) {
  switch (u) {
    case "immediate":
      return "bg-gda-red/20 text-gda-red border-gda-red/40";
    case "today":
      return "bg-gda-amber/20 text-gda-amber border-gda-amber/40";
    case "this_week":
      return "bg-muted text-muted-foreground border-border";
  }
}

function urgencyLabel(u: BriefingAction["urgency"]) {
  switch (u) {
    case "immediate":
      return "Immediate";
    case "today":
      return "Today";
    case "this_week":
      return "This Week";
  }
}

function ActionRow({ item }: { item: BriefingAction }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left flex flex-col gap-1 rounded p-2 hover:bg-gda-bg-base transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${urgencyColor(item.urgency)}`}
        >
          {urgencyLabel(item.urgency)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">{item.action}</p>
          {item.related_entity && !expanded && (
            <p className="text-xs text-muted-foreground">
              {item.related_entity}
            </p>
          )}
        </div>
      </div>
      {expanded && (
        <div className="ml-16 mt-1 text-xs text-muted-foreground space-y-1">
          {item.related_entity && <p>Related: {item.related_entity}</p>}
          <p className="text-foreground">{item.action}</p>
        </div>
      )}
    </button>
  );
}

export default function BriefingPage() {
  const { data: briefing, isLoading, error } = useTodayBriefing();
  const generate = useGenerateBriefing();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  const handleRegenerate = () => {
    generate.mutate();
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";
      const token = getToken();
      const res = await fetch(`${apiBase}/v3/briefing/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily-brief-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Daily Brief
        </h1>
        <p className="text-sm text-muted-foreground">{todayStr}</p>
        <Skeleton className="h-24 bg-gda-panel" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 bg-gda-panel" />
          <Skeleton className="h-40 bg-gda-panel" />
        </div>
        <Skeleton className="h-32 bg-gda-panel" />
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Daily Brief
        </h1>
        <p className="text-sm text-muted-foreground">{todayStr}</p>
        <Card className="border-border bg-gda-panel">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No briefing generated yet — click Regenerate to generate today{"'"}s
              brief.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleRegenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3 w-3" />
              )}
              Regenerate
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold text-foreground">
            Daily Brief
          </h1>
          <p className="text-sm text-muted-foreground">{todayStr}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={exporting}
          className="gap-1.5"
        >
          <Download className="h-3 w-3" />
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
      </div>

      {/* Headline */}
      <Card className="border-border bg-gda-panel">
        <CardContent className="pt-6">
          <p className="text-lg font-bold font-mono text-foreground">
            {briefing.headline}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generated{" "}
            {new Date(briefing.generated_at).toLocaleString("en-US", {
              timeZone: "America/New_York",
            })}
          </p>
        </CardContent>
      </Card>

      {/* Priority Actions */}
      {briefing.priority_actions.length > 0 && (
        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Priority Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {briefing.priority_actions.map((item, i) => (
                <ActionRow key={i} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Flags */}
      {briefing.risk_flags.length > 0 && (
        <Card className="border-gda-red/30 bg-gda-red/5">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-gda-red">
              Risk Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {briefing.risk_flags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Market Intel */}
      {briefing.market_intel_summary && (
        <Card className="border-border bg-gda-panel">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              Market Intel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {briefing.market_intel_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cert Warnings */}
      {briefing.cert_expiration_warnings.length > 0 && (
        <Card className="border-gda-amber/30 bg-gda-amber/5">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-gda-amber">
              Certification Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {briefing.cert_expiration_warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {exportError && (
          <span className="text-xs text-gda-red">{exportError}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Download className="mr-2 h-3 w-3 animate-pulse" />
          ) : (
            <Download className="mr-2 h-3 w-3" />
          )}
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={generate.isPending}
        >
          {generate.isPending ? (
            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Regenerate
        </Button>
      </div>
    </div>
  );
}
