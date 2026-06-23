"use client";

import { Suspense, useState, useMemo } from "react";
import {
  useRegulatoryList,
  useRegulatoryCount,
  type RegulatoryNotice,
} from "@/hooks/use-regulatory";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { PendingState } from "@/components/shared/pending-state";
import { PagePurpose } from "@/components/shared/page-purpose";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const REG_SORT_COLS: ColumnSortConfig[] = [
  { field: "document_number", type: "string" },
  { field: "title", type: "string" },
  { field: "publication_date", type: "date" },
  { field: "data_source", type: "string" },
];

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
  const { sortBy, sortDir, handleSort } = useTableSort("reg");

  const { data, isLoading, error } = useRegulatoryList({
    limit: 50,
    cursor,
  });
  const { data: countData } = useRegulatoryCount();

  const items = useMemo(() => {
    const raw = data?.items ?? [];
    if (sortBy) {
      return sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, REG_SORT_COLS) as unknown as typeof raw;
    }
    return raw;
  }, [data, sortBy, sortDir]);
  const nextCursor = data?.next_cursor ?? null;
  const count = countData?.count ?? null;

  if (error) return <ErrorState message={error.message} />;

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
      <PagePurpose
        title="Regulatory Notices"
        purpose="Tracks federal rulemaking and regulatory activity (from the Federal Register and related sources) that can reshape GovCon requirements, compliance obligations, and contract terms. Scan the latest notices, open the source document, and watch for changes that affect your pursuits."
      >
        {count !== null && (
          <span className="font-mono text-xs text-muted-foreground">
            {count} notice{count !== 1 ? "s" : ""}
          </span>
        )}
      </PagePurpose>

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
                <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
                  <SortableHeader label="Document #" field="document_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-left font-medium">Agencies</th>
                  <SortableHeader label="Publication Date" field="publication_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Source" field="data_source" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
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
