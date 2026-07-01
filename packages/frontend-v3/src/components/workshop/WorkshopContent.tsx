"use client";

import { useState, useCallback } from "react";
import {
  useWorkshopUploads,
  useWorkshopUpload,
  useUploadWorkshopFile,
  useClassifyUpload,
  useReteardown,
  useDeleteWorkshopUpload,
} from "@/hooks/use-workshop";
import { UploadDropzone } from "@/components/workshop/UploadDropzone";
import { ClassifyModal } from "@/components/workshop/ClassifyModal";
import { TeardownView } from "@/components/workshop/TeardownView";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, string> = {
  pdf: "PDF",
  docx: "DOC",
  xlsx: "XLS",
  pptx: "PPT",
  msg: "MSG",
  txt: "TXT",
  md: "MD",
};

function fileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function WorkshopContent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [classifyTarget, setClassifyTarget] = useState<{
    id: string;
    filename: string;
  } | null>(null);
  const [page, setPage] = useState(1);

  const { data: list, isLoading: listLoading } = useWorkshopUploads(page);
  const { data: selectedUpload } = useWorkshopUpload(selectedId);
  const upload = useUploadWorkshopFile();
  const classify = useClassifyUpload();
  const reteardown = useReteardown();
  const deleteUpload = useDeleteWorkshopUpload();

  const handleFiles = useCallback(
    (files: File[]) => {
      upload.mutate(files, {
        onSuccess: (uploads) => {
          if (uploads.length === 1) {
            setClassifyTarget({
              id: uploads[0].id,
              filename: uploads[0].filename,
            });
            setSelectedId(uploads[0].id);
          }
        },
      });
    },
    [upload],
  );

  const handleClassify = useCallback(
    (classification: string) => {
      if (!classifyTarget) return;
      classify.mutate(
        { id: classifyTarget.id, classification },
        {
          onSuccess: () => {
            setClassifyTarget(null);
            setSelectedId(classifyTarget.id);
          },
        },
      );
    },
    [classify, classifyTarget],
  );

  const handleRowClick = useCallback(
    (id: string, filename: string, status: string, classification: string | null) => {
      if (status === "uploaded" && !classification) {
        setClassifyTarget({ id, filename });
      }
      setSelectedId(id);
    },
    [],
  );

  const items = list?.items ?? [];

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-8 py-6">
      {/* Left: Document Library */}
      <div className="w-80 shrink-0 space-y-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">Workshop</h1>
          <p className="truncate text-xs text-muted-foreground">
            Upload solicitation and reference documents, classify and tear them down, and generate analysis for captures.
          </p>
        </div>

        {/* Upload */}
        <UploadDropzone onFiles={handleFiles} disabled={upload.isPending} />

        {upload.isPending && (
          <p className="text-xs text-muted-foreground">Uploading...</p>
        )}
        {upload.isError && (
          <p className="text-xs text-gda-red">
            Upload failed: {upload.error?.message}
          </p>
        )}

        {/* File list */}
        <div className="space-y-1">
          {listLoading && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Loading...
            </p>
          )}
          {items.map((item) => {
            const ext = fileExt(item.filename);
            const isActive = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-gda-green bg-gda-green/5"
                    : "border-border hover:bg-gda-panel",
                )}
                onClick={() =>
                  handleRowClick(item.id, item.filename, item.status, item.classification)
                }
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-[11px] font-bold text-muted-foreground">
                  {TYPE_ICONS[ext] ?? ext.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {item.filename}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatDate(item.uploaded_at)}</span>
                    {item.size_bytes && (
                      <span>{formatBytes(item.size_bytes)}</span>
                    )}
                  </div>
                </div>
                {item.status === "analyzed" && (
                  <span className="shrink-0 rounded border border-gda-green/30 bg-gda-green/10 px-1.5 py-0.5 text-[11px] font-medium text-gda-green">
                    Analyzed
                  </span>
                )}
                {item.status === "analyzing" && (
                  <span className="shrink-0 h-3 w-3 animate-spin rounded-full border border-gda-green border-t-transparent" />
                )}
                {item.status === "failed" && (
                  <span className="shrink-0 rounded border border-gda-red/30 bg-gda-red/10 px-1.5 py-0.5 text-[11px] font-medium text-gda-red">
                    Failed
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {list && list.totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <span className="px-2 py-1 text-xs text-muted-foreground">
              {page} / {list.totalPages}
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={page >= list.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}

        {/* Delete selected */}
        {selectedId && (
          <button
            type="button"
            className="w-full rounded border border-gda-red/30 px-3 py-1.5 text-[12px] text-gda-red transition-colors hover:bg-gda-red/10"
            onClick={() => {
              if (
                !confirm(
                  `Delete ${selectedUpload?.filename ?? "this document"}? This cannot be undone.`,
                )
              ) {
                return;
              }
              deleteUpload.mutate(selectedId, {
                onSuccess: () => setSelectedId(null),
              });
            }}
          >
            Delete selected document
          </button>
        )}
      </div>

      {/* Right: Teardown view */}
      <div className="flex-1 min-w-0">
        {selectedUpload ? (
          <TeardownView
            upload={selectedUpload}
            onReanalyze={() => reteardown.mutate(selectedUpload.id)}
            isReanalyzing={reteardown.isPending}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-border p-12">
            <p className="text-sm text-muted-foreground">
              Drop a document to start, or select one from the library.
            </p>
          </div>
        )}
      </div>

      {/* Classify Modal */}
      {classifyTarget && (
        <ClassifyModal
          filename={classifyTarget.filename}
          onClassify={handleClassify}
          onCancel={() => setClassifyTarget(null)}
          isPending={classify.isPending}
        />
      )}
    </div>
  );
}
