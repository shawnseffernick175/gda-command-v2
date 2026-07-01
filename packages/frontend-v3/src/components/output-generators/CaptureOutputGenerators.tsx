"use client";

import { useState } from "react";
import {
  useGenerateCapturePlan,
  useGenerateWinThemes,
  useGeneratedDocs,
  downloadGeneratedDoc,
} from "@/hooks/use-output-generators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CaptureOutputGeneratorsProps {
  captureId: string;
}

export function CaptureOutputGenerators({
  captureId,
}: CaptureOutputGeneratorsProps) {
  const generatePlan = useGenerateCapturePlan();
  const generateThemes = useGenerateWinThemes();
  const { data: docs } = useGeneratedDocs({ capture_id: captureId });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");

  const planDocs = (docs?.items ?? []).filter(
    (d) => d.doc_type === "capture_plan",
  );
  const themeDocs = (docs?.items ?? []).filter(
    (d) => d.doc_type === "win_themes",
  );

  const handlePreview = (docId: number, title: string) => {
    setPreviewTitle(title);
    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech"}/v3/output-generators/${docId}/html`,
      {
        headers: {
          Authorization: `Bearer ${document.cookie.replace(/(?:(?:^|.*;\s*)token\s*=\s*([^;]*).*$)|^.*$/, "$1") || ""}`,
        },
      },
    )
      .then((r) => r.text())
      .then(setPreviewHtml)
      .catch(() => setPreviewHtml(null));
  };

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Output Generators
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => generatePlan.mutate(captureId)}
            disabled={generatePlan.isPending}
            className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {generatePlan.isPending
              ? "Generating..."
              : "Generate Capture Plan"}
          </button>
          <button
            type="button"
            onClick={() => generateThemes.mutate(captureId)}
            disabled={generateThemes.isPending}
            className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {generateThemes.isPending
              ? "Generating..."
              : "Generate Win Themes"}
          </button>
        </div>

        {generatePlan.isError && (
          <p className="text-xs text-critical">
            {(generatePlan.error as Error).message}
          </p>
        )}
        {generateThemes.isError && (
          <p className="text-xs text-critical">
            {(generateThemes.error as Error).message}
          </p>
        )}

        {generatePlan.isSuccess && generatePlan.data && (
          <GenerateResult
            data={generatePlan.data}
            onPreview={handlePreview}
          />
        )}

        {generateThemes.isSuccess && generateThemes.data && (
          <GenerateResult
            data={generateThemes.data}
            onPreview={handlePreview}
          />
        )}

        {(planDocs.length > 0 || themeDocs.length > 0) && (
          <div className="space-y-2">
            {planDocs.length > 0 && (
              <DocList
                label="Capture Plans"
                docs={planDocs}
                onPreview={handlePreview}
              />
            )}
            {themeDocs.length > 0 && (
              <DocList
                label="Win Themes"
                docs={themeDocs}
                onPreview={handlePreview}
              />
            )}
          </div>
        )}

        {previewHtml && (
          <PreviewModal
            title={previewTitle}
            html={previewHtml}
            onClose={() => setPreviewHtml(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function GenerateResult({
  data,
  onPreview,
}: {
  data: { id: number; title: string };
  onPreview: (id: number, title: string) => void;
}) {
  return (
    <div className="rounded border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-foreground">
      <p className="font-medium">{data.title}</p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => onPreview(data.id, data.title)}
          className="text-accent hover:underline text-xs"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => downloadGeneratedDoc(data.id, data.title)}
          className="text-accent hover:underline text-xs"
        >
          Download
        </button>
      </div>
    </div>
  );
}

function DocList({
  label,
  docs,
  onPreview,
}: {
  label: string;
  docs: Array<{ id: number; title: string; created_at: string }>;
  onPreview: (id: number, title: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between rounded border border-border bg-white px-3 py-1.5 text-xs"
        >
          <span className="text-foreground truncate max-w-[200px]">
            {doc.title}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPreview(doc.id, doc.title)}
              className="text-accent hover:underline text-[11px]"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => downloadGeneratedDoc(doc.id, doc.title)}
              className="text-accent hover:underline text-[11px]"
            >
              Download
            </button>
            <span className="text-muted-foreground text-[11px]">
              {new Date(doc.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewModal({
  title,
  html,
  onClose,
}: {
  title: string;
  html: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-mono text-sm text-foreground">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <iframe
            srcDoc={html}
            title="Document Preview"
            className="w-full h-full min-h-[600px] border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
