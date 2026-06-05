"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "ellipsis")[] = [1];

  const rangeStart = Math.max(2, current - 1);
  const rangeEnd = Math.min(total - 1, current + 1);

  if (rangeStart > 2) pages.push("ellipsis");
  for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
  if (rangeEnd < total - 1) pages.push("ellipsis");

  pages.push(total);
  return pages;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  const btnBase =
    "inline-flex items-center justify-center rounded border text-xs font-mono transition-colors min-w-[32px] h-8 px-2";
  const btnDefault =
    "border-border bg-gda-panel text-muted-foreground hover:text-foreground hover:border-gda-green/30";
  const btnActive =
    "border-gda-green/50 bg-gda-green/10 text-gda-green";
  const btnDisabled = "border-border bg-gda-panel text-muted-foreground/40 cursor-not-allowed";

  return (
    <div className="flex items-center gap-1.5 w-full">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className={`${btnBase} ${currentPage <= 1 ? btnDisabled : btnDefault}`}
      >
        Previous
      </button>

      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${p === currentPage ? btnActive : btnDefault}`}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className={`${btnBase} ${currentPage >= totalPages ? btnDisabled : btnDefault}`}
      >
        Next
      </button>
    </div>
  );
}
