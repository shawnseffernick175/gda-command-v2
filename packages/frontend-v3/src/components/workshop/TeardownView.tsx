"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocumentUpload, TeardownAnalysis } from "@/lib/types";
import { GenerateDrawer } from "./GenerateDrawer";

type TeardownTab =
  | "structure"
  | "claims"
  | "numbers"
  | "tables"
  | "risks"
  | "relevance";

const TABS: { key: TeardownTab; label: string }[] = [
  { key: "structure", label: "Structure" },
  { key: "claims", label: "Key Claims" },
  { key: "numbers", label: "Numbers" },
  { key: "tables", label: "Tables" },
  { key: "risks", label: "Risks/Gaps" },
  { key: "relevance", label: "Relevance to Envision" },
];

function wheelHouseClass(match: string): string {
  switch (match) {
    case "high":
      return "border-gda-green/40 text-gda-green bg-gda-green/10";
    case "medium":
      return "border-gda-amber/40 text-gda-amber bg-gda-amber/10";
    case "low":
      return "border-gda-red/40 text-gda-red bg-gda-red/10";
    default:
      return "border-border text-muted-foreground";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TeardownView({
  upload,
  onReanalyze,
  isReanalyzing,
}: {
  upload: DocumentUpload;
  onReanalyze: () => void;
  isReanalyzing: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TeardownTab>("structure");
  const [showGenerate, setShowGenerate] = useState(false);

  const analysis = upload.teardown_analysis;

  if (upload.status === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gda-green border-t-transparent" />
        <p className="text-sm font-medium text-foreground">
          Analyzing {upload.filename}...
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This may take up to 60 seconds for large documents.
        </p>
      </div>
    );
  }

  if (upload.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm font-medium text-foreground">
          Teardown failed for {upload.filename}
        </p>
        <button
          type="button"
          className="mt-4 rounded bg-gda-green px-4 py-1.5 text-[13px] font-medium text-gda-bg-deep transition-colors hover:bg-gda-green-muted"
          onClick={onReanalyze}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Select a classified document or upload a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-card p-4">
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">
            {analysis.title || upload.filename}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{analysis.doc_type}</span>
            <span className="text-border">|</span>
            <span>{analysis.page_count} pages</span>
            {upload.teardown_run_at && (
              <>
                <span className="text-border">|</span>
                <span>Analyzed {formatDate(upload.teardown_run_at)}</span>
              </>
            )}
          </div>
        </div>
        <Badge
          className={cn(
            "text-[11px] font-semibold",
            wheelHouseClass(analysis.envision_relevance?.wheelhouse_match ?? "none"),
          )}
        >
          Wheelhouse:{" "}
          {(analysis.envision_relevance?.wheelhouse_match ?? "none").toUpperCase()}
        </Badge>
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-gda-bg-base disabled:opacity-50"
          onClick={onReanalyze}
          disabled={isReanalyzing}
        >
          {isReanalyzing ? "Re-analyzing..." : "Re-analyze"}
        </button>
      </div>

      {/* 3-sentence summary */}
      <div className="rounded border border-border bg-card p-4">
        <p className="text-sm leading-relaxed text-foreground">
          {analysis.summary_3_sentence}
        </p>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-4 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={cn(
                "pb-2 text-[13px] font-medium transition-colors",
                activeTab === tab.key
                  ? "border-b-2 border-gda-green text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeTab === "structure" && (
            <StructurePanel structure={analysis.structure} />
          )}
          {activeTab === "claims" && (
            <ListPanel items={analysis.key_claims} emptyMsg="No key claims extracted." />
          )}
          {activeTab === "numbers" && (
            <NumbersPanel numbers={analysis.key_numbers} />
          )}
          {activeTab === "tables" && (
            <TablesPanel tables={analysis.tables_extracted} />
          )}
          {activeTab === "risks" && (
            <ListPanel items={analysis.risks_or_gaps} emptyMsg="No risks or gaps identified." />
          )}
          {activeTab === "relevance" && (
            <RelevancePanel relevance={analysis.envision_relevance} />
          )}
        </div>
      </div>

      {/* Generate section */}
      <div className="rounded border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Generate from this analysis
          </h3>
          <button
            type="button"
            className="rounded bg-gda-green px-4 py-1.5 text-[13px] font-medium text-gda-bg-deep transition-colors hover:bg-gda-green-muted"
            onClick={() => setShowGenerate(true)}
          >
            Generate...
          </button>
        </div>
      </div>

      {/* Previous outputs */}
      {upload.outputs && upload.outputs.length > 0 && (
        <div className="rounded border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Previous outputs
          </h3>
          <div className="space-y-2">
            {upload.outputs.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded border border-border px-3 py-2"
              >
                <div>
                  <span className="text-[13px] font-medium text-foreground">
                    {o.output_type.replace(/_/g, " ")}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    .{o.output_format}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(o.generated_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateDrawer
          uploadId={upload.id}
          onClose={() => setShowGenerate(false)}
        />
      )}
    </div>
  );
}

function StructurePanel({
  structure,
}: {
  structure: TeardownAnalysis["structure"];
}) {
  if (!structure || structure.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No document structure extracted.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {structure.map((s, i) => (
        <div key={i} className="rounded border border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-foreground">
              {s.section_name}
            </span>
            <span className="text-xs text-muted-foreground">
              pp. {s.page_start}–{s.page_end}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
        </div>
      ))}
    </div>
  );
}

function ListPanel({
  items,
  emptyMsg,
}: {
  items: string[];
  emptyMsg: string;
}) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMsg}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="rounded border border-border px-3 py-2 text-[13px] text-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function NumbersPanel({
  numbers,
}: {
  numbers: TeardownAnalysis["key_numbers"];
}) {
  if (!numbers || numbers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No key numbers extracted.
      </p>
    );
  }
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <th className="pb-2 pr-4">Value</th>
          <th className="pb-2 pr-4">Context</th>
          <th className="pb-2 text-right tabular-nums">Page</th>
        </tr>
      </thead>
      <tbody>
        {numbers.map((n, i) => (
          <tr key={i} className="border-b border-border last:border-0">
            <td className="py-2 pr-4 font-medium tabular-nums text-foreground">
              {n.value}
            </td>
            <td className="py-2 pr-4 text-muted-foreground">{n.context}</td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {n.page}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablesPanel({
  tables,
}: {
  tables: TeardownAnalysis["tables_extracted"];
}) {
  if (!tables || tables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tables found in this document.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {tables.map((t, i) => (
        <div key={i}>
          <h4 className="mb-2 text-[13px] font-medium text-foreground">
            {t.caption || `Table ${i + 1}`}
          </h4>
          {t.rows && t.rows.length > 0 ? (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    {t.rows[0].map((cell, ci) => (
                      <th
                        key={ci}
                        className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground font-medium"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.slice(1).map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-border last:border-0"
                    >
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : t.csv ? (
            <pre className="overflow-x-auto rounded border border-border bg-gda-bg-base p-3 text-xs text-muted-foreground">
              {t.csv}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RelevancePanel({
  relevance,
}: {
  relevance: TeardownAnalysis["envision_relevance"];
}) {
  if (!relevance) {
    return (
      <p className="text-sm text-muted-foreground">
        No relevance data available.
      </p>
    );
  }

  const sections: { label: string; items: string[] }[] = [
    { label: "Agencies Mentioned", items: relevance.agencies_mentioned ?? [] },
    { label: "NAICS Mentioned", items: relevance.naics_mentioned ?? [] },
    { label: "Vehicles Mentioned", items: relevance.vehicles_mentioned ?? [] },
    {
      label: "Competitors Mentioned",
      items: relevance.competitors_mentioned ?? [],
    },
    {
      label: "Teammate Candidates",
      items: relevance.teammate_candidates ?? [],
    },
    { label: "Threat Candidates", items: relevance.threat_candidates ?? [] },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.label}>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {section.label}
          </h4>
          {section.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {section.items.map((item, i) => (
                <Badge key={i} className="text-[11px] border-border text-foreground">
                  {item}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
