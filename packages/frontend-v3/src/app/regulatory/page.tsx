"use client";

import { Suspense, useState } from "react";
import {
  useRegulatoryList,
  useRegulatoryCount,
  type RegulatoryNotice,
} from "@/hooks/use-regulatory";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { PendingState } from "@/components/shared/pending-state";

/* ── Date formatter (Eastern Time, short) ─────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

/* ── Source link component ─────────────────────────────────────── */

function SourceLink({ notice }: { notice: RegulatoryNotice }) {
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={notice.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gda-cyan underline underline-offset-2 hover:text-gda-green"
      >
        {notice.data_source}
      </a>
      {notice.pdf_url && (
        <a
          href={notice.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-gda-panel hover:text-foreground"
        >
          PDF
        </a>
      )}
    </span>
  );
}

/* ── Main page ────────────────────────────────────────────────── */

export default function RegulatoryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-64 bg-gda-panel" />}>
      <RegulatoryContent />
    </Suspense>
  );
}

function RegulatoryContent() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);

  const { data, isLoading, error } = useRegulatoryList({
    limit: 50,
    cursor,
  });
  const { data: countData } = useRegulatoryCount();

  if (error) return <ErrorState message={error.message} />;

  const items = data?.items ?? [];
  const nextCursor = data?.next_cursor ?? null;
  const count = countData?.count ?? null;

  function handleNext() {
    if (!nextCursor) return;
    setHistory((prev) => [...prev, cursor ?? ""]);
    setCursor(nextCursor);
  }

  function handlePrev() {
    if (history.length === 0) return;
    const prev = [...history];
    const last = prev.pop()!;
    setHistory(prev);
    setCursor(last || undefined);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-lg font-bold text-foreground">
            Regulatory Notices
          </h1>
          {count !== null && (
            <span className="font-mono text-xs text-muted-foreground">
              {count} notice{count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <PendingState surface="Regulatory Notices" reason="Loading regulatory notices…" />
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No regulatory notices found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base">
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Document #
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Title
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Agencies
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Publication Date
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((notice) => (
                  <tr
                    key={notice.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground">
                      <a
                        href={notice.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gda-cyan underline underline-offset-2 hover:text-gda-green"
                      >
                        {notice.document_number}
                      </a>
                    </td>
                    <td className="max-w-md px-3 py-2 text-foreground">
                      <span className="line-clamp-2">{notice.title}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="line-clamp-1">
                        {notice.agency_names.join(", ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtDate(notice.publication_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <SourceLink notice={notice} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cursor pagination */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {items.length} notice{items.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={history.length === 0}
                className="rounded border border-border px-3 py-1 text-[13px] font-medium text-foreground hover:bg-gda-panel disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={handleNext}
                disabled={!nextCursor}
                className="rounded border border-border px-3 py-1 text-[13px] font-medium text-foreground hover:bg-gda-panel disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
