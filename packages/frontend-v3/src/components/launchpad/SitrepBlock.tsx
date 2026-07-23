"use client";

import { useRef, useState } from "react";
import CollapsibleSection from "@/components/digest/CollapsibleSection";
import {
  useAddLaunchpadSitrepDocuments,
  useLaunchpadSitrep,
  todayEastern,
} from "@/hooks/use-launchpad-sitrep";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Format a YYYY-MM-DD string as "13 July 2026" (day, full month, year). */
function formatSitrepDate(date: string): string {
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const monthName = MONTHS[month - 1];
  if (!monthName || Number.isNaN(day) || Number.isNaN(year)) return date;
  return `${day} ${monthName} ${year}`;
}

function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export default function SitrepBlock() {
  const date = todayEastern();
  const { data, isLoading } = useLaunchpadSitrep(date);
  const upload = useAddLaunchpadSitrepDocuments(date);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const bullets = data?.bullets ?? [];
  const documents = data?.documents ?? [];

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    upload.mutate(Array.from(fileList), {
      onError: (err) =>
        setUploadError(err instanceof Error ? err.message : "Upload failed"),
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section>
      <CollapsibleSection id="sitrep" title="SITREP" defaultExpanded>
        <p className="font-mono text-sm font-bold text-foreground">
          {formatSitrepDate(date)}
        </p>

        {isLoading ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-4 rounded bg-gda-panel-alt animate-pulse"
              />
            ))}
          </div>
        ) : (
          <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-sm text-foreground marker:text-muted-foreground">
            {bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={upload.isPending}
                className="text-gda-cyan hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {upload.isPending ? "Adding documents…" : "Add Documents"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md"
                aria-label="Add documents to today's SITREP"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </li>
          </ol>
        )}

        {uploadError && (
          <p className="mt-2 text-xs text-gda-red">{uploadError}</p>
        )}

        {documents.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="font-mono text-[12px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
              Attached Documents
            </h3>
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
                >
                  <span className="truncate text-foreground">{doc.filename}</span>
                  <span className="shrink-0 font-mono">
                    {formatUploadedAt(doc.uploaded_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CollapsibleSection>
    </section>
  );
}
