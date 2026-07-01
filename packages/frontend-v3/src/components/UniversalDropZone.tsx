"use client";

import { useState, useCallback, useRef } from "react";
import { useUploadIngest } from "@/hooks/use-ingest-jobs";
import { useToast } from "@/components/ui/toast";

interface UniversalDropZoneProps {
  target: string;
  children: React.ReactNode;
}

const SURFACE_LABELS: Record<string, string> = {
  digest: "Digest",
  opportunities: "Opportunities",
  pipeline: "Pipeline",
  capture: "Capture",
  partner_intel: "Partner Intel",
  action_items: "Action Items",
  sentinel: "Sentinel",
  vault: "Vault",
  financials: "Financial Bible",
  regulatory: "Regulatory",
  fastrac: "FasTrac",
  vehicles: "Vehicles",
  awards: "Awards & Intel",
};

export function UniversalDropZone({ target, children }: UniversalDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCounter = useRef(0);
  const upload = useUploadIngest();
  const { toast } = useToast();

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      setIsUploading(true);

      for (const file of files) {
        try {
          await upload.mutateAsync({ file, surface: target });
          toast(
            `Uploaded "${file.name}" — classifying for ${SURFACE_LABELS[target] ?? target}`,
            "success",
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          toast(`Failed to upload "${file.name}": ${message}`, "error");
        }
      }

      setIsUploading(false);
    },
    [upload, target, toast],
  );

  return (
    <div
      className="relative flex-1 min-h-0"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded border-2 border-dashed border-accent bg-accent/5">
          <div className="rounded border border-accent bg-white px-6 py-4 text-center shadow-sm">
            <p className="text-sm font-medium text-ink">
              Drop files to ingest into {SURFACE_LABELS[target] ?? target}
            </p>
            <p className="mt-1 text-xs text-muted">
              Any file type accepted — auto-classified and routed
            </p>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded bg-bg/60">
          <div className="rounded border border-border bg-white px-6 py-4 text-center shadow-sm">
            <p className="text-sm font-medium text-ink">Uploading...</p>
          </div>
        </div>
      )}
    </div>
  );
}
