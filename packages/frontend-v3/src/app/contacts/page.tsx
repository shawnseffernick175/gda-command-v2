"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useContacts, useContactsCount } from "@/hooks/use-contacts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import type { GovTriContact } from "@/lib/types";

export default function ContactsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [previousItems, setPreviousItems] = useState<GovTriContact[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = useMemo(
    () => ({
      q: searchQuery || undefined,
      cursor,
    }),
    [searchQuery, cursor],
  );

  const { data, isLoading, error, refetch } = useContacts(params);
  const { data: countData } = useContactsCount();

  const allItems = useMemo(() => {
    const combined = [...previousItems, ...(data?.items ?? [])];
    const seen = new Set<number>();
    return combined.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [previousItems, data?.items]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchInput(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCursor(undefined);
        setPreviousItems([]);
        setSearchQuery(val);
      }, 350);
    },
    [],
  );

  const handleLoadMore = useCallback(() => {
    if (data?.pagination?.cursor) {
      setPreviousItems((prev) => [...prev, ...(data?.items ?? [])]);
      setCursor(data.pagination.cursor);
    }
  }, [data]);

  const hasMore = data?.pagination?.hasMore ?? false;
  const totalCount = countData?.count ?? 0;
  const isEmpty = !isLoading && !error && totalCount === 0;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Agency Contacts
        </h1>
        <ErrorState message="Failed to load contacts" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-mono text-lg font-bold text-foreground">
          Agency Contacts
        </h1>
        {totalCount > 0 && (
          <Badge
            variant="outline"
            className="border-gda-cyan/30 text-gda-cyan font-mono text-[11px]"
          >
            {totalCount.toLocaleString()}
          </Badge>
        )}
      </div>

      {isEmpty ? (
        <Card className="border-border bg-gda-panel">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              GovTribe contacts ingest pending — contacts will appear after the
              next scheduled run (Mon/Thu 6am ET)
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search name, title, or agency…"
              value={searchInput}
              onChange={handleSearchChange}
              className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-72"
            />
          </div>

          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Agency</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Contact Type
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Phone</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && allItems.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-3 py-2">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : allItems.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border hover:bg-gda-panel/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-xs text-foreground">
                          {c.source_url ? (
                            <a
                              href={c.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gda-cyan hover:underline"
                            >
                              {c.name ?? "—"}
                            </a>
                          ) : (
                            c.name ?? "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.title ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.agency ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {c.contact_type ? (
                            <Badge
                              variant="outline"
                              className="text-[11px]"
                            >
                              {c.contact_type}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="text-gda-cyan hover:underline"
                            >
                              {c.email}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(c.last_seen_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                {!isLoading && allItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-xs text-muted-foreground italic"
                    >
                      No contacts match your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={isLoading}
              className="rounded border border-border bg-gda-panel px-4 py-1.5 text-xs text-foreground hover:bg-gda-panel/80 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
