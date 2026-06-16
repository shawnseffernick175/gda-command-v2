"use client";

import { useCallback, useState, useRef } from "react";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [
  ".pptx",
  ".docx",
  ".xlsx",
  ".pdf",
  ".txt",
  ".md",
];

export function UploadDropzone({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter((f) => {
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext);
      });
      if (files.length > 0) onFiles(files);
    },
    [onFiles, disabled],
  );

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive(true);
      } else if (e.type === "dragleave") {
        setDragActive(false);
      }
    },
    [],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFiles(files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFiles],
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded border-2 border-dashed p-12 text-center transition-colors",
        dragActive
          ? "border-gda-green bg-gda-green/5"
          : "border-border bg-gda-panel/30",
        disabled && "pointer-events-none opacity-50",
      )}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <p className="text-sm font-medium text-foreground">
        Drop a document to start
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Accepts: {ALLOWED_EXTENSIONS.join(", ")}
      </p>
      <button
        type="button"
        className="mt-4 rounded border border-border bg-card px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-base"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
