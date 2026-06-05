"use client";

import { useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  useVaultDocuments,
  useVaultCount,
  useVaultDocument,
  useUploadVaultDocument,
  useLinkVaultDocument,
  useDeleteVaultDocument,
} from "@/hooks/use-vault";
import { Pagination } from "@/components/shared/Pagination";
import { PendingState } from "@/components/shared/pending-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { VaultDocument } from "@/lib/types";

/* ── Constants ─────────────────────────────────────────────── */

const DOC_TYPES = [
  "All Types",
  "contract",
  "proposal",
  "invoice",
  "certificate",
  "teaming_agreement",
  "rfp",
  "other",
] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "Contract",
  proposal: "Proposal",
  invoice: "Invoice",
  certificate: "Certificate",
  teaming_agreement: "Teaming Agreement",
  rfp: "RFP",
  other: "Other",
};

function docTypeBadgeClass(dt: string): string {
  switch (dt) {
    case "contract":
    case "rfp":
      return "border-gda-cyan/30 text-gda-cyan bg-gda-cyan/10";
    case "invoice":
      return "border-gda-amber/30 text-gda-amber bg-gda-amber/10";
    case "certificate":
    case "teaming_agreement":
      return "border-gda-green/30 text-gda-green bg-gda-green/10";
    default:
      return "border-border text-muted-foreground";
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

  const [docTypeFilter, setDocTypeFilter] = useState("All Types");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState<number | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useVaultDocuments({
    doc_type: docTypeFilter === "All Types" ? undefined : docTypeFilter,
    q: searchQuery || undefined,
    limit: 50,
    page: currentPage,
  });
  const { data: countData } = useVaultCount();
  const deleteDoc = useDeleteVaultDocument();

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
    (id: number) => {
      if (!confirm("Delete this document?")) return;
      deleteDoc.mutate(id);
    },
    [deleteDoc],
  );

  return (
    <div className="space-y-6" ref={listRef}>
      {/* Header */}
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
        <button
          onClick={() => setShowUploadModal(true)}
          className="rounded border border-gda-green/40 bg-gda-green/10 px-4 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 transition-colors"
        >
          Upload Document
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={docTypeFilter}
          onChange={(e) => {
            setDocTypeFilter(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "All Types" ? t : DOC_TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search filename, summary, tags…"
          value={searchInput}
          onChange={handleSearchChange}
          className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-64"
        />
      </div>

      {/* Error */}
      {error && (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => void refetch()}
        />
      )}

      {/* Table */}
      {isLoading && !items.length ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 bg-gda-panel" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Filename</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Size</th>
                <th className="px-3 py-2 text-left font-medium">Linked To</th>
                <th className="px-3 py-2 text-left font-medium">AI Tags</th>
                <th className="px-3 py-2 text-left font-medium">Uploaded</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-border hover:bg-gda-panel/50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setSelectedDocId(doc.id)}
                      className="text-foreground hover:text-gda-green text-left font-mono text-xs truncate max-w-[200px] block"
                    >
                      {doc.filename}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[11px] font-mono border ${docTypeBadgeClass(doc.doc_type)}`}
                    >
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                    {formatBytes(doc.file_size_bytes)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <LinkedTo doc={doc} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(doc.ai_tags ?? []).slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-gda-panel px-1.5 py-0.5 text-[11px] text-muted-foreground border border-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                    {formatDate(doc.uploaded_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowLinkModal(doc.id)}
                        className="text-[11px] text-gda-cyan hover:text-gda-cyan/80 font-mono"
                      >
                        Link
                      </button>
                      <button
                        onClick={() => setShowAuditModal(doc.id)}
                        className="text-[11px] text-muted-foreground hover:text-foreground font-mono"
                      >
                        Audit
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-[11px] text-gda-red hover:text-gda-red/80 font-mono"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isLoading && (
          <PendingState
            surface="Vault"
            reason="No documents uploaded yet. Use the Upload button to add your first document."
          />
        )
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {/* Detail drawer */}
      {selectedDocId !== null && (
        <VaultDetailDrawer
          docId={selectedDocId}
          onClose={() => setSelectedDocId(null)}
          onLink={(id) => {
            setSelectedDocId(null);
            setShowLinkModal(id);
          }}
        />
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} />
      )}

      {/* Audit modal */}
      {showAuditModal !== null && (
        <AuditModal
          docId={showAuditModal}
          onClose={() => setShowAuditModal(null)}
        />
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

/* ── Detail Drawer ─────────────────────────────────────────── */

function VaultDetailDrawer({
  docId,
  onClose,
  onLink,
}: {
  docId: number;
  onClose: () => void;
  onLink: (id: number) => void;
}) {
  const { data: doc, isLoading } = useVaultDocument(docId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gda-bg-base border-l border-border overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Close */}
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm font-bold text-foreground">
              Document Detail
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-lg"
            >
              ×
            </button>
          </div>

          {isLoading || !doc ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 bg-gda-panel" />
              ))}
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-foreground font-medium">
                    {doc.filename}
                  </span>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-mono border ${docTypeBadgeClass(doc.doc_type)}`}
                  >
                    {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {formatBytes(doc.file_size_bytes)} · Uploaded{" "}
                  {formatTimestamp(doc.uploaded_at)}
                </div>
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

              {/* AI Tags */}
              {doc.ai_tags && doc.ai_tags.length > 0 && (
                <div className="space-y-1">
                  <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    AI Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {doc.ai_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gda-cyan/10 border border-gda-cyan/30 px-2 py-0.5 text-[11px] text-gda-cyan font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Entities */}
              {doc.ai_entities && doc.ai_entities.length > 0 && (
                <div className="space-y-1">
                  <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    AI Entities
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

              {/* Linked Records */}
              <div className="space-y-2">
                <h3 className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Linked Records
                </h3>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Opportunity:</span>
                    {doc.opp_title ? (
                      <Link
                        href={`/opportunities?id=${doc.linked_opportunity_id}`}
                        className="text-gda-green hover:underline"
                      >
                        {doc.opp_title}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">—</span>
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
                    <span className="text-muted-foreground">Capture:</span>
                    {doc.capture_title ? (
                      <Link
                        href={`/capture?opp=${doc.linked_capture_id}`}
                        className="text-gda-green hover:underline"
                      >
                        {doc.capture_title}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">—</span>
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
                    <span className="text-muted-foreground">Award:</span>
                    {doc.award_title ? (
                      <span className="text-foreground">{doc.award_title}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">—</span>
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
                            Detail
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
                            <td className="px-2 py-1 text-muted-foreground truncate max-w-[150px]">
                              {a.detail ?? "—"}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Upload Modal ──────────────────────────────────────────── */

function UploadModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("other");
  const [dragOver, setDragOver] = useState(false);
  const upload = useUploadVaultDocument();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!file) return;
    upload.mutate(
      { file, docType },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }, [file, docType, upload, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gda-bg-base border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Upload Document
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ×
          </button>
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
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-gda-green bg-gda-green/5"
              : "border-border hover:border-gda-cyan/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
          {file ? (
            <div className="space-y-1">
              <p className="text-sm text-foreground font-mono">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Drag and drop a file here or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, XLSX, TXT, CSV — max 20MB
              </p>
            </div>
          )}
        </div>

        {/* Doc type */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-mono">
            Document Type (required)
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
          >
            {DOC_TYPES.filter((t) => t !== "All Types").map((t) => (
              <option key={t} value={t}>
                {DOC_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        {/* Progress / error */}
        {upload.isPending && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-gda-panel overflow-hidden">
              <div className="h-full bg-gda-green animate-pulse w-2/3 rounded-full" />
            </div>
            <p className="text-xs text-muted-foreground">
              Uploading and parsing with AI…
            </p>
          </div>
        )}

        {upload.isError && (
          <p className="text-xs text-gda-red">
            {(upload.error as Error).message}
          </p>
        )}

        {upload.isSuccess && upload.data && (
          <div className="rounded border border-gda-green/30 bg-gda-green/5 p-3 space-y-1">
            <p className="text-xs font-mono text-gda-green font-medium">
              Upload complete
            </p>
            {upload.data.ai_summary && (
              <p className="text-xs text-foreground leading-relaxed">
                {upload.data.ai_summary}
              </p>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || upload.isPending}
            className="rounded border border-gda-green/40 bg-gda-green/10 px-4 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Audit Modal ───────────────────────────────────────────── */

function AuditModal({
  docId,
  onClose,
}: {
  docId: number;
  onClose: () => void;
}) {
  const { data: doc } = useVaultDocument(docId);
  const auditTrail = doc?.audit_trail ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gda-bg-base border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Audit Trail — {doc?.filename ?? "..."}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg"
          >
            ×
          </button>
        </div>

        {auditTrail.length > 0 ? (
          <div className="rounded border border-border overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-gda-panel text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">Action</th>
                  <th className="px-2 py-1.5 text-left font-medium">Actor</th>
                  <th className="px-2 py-1.5 text-left font-medium">Detail</th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditTrail.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-2 py-1.5">
                      <span className="text-[11px] uppercase tracking-wide font-mono text-foreground">
                        {a.action}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {a.actor}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[150px]">
                      {a.detail ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground font-mono whitespace-nowrap">
                      {formatTimestamp(a.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No audit entries yet.</p>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
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
