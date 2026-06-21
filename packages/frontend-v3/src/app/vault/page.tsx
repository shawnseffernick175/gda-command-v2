"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  useVaultDocuments,
  useVaultCount,
  useVaultCountsByBucket,
  useVaultDocument,
  useVaultDocumentText,
  useUploadVaultDocument,
  useLinkVaultDocument,
  useDeleteVaultDocument,
  useUpdateVaultDocType,
  useRegulatoryCatalog,
  useReExtractVaultDocument,
  useVaultUnresolvedCount,
  useResolveAllVault,
} from "@/hooks/use-vault";
import { Pagination } from "@/components/shared/Pagination";
import { PendingState } from "@/components/shared/pending-state";
import { ErrorState } from "@/components/shared/error-state";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { VaultDocument, RegulatoryCatalogEntry } from "@/lib/types";

/* ── Constants ─────────────────────────────────────────────── */

const VAULT_BUCKETS = [
  "bid_protest",
  "capability_statement",
  "certificate",
  "color_review",
  "contract",
  "correspondence",
  "financial",
  "market_research",
  "past_performance",
  "personnel",
  "policy_regulatory",
  "proposal",
  "rfp",
  "subcontract_teaming",
  "technical_artifact",
  "training_material",
  "other",
] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  bid_protest: "Bid Protest",
  capability_statement: "Capability Statement",
  certificate: "Certificate",
  color_review: "Color Review",
  contract: "Contract",
  correspondence: "Correspondence",
  financial: "Financial",
  market_research: "Market Research",
  past_performance: "Past Performance",
  personnel: "Personnel",
  policy_regulatory: "Policy / Regulatory",
  proposal: "Proposal",
  rfp: "RFP / Solicitation",
  subcontract_teaming: "Subcontract / Teaming",
  technical_artifact: "Technical Artifact",
  training_material: "Training Material",
  other: "Other",
};

const REGULATORY_CATEGORIES: Record<string, string> = {
  far: "FAR (Federal Acquisition Regulation)",
  dfars: "DFARS (Defense Federal Acquisition Regulation Supplement)",
  ndaa: "NDAA (National Defense Authorization Act)",
  executive_order: "Executive Orders",
  gao_decision: "GAO Decisions",
  dod_policy: "DoD Policy / USD(A&S)",
  cmmc: "CMMC / CUI / ITAR",
  dfars_pgi: "DFARS PGI",
  cui_policy: "CUI Policy",
  itar_ear: "ITAR / EAR",
  other: "Other",
};

function docTypeBadgeClass(dt: string): string {
  switch (dt) {
    case "contract":
    case "rfp":
      return "border-gda-cyan/30 text-gda-cyan bg-gda-cyan/10";
    case "proposal":
    case "past_performance":
    case "capability_statement":
      return "border-gda-green/30 text-gda-green bg-gda-green/10";
    case "financial":
    case "bid_protest":
      return "border-gda-amber/30 text-gda-amber bg-gda-amber/10";
    case "certificate":
    case "subcontract_teaming":
    case "color_review":
      return "border-gda-green/30 text-gda-green bg-gda-green/10";
    default:
      return "border-border text-muted-foreground";
  }
}

function ExtractionStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <span title="Extraction successful" className="text-gda-green text-xs">
          &#x2713;
        </span>
      );
    case "failed":
      return (
        <span
          title="Extraction failed"
          className="inline-block rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold border border-gda-red/40 bg-gda-red/10 text-gda-red"
        >
          FAILED
        </span>
      );
    case "unsupported":
      return (
        <span
          title="File type not supported for extraction"
          className="inline-block rounded px-1.5 py-0.5 text-[11px] font-mono border border-gda-amber/40 bg-gda-amber/10 text-gda-amber"
        >
          N/A
        </span>
      );
    default:
      return (
        <span title="Extraction pending" className="text-muted-foreground text-xs">
          &#x231b;
        </span>
      );
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Page ──────────────────────────────────────────────────── */

