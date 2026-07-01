"use client";

import { useState } from "react";
import {
  useGenerateBriefing,
  useGeneratedDocs,
  downloadGeneratedDoc,
} from "@/hooks/use-output-generators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GenerateBriefingButtonProps {
  opportunityId: string;
}

export function GenerateBriefingButton({
  opportunityId,
}: GenerateBriefingButtonProps) {
  const generateBriefing = useGenerateBriefing();
  const { data: docs } = useGeneratedDocs({
    opportunity_id: opportunityId,
  });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");

  const briefingDocs = (docs?.items ?? []).filter(
    (d) => d.doc_type === "briefing",
  );

  const handleGenerate = () => {
    generateBriefing.mutate(opportunityId);
  };

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
            onClick={handleGenerate}
            disabled={generateBriefing.isPending}
            className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {generateBriefing.isPending
              ? "Generating..."
              : "Generate Briefing"}
          </button>
        </div>

        {generateBriefing.isError && (
          <p className="text-xs text-critical">
            {(generateBriefing.error as Error).message}
          </p>
        )}

        {generateBriefing.isSuccess && generateBriefing.data && (
          <div className="rounded border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-foreground">
            <p className="font-medium">
              Briefing generated: {generateBriefing.data.title}
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  handlePreview(
                    generateBriefing.data.id,
                    generateBriefing.data.title,
                  )
                }
                className="text-accent hover:underline text-xs"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadGeneratedDoc(
                    generateBriefing.data.id,
                    generateBriefing.data.title,
                  )
                }
                className="text-accent hover:underline text-xs"
              >
                Download
              </button>
            </div>
          </div>
        )}

        {briefingDocs.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Previous Briefings
            </p>
            {briefingDocs.map((doc) => (
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
                    onClick={() => handlePreview(doc.id, doc.title)}
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