export default function VaultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get("page") ?? "1") || 1;

  const [activeTab, setActiveTab] = useState<"work_product" | "regulatory">(
    "work_product",
  );
  const [docTypeFilter, setDocTypeFilter] = useState<string | undefined>(
    undefined,
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useVaultDocuments({
    doc_type: docTypeFilter || undefined,
    q: searchQuery || undefined,
    category: activeTab === "regulatory" ? "regulatory" : undefined,
    limit: 50,
    page: currentPage,
  });
  const { data: countData } = useVaultCount();
  const { data: bucketCounts } = useVaultCountsByBucket();
  const { data: unresolvedData } = useVaultUnresolvedCount();
  const resolveAll = useResolveAllVault();
  const deleteDoc = useDeleteVaultDocument();
  const [resolveMsg, setResolveMsg] = useState<string | null>(null);

  const unresolvedCount = unresolvedData?.count ?? 0;

  const handleResolveAll = useCallback(() => {
    if (resolveAll.isPending) return;
    setResolveMsg(null);
    resolveAll.mutate(undefined, {
      onSuccess: (res) => {
        const { docs_resolved, docs_still_unresolved } = res.summary;
        setResolveMsg(
          docs_still_unresolved > 0
            ? `Resolved ${docs_resolved} · ${docs_still_unresolved} still need attention`
            : `Resolved all ${docs_resolved} document${docs_resolved === 1 ? "" : "s"}`,
        );
      },
      onError: () => setResolveMsg("Resolve failed. Try again."),
    });
  }, [resolveAll]);

  const totalCount = useMemo(() => {
    if (!bucketCounts) return countData?.count ?? 0;
    return Object.values(bucketCounts).reduce((a, b) => a + b, 0);
  }, [bucketCounts, countData]);

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  const setPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) params.delete("page");
      else params.set("page", String(page));
      router.push(`${pathname}?${params.toString()}`);
      listRef.current?.scrollIntoView({ behavior: "smooth" });
    },
    [searchParams, router, pathname],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchInput(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchQuery(val);
        setPage(1);
      }, 300);
    },
    [setPage],
  );

  const handleDelete = useCallback(
    (doc: VaultDocument) => {
      if (doc.is_system_doc) return;
      if (
        !confirm(`Delete ${doc.filename}? This cannot be undone.`)
      )
        return;
      deleteDoc.mutate(doc.id);
    },
    [deleteDoc],
  );

  return (
    <div className="space-y-6" ref={listRef}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-4 sticky-page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-bold text-foreground">Vault</h1>
            {countData && (
              <Badge
                variant="outline"
                className="border-gda-cyan/30 text-gda-cyan font-mono text-[11px]"
              >
                {countData.count} documents
              </Badge>
            )}
          </div>
          {activeTab === "work_product" && (
            <div className="flex items-center gap-2">
              {resolveMsg && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {resolveMsg}
                </span>
              )}
              {unresolvedCount > 0 && (
                <button
                  onClick={handleResolveAll}
                  disabled={resolveAll.isPending}
                  title="Re-run extraction + AI parse on every unresolved document"
                  className="rounded border border-gda-amber/40 bg-gda-amber/10 px-4 py-1.5 text-xs font-mono text-gda-amber hover:bg-gda-amber/20 transition-colors disabled:opacity-50"
                >
                  {resolveAll.isPending
                    ? "Resolving…"
                    : `Resolve All (${unresolvedCount})`}
                </button>
              )}
              <button
                onClick={() => setShowUploadModal(true)}
                className="rounded border border-gda-green/40 bg-gda-green/10 px-4 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 transition-colors"
              >
                Upload Document
              </button>
            </div>
          )}
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Your central document library — proposals, work product, and reference
          files tied to opportunities and captures. Browse and upload documents,
          and pull up the source material behind your pursuits.
        </p>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => {
              setActiveTab("work_product");
              setDocTypeFilter(undefined);
              setPage(1);
            }}
            className={`px-4 py-2 text-xs font-mono font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "work_product"
                ? "border-gda-green text-gda-green"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Work Product
          </button>
          <button
            onClick={() => {
              setActiveTab("regulatory");
              setDocTypeFilter(undefined);
              setPage(1);
            }}
            className={`px-4 py-2 text-xs font-mono font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "regulatory"
                ? "border-gda-cyan text-gda-cyan"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Regulatory Library
          </button>
        </div>
      </div>

      {/* Bucket chip bar */}
      {activeTab === "work_product" && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => {
              setDocTypeFilter(undefined);
              setPage(1);
            }}
            className={`rounded px-2 py-0.5 text-[11px] font-mono border transition-colors ${
              !docTypeFilter
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({totalCount})
          </button>
          {VAULT_BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => {
                setDocTypeFilter(b);
                setPage(1);
              }}
              className={`rounded px-2 py-0.5 text-[11px] font-mono border transition-colors ${
                docTypeFilter === b
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {DOC_TYPE_LABELS[b]} ({bucketCounts?.[b] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            &#x1F50D;
          </span>
          <input
            type="text"
            placeholder="Search documents…"
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full rounded border border-border bg-gda-panel pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {/* Content area */}
      {activeTab === "work_product" ? (
        <WorkProductTable
          items={items}
          isLoading={isLoading}
          onSelect={setSelectedDocId}
          onDelete={handleDelete}
          onLink={(id) => setShowLinkModal(id)}
        />
      ) : (
        <RegulatoryLibrary searchQuery={searchQuery} />
      )}

      {activeTab === "work_product" && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {/* Detail drawer */}
      {selectedDocId !== null && (
        <DocumentReaderDrawer
          docId={selectedDocId}
          onClose={() => setSelectedDocId(null)}
          onLink={(id) => {
            setSelectedDocId(null);
            setShowLinkModal(id);
          }}
          onDelete={(doc) => {
            setSelectedDocId(null);
            handleDelete(doc);
          }}
        />
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} />
      )}

      {/* Link modal */}
      {showLinkModal !== null && (
        <LinkModal
          docId={showLinkModal}
          onClose={() => setShowLinkModal(null)}
        />
      )}
    </div>
  );
}

/* ── Work Product Table ────────────────────────────────────── */

/* ── Doc Type Sorted Options ─────────────────────────────── */

const DOC_TYPE_OPTIONS = [...VAULT_BUCKETS]
  .sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return (DOC_TYPE_LABELS[a] ?? a).localeCompare(DOC_TYPE_LABELS[b] ?? b);
  });

const VAULT_SORT_COLS: ColumnSortConfig[] = [
  { field: "filename", type: "string" },
  { field: "doc_type", type: "string" },
  { field: "uploaded_at", type: "date" },
];

function WorkProductTable({
  items,
  isLoading,
  onSelect,
  onDelete,
  onLink,
}: {
  items: VaultDocument[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  onDelete: (doc: VaultDocument) => void;
  onLink: (id: number) => void;
}) {
  const updateDocType = useUpdateVaultDocType();
  const reExtract = useReExtractVaultDocument();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { sortBy, sortDir, handleSort } = useTableSort("vault");

  const sorted = useMemo(() => {
    if (!sortBy) return items;
    return sortData(items as unknown as Record<string, unknown>[], sortBy, sortDir, VAULT_SORT_COLS) as unknown as VaultDocument[];
  }, [items, sortBy, sortDir]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);
  if (isLoading && !items.length) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 bg-gda-panel" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <PendingState
        surface="Vault"
        reason="No documents uploaded yet. Use the Upload button to add your first document."
      />
    );
  }

  return (
    <div className="rounded border border-border overflow-hidden relative">
      {errorMsg && (
        <div className="absolute top-2 right-2 z-50 bg-red-900/90 text-red-100 text-xs px-3 py-2 rounded shadow-lg">
          {errorMsg}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
            <SortableHeader label="Filename" field="filename" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Type" field="doc_type" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2 text-center font-medium bg-gda-bg-base" title="Extraction status">Extract</th>
            <th className="px-3 py-2 text-center font-medium bg-gda-bg-base" title="AI ingestion status">AI</th>
            <th className="px-3 py-2 text-left font-medium bg-gda-bg-base">Linked To</th>
            <th className="px-3 py-2 text-left font-medium bg-gda-bg-base">Regulatory Refs</th>
            <SortableHeader label="Uploaded" field="uploaded_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2 text-left font-medium bg-gda-bg-base">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((doc) => (
            <tr
              key={doc.id}
              className="border-b border-border hover:bg-gda-panel/50 transition-colors group"
            >
              <td className="px-3 py-2">
                <button
                  onClick={() => onSelect(doc.id)}
                  className="text-foreground hover:text-gda-green text-left font-mono text-xs truncate max-w-[200px] block"
                >
                  {doc.filename}
                </button>
              </td>
              <td className="px-3 py-2">
                <select
                  value={doc.doc_type}
                  disabled={updateDocType.isPending && updateDocType.variables?.id === doc.id}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val || val === doc.doc_type) return;
                    updateDocType.mutate(
                      { id: doc.id, doc_type: val },
                      {
                        onError: () => {
                          setErrorMsg("Could not update category. Try again.");
                        },
                      },
                    );
                  }}
                  className={`text-[11px] font-mono border rounded px-2 py-0.5 cursor-pointer appearance-none bg-transparent pr-5 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_4px_center] ${docTypeBadgeClass(doc.doc_type)}`}
                >
                  {DOC_TYPE_OPTIONS.map((dt) => (
                    <option key={dt} value={dt}>
                      {DOC_TYPE_LABELS[dt] ?? dt}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2 text-center">
                <ExtractionStatusBadge status={doc.extraction_status} />
              </td>
              <td className="px-3 py-2 text-center">
                {doc.ai_summary && doc.ai_tags ? (
                  <span
                    title={`AI ingested \u00b7 ${(doc.ai_tags as string[]).length} tags`}
                    className="text-gda-green"
                  >
                    {"\u2713"}
                  </span>
                ) : (
                  <span title="AI pending" className="text-muted-foreground">
                    {"\u231b"}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                <LinkedTo doc={doc} />
              </td>
              <td className="px-3 py-2">
                {doc.regulatory_citation ? (
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-mono border border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan">
                    {doc.regulatory_citation}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                {formatDate(doc.uploaded_at)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelect(doc.id)}
                    className="text-[11px] text-gda-cyan hover:text-gda-cyan/80 font-mono"
                  >
                    Read
                  </button>
                  <button
                    onClick={() => onLink(doc.id)}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-mono"
                  >
                    Link
                  </button>
                  {doc.extraction_status !== 'success' && (
                    <button
                      onClick={() => reExtract.mutate(doc.id, {
                        onError: () => setErrorMsg("Re-extraction failed. Try again."),
                      })}
                      disabled={reExtract.isPending}
                      className="text-[11px] text-gda-amber hover:text-gda-amber/80 font-mono"
                    >
                      {reExtract.isPending && reExtract.variables === doc.id ? "Extracting\u2026" : "Re-extract"}
                    </button>
                  )}
                  {!doc.is_system_doc && (
                    <button
                      onClick={() => onDelete(doc)}
                      className="text-[11px] text-gda-red hover:text-gda-red/80 font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Regulatory Library ────────────────────────────────────── */

function RegulatoryLibrary({ searchQuery }: { searchQuery: string }) {
  const { data: catalog, isLoading } = useRegulatoryCatalog();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(REGULATORY_CATEGORIES)),
  );

  const grouped = useMemo(() => {
    if (!catalog) return {};
    const groups: Record<string, RegulatoryCatalogEntry[]> = {};
    for (const entry of catalog) {
      const cat = entry.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return groups;
  }, [catalog]);

  const filteredGrouped = useMemo(() => {
    if (!searchQuery) return grouped;
    const q = searchQuery.toLowerCase();
    const result: Record<string, RegulatoryCatalogEntry[]> = {};
    for (const [cat, entries] of Object.entries(grouped)) {
      const filtered = entries.filter(
        (e) =>
          e.citation.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          (e.summary?.toLowerCase().includes(q) ?? false),
      );
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [grouped, searchQuery]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 bg-gda-panel" />
        ))}
      </div>
    );
  }

  const categoryOrder = Object.keys(REGULATORY_CATEGORIES);
  const sortedCategories = Object.keys(filteredGrouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
  );

  if (sortedCategories.length === 0) {
    return (
      <PendingState
        surface="Regulatory Library"
        reason={
          searchQuery
            ? "No regulatory entries match your search."
            : "No regulatory catalog entries loaded."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {sortedCategories.map((cat) => {
        const entries = filteredGrouped[cat] ?? [];
        const isExpanded = expandedCategories.has(cat);
        return (
          <div
            key={cat}
            className="rounded border border-border overflow-hidden"
          >
            <button
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gda-bg-base hover:bg-gda-panel/50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-foreground">
                  {REGULATORY_CATEGORIES[cat] ?? cat}
                </span>
                <Badge
                  variant="outline"
                  className="border-gda-cyan/30 text-gda-cyan font-mono text-[11px]"
                >
                  {entries.length}
                </Badge>
              </div>
              <span className="text-muted-foreground text-xs">
                {isExpanded ? "▼" : "▶"}
              </span>
            </button>
            {isExpanded && (
              <div className="border-t border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-gda-panel/30 text-muted-foreground">
                      <th className="px-4 py-1.5 text-left font-medium">
                        Citation
                      </th>
                      <th className="px-4 py-1.5 text-left font-medium">
                        Title
                      </th>
                      <th className="px-4 py-1.5 text-left font-medium">
                        Summary
                      </th>
                      <th className="px-4 py-1.5 text-left font-medium">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-border last:border-0 hover:bg-gda-panel/30 transition-colors"
                      >
                        <td className="px-4 py-2">
                          <span className="font-mono text-gda-cyan text-[11px]">
                            {entry.citation}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-foreground max-w-[250px]">
                          {entry.title}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground max-w-[350px] truncate">
                          {entry.summary ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          {entry.url ? (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gda-cyan hover:text-gda-cyan/80 font-mono text-[11px]"
                            >
                              View Source ↗
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── LinkedTo ──────────────────────────────────────────────── */

function LinkedTo({ doc }: { doc: VaultDocument }) {
  if (doc.opp_title) {
    return (
      <Link
        href={`/opportunities?id=${doc.linked_opportunity_id}`}
        className="text-gda-green hover:underline"
      >
        {doc.opp_title}
      </Link>
    );
  }
  if (doc.capture_title) {
    return (
      <Link
        href={`/capture?opp=${doc.linked_capture_id}`}
        className="text-gda-green hover:underline"
      >
        {doc.capture_title}
      </Link>
    );
  }
  if (doc.award_title) {
    return <span className="text-foreground">{doc.award_title}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

/* ── Document Reader Drawer ────────────────────────────────── */

function DocumentReaderDrawer({
  docId,
  onClose,
  onLink,
  onDelete,
}: {
  docId: number;
  onClose: () => void;
  onLink: (id: number) => void;
  onDelete: (doc: VaultDocument) => void;
}) {
  const { data: doc, isLoading } = useVaultDocument(docId);
  const { data: textData } = useVaultDocumentText(docId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-gda-bg-base border-l border-border overflow-y-auto">
        <div className="p-6 space-y-6">
          {isLoading || !doc ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-6 bg-gda-panel" />
              ))}
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <span className="font-mono text-sm text-foreground font-medium truncate">
                    {doc.filename}
                  </span>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-mono border ${docTypeBadgeClass(doc.doc_type)}`}
                  >
                    {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                  </span>
                  <span className="inline-block rounded px-2 py-0.5 text-[11px] font-mono border border-border text-muted-foreground">
                    {doc.doc_category === "regulatory"
                      ? "Regulatory"
                      : "Work Product"}
                  </span>
                  {doc.ai_summary && doc.ai_tags ? (
                    <span
                      title={`AI ingested \u00b7 ${(doc.ai_tags as string[]).length} tags`}
                      className="inline-block rounded px-2 py-0.5 text-[11px] font-mono border border-gda-green/30 bg-gda-green/10 text-gda-green"
                    >
                      AI {"\u2713"}
                    </span>
                  ) : (
                    <span
                      title="AI pending"
                      className="inline-block rounded px-2 py-0.5 text-[11px] font-mono border border-border text-muted-foreground"
                    >
                      AI {"\u231b"}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground text-lg ml-2"
                >
                  ×
                </button>
              </div>

              <div className="text-xs text-muted-foreground font-mono">
                {formatBytes(doc.file_size_bytes)} · Uploaded{" "}
                {formatTimestamp(doc.uploaded_at)}
              </div>

              <hr className="border-border" />

              {/* AI Summary */}
              {doc.ai_summary && (
                <div className="space-y-1">
                  <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    AI Summary
                  </h3>
                  <p className="text-xs text-foreground leading-relaxed">
                    {doc.ai_summary}
                  </p>
                </div>
              )}

              <hr className="border-border" />

              {/* Regulatory Citations */}
              {doc.regulatory_citation && (
                <div className="space-y-1">
                  <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Regulatory Citations
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded px-2 py-0.5 text-[11px] font-mono border border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan">
                      {doc.regulatory_citation}
                    </span>
                  </div>
                </div>
              )}

              {/* Key Entities */}
              {doc.ai_entities && doc.ai_entities.length > 0 && (
                <div className="space-y-1">
                  <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Key Entities
                  </h3>
                  <div className="rounded border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-gda-panel text-muted-foreground">
                          <th className="px-2 py-1 text-left font-medium">
                            Name
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Type
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.ai_entities.map((e, i) => (
                          <tr
                            key={i}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-2 py-1 text-foreground">
                              {e.name}
                            </td>
                            <td className="px-2 py-1 text-muted-foreground font-mono">
                              {e.type}
                            </td>
                            <td className="px-2 py-1 text-foreground">
                              {e.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <hr className="border-border" />

              {/* Auto-Routing / Linked Records */}
              <div className="space-y-2">
                <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Auto-Routing
                </h3>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Linked Opportunity:
                    </span>
                    {doc.opp_title ? (
                      <Link
                        href={`/opportunities?id=${doc.linked_opportunity_id}`}
                        className="text-gda-green hover:underline"
                      >
                        {doc.opp_title}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          Not linked
                        </span>
                        <button
                          onClick={() => onLink(doc.id)}
                          className="text-gda-cyan text-[11px] font-mono hover:underline"
                        >
                          Link
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Linked Capture:
                    </span>
                    {doc.capture_title ? (
                      <Link
                        href={`/capture?opp=${doc.linked_capture_id}`}
                        className="text-gda-green hover:underline"
                      >
                        {doc.capture_title}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          Not linked
                        </span>
                        <button
                          onClick={() => onLink(doc.id)}
                          className="text-gda-cyan text-[11px] font-mono hover:underline"
                        >
                          Link
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <hr className="border-border" />

              {/* Full Text */}
              <div className="space-y-1">
                <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Full Text
                </h3>
                <pre className="rounded border border-border bg-gda-panel p-3 font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
                  {textData?.extracted_text ?? doc.extracted_text ?? "No text extracted."}
                </pre>
              </div>

              <hr className="border-border" />

              {/* Audit Trail */}
              {doc.audit_trail && doc.audit_trail.length > 0 && (
                <div className="space-y-1">
                  <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Audit Trail
                  </h3>
                  <div className="rounded border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-gda-panel text-muted-foreground">
                          <th className="px-2 py-1 text-left font-medium">
                            Action
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Actor
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Timestamp
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.audit_trail.map((a) => (
                          <tr
                            key={a.id}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-2 py-1">
                              <span className="text-[11px] uppercase tracking-wide font-mono text-foreground">
                                {a.action}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-muted-foreground">
                              {a.actor}
                            </td>
                            <td className="px-2 py-1 text-muted-foreground font-mono">
                              {formatTimestamp(a.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Delete button */}
              {!doc.is_system_doc && (
                <div className="pt-2">
                  <button
                    onClick={() => onDelete(doc)}
                    className="rounded border border-gda-red/40 bg-gda-red/10 px-4 py-1.5 text-xs font-mono text-gda-red hover:bg-gda-red/20 transition-colors"
                  >
                    Delete Document
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Upload Modal ──────────────────────────────────────────── */

type QueuedFile = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  message?: string;
};

function UploadModal({ onClose }: { onClose: () => void }) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<string>("other");
  const upload = useUploadVaultDocument();
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).map<QueuedFile>((file) => ({
      file,
      status: "queued",
    }));
    if (incoming.length === 0) return;
    setQueue((prev) => [...prev, ...incoming]);
  }, []);

  const removeAt = useCallback((idx: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // Upload every queued file sequentially through the existing
  // extract -> AI parse -> smart-route pipeline. Sequential keeps server
  // load predictable and gives clear per-file status.
  const handleSubmit = useCallback(async () => {
    if (running) return;
    setRunning(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "done") continue;
      setQueue((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: "uploading" } : q)),
      );
      try {
        const data = await upload.mutateAsync({
          file: queue[i].file,
          docType: selectedBucket,
        });
        const routed = data.routing?.routing_rationale
          ? "routed"
          : "stored";
        setQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "done", message: routed } : q,
          ),
        );
      } catch (err) {
        setQueue((prev) =>
          prev.map((q, idx) =>
            idx === i
              ? { ...q, status: "error", message: (err as Error).message }
              : q,
          ),
        );
      }
    }
    setRunning(false);
  }, [queue, upload, running, selectedBucket]);

  const pending = queue.filter((q) => q.status !== "done").length;
  const doneCount = queue.filter((q) => q.status === "done").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gda-bg-base border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Upload {"&"} Route
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Add one or more files. AI will still summarize and tag documents, but
          the bucket you choose here is final.
        </p>

        {/* Bucket dropdown */}
        <div>
          <label className="block text-xs font-medium mb-1 text-foreground">
            Bucket
          </label>
          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="w-full rounded border border-border bg-gda-panel px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
            required
          >
            {VAULT_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {DOC_TYPE_LABELS[b]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            AI will still summarize and tag the document, but the bucket you
            choose here is final.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-gda-green bg-gda-green/5"
              : "border-border hover:border-gda-cyan/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.txt,.csv,.zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Drag and drop files here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, DOCX, XLSX, TXT, CSV, ZIP - max 20MB each
            </p>
          </div>
        </div>

        {/* Queued files */}
        {queue.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-auto">
            {queue.map((q, idx) => (
              <div
                key={`${q.file.name}-${idx}`}
                className="flex items-center justify-between gap-2 rounded border border-border bg-gda-panel/40 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground">
                    {q.file.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(q.file.size)}
                    {q.message ? ` - ${q.message}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-[11px] ${
                    q.status === "done"
                      ? "text-gda-green"
                      : q.status === "error"
                        ? "text-gda-red"
                        : q.status === "uploading"
                          ? "text-gda-cyan"
                          : "text-muted-foreground"
                  }`}
                >
                  {q.status === "done"
                    ? "done"
                    : q.status === "error"
                      ? "failed"
                      : q.status === "uploading"
                        ? "..."
                        : "queued"}
                </span>
                {!running && q.status !== "done" && (
                  <button
                    onClick={() => removeAt(idx)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Remove"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {doneCount > 0 && (
          <p className="text-xs font-mono text-gda-green">
            {doneCount} of {queue.length} uploaded
          </p>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            {doneCount > 0 && pending === 0 ? "Close" : "Cancel"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending === 0 || running}
            className="rounded border border-gda-green/40 bg-gda-green/10 px-4 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {running
              ? "Processing..."
              : pending > 1
                ? `Upload & Route All (${pending})`
                : "Upload & Route"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Link Modal ────────────────────────────────────────────── */

function LinkModal({
  docId,
  onClose,
}: {
  docId: number;
  onClose: () => void;
}) {
  const [oppId, setOppId] = useState("");
  const [captureId, setCaptureId] = useState("");
  const [awardId, setAwardId] = useState("");
  const linkMut = useLinkVaultDocument();

  const handleLink = useCallback(() => {
    const payload: {
      id: number;
      opportunity_id?: number;
      capture_id?: number;
      award_id?: number;
    } = { id: docId };

    if (oppId) payload.opportunity_id = Number(oppId);
    if (captureId) payload.capture_id = Number(captureId);
    if (awardId) payload.award_id = Number(awardId);

    linkMut.mutate(payload, { onSuccess: () => onClose() });
  }, [docId, oppId, captureId, awardId, linkMut, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-gda-bg-base border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Link Document
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-mono">
              Opportunity ID
            </label>
            <input
              type="number"
              value={oppId}
              onChange={(e) => setOppId(e.target.value)}
              placeholder="e.g. 123"
              className="w-full rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-mono">
              Capture ID
            </label>
            <input
              type="number"
              value={captureId}
              onChange={(e) => setCaptureId(e.target.value)}
              placeholder="e.g. 456"
              className="w-full rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-mono">
              Award ID
            </label>
            <input
              type="number"
              value={awardId}
              onChange={(e) => setAwardId(e.target.value)}
              placeholder="e.g. 789"
              className="w-full rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
            />
          </div>
        </div>

        {linkMut.isError && (
          <p className="text-xs text-gda-red">
            {(linkMut.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={linkMut.isPending || (!oppId && !captureId && !awardId)}
            className="rounded border border-gda-cyan/40 bg-gda-cyan/10 px-4 py-1.5 text-xs font-mono text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
          >
            {linkMut.isPending ? "Linking…" : "Link"}
          </button>
        </div>
      </div>
    </div>
  );
}
