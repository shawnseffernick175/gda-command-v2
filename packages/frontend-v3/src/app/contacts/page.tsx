"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  useContacts,
  useContactsCount,
  useCreateContact,
  useUpdateContact,
  useEnrichContact,
  useDeleteContact,
} from "@/hooks/use-contacts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import { SourceChip } from "@/components/shared/source-chip";
import type { GovTriContact, ContactCategory } from "@/lib/types";

/* ── Category config ──────────────────────────────────────────── */

const CATEGORY_TABS: { label: string; value: ContactCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Government", value: "government" },
  { label: "Teaming", value: "teaming_partner" },
  { label: "Competitor", value: "competitor" },
  { label: "Industry", value: "industry" },
  { label: "Internal", value: "internal" },
];

const CATEGORY_BADGE_STYLES: Record<ContactCategory, string> = {
  government: "border-gda-cyan/30 bg-gda-cyan/10 text-gda-cyan",
  teaming_partner: "border-gda-green/30 bg-gda-green/10 text-gda-green",
  competitor: "border-gda-amber/30 bg-gda-amber/10 text-gda-amber",
  industry: "border-border bg-muted/10 text-muted-foreground",
  internal: "border-border bg-muted/10 text-muted-foreground",
  other: "border-border bg-muted/10 text-muted-foreground",
};

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  government: "Government",
  teaming_partner: "Teaming",
  competitor: "Competitor",
  industry: "Industry",
  internal: "Internal",
  other: "Other",
};

/* ── Add Contact Modal ────────────────────────────────────────── */

function AddContactModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createMutation = useCreateContact();
  const [form, setForm] = useState({
    name: "",
    title: "",
    contact_category: "government" as ContactCategory,
    agency: "",
    company: "",
    email: "",
    phone: "",
    linkedin_url: "",
    source_label: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    createMutation.mutate(
      {
        name: form.name,
        title: form.title || undefined,
        contact_category: form.contact_category,
        agency: form.agency || undefined,
        company: form.company || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        linkedin_url: form.linkedin_url || undefined,
        source_label: form.source_label || undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          setForm({
            name: "",
            title: "",
            contact_category: "government",
            agency: "",
            company: "",
            email: "",
            phone: "",
            linkedin_url: "",
            source_label: "",
            notes: "",
          });
          onClose();
        },
      },
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded border border-border bg-gda-panel p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Add Contact
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Category *
            </label>
            <select
              value={form.contact_category}
              onChange={(e) =>
                setForm({
                  ...form,
                  contact_category: e.target.value as ContactCategory,
                })
              }
              className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
            >
              <option value="government">Government</option>
              <option value="teaming_partner">Teaming Partner</option>
              <option value="competitor">Competitor</option>
              <option value="industry">Industry</option>
              <option value="internal">Internal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Agency
              </label>
              <input
                type="text"
                value={form.agency}
                onChange={(e) => setForm({ ...form, agency: e.target.value })}
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Company
              </label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={form.linkedin_url}
                onChange={(e) =>
                  setForm({ ...form, linkedin_url: e.target.value })
                }
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Source Label
              </label>
              <input
                type="text"
                value={form.source_label}
                placeholder="e.g. LinkedIn, Referral"
                onChange={(e) =>
                  setForm({ ...form, source_label: e.target.value })
                }
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Notes
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded bg-gda-cyan px-3 py-1.5 text-xs font-medium text-black hover:bg-gda-cyan/80 disabled:opacity-50"
            >
              {createMutation.isPending ? "Saving…" : "Save Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Contact Detail Drawer ────────────────────────────────────── */

function ContactDetailDrawer({
  contact,
  onClose,
}: {
  contact: GovTriContact;
  onClose: () => void;
}) {
  const enrichMutation = useEnrichContact();
  const updateMutation = useUpdateContact();
  const [editNotes, setEditNotes] = useState(contact.notes ?? "");
  const [editScore, setEditScore] = useState(
    contact.relationship_score ?? 5,
  );

  const handleSaveNotes = () => {
    updateMutation.mutate({ id: contact.id, notes: editNotes });
  };

  const handleSaveScore = (val: number) => {
    setEditScore(val);
    updateMutation.mutate({ id: contact.id, relationship_score: val });
  };

  const ai = contact.ai_profile;
  const cat = contact.contact_category;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[480px] overflow-y-auto border-l border-border bg-gda-panel shadow-2xl">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-gda-bg-base hover:text-foreground"
        aria-label="Close panel"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div className="space-y-5 p-6">
        {/* Header */}
        <div>
          <h2 className="font-mono text-base font-bold text-foreground">
            {contact.name ?? "Unknown"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {contact.title ?? "No title"}
          </p>
          <div className="mt-2">
            <Badge
              variant="outline"
              className={`text-[11px] ${CATEGORY_BADGE_STYLES[cat]}`}
            >
              {CATEGORY_LABELS[cat]}
            </Badge>
          </div>
        </div>

        {/* Meta row */}
        <div className="space-y-1 text-xs">
          {(contact.agency ?? contact.company) && (
            <p className="text-muted-foreground">
              <span className="text-foreground">
                {contact.agency ?? contact.company}
              </span>
            </p>
          )}
          {contact.email && (
            <p>
              <a
                href={`mailto:${contact.email}`}
                className="text-gda-cyan hover:underline"
              >
                {contact.email}
              </a>
            </p>
          )}
          {contact.phone && (
            <p className="text-muted-foreground">{contact.phone}</p>
          )}
          {contact.linkedin_url && (
            <p>
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gda-cyan hover:underline"
              >
                LinkedIn ↗
              </a>
            </p>
          )}
        </div>

        <hr className="border-border" />

        {/* Source */}
        <div>
          <SourceChip
            label={contact.source_label ?? "GovTribe"}
            url={contact.source_url}
            kind={contact.is_manual ? "heuristic" : "real"}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Notes
          </label>
          <textarea
            rows={3}
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onBlur={handleSaveNotes}
            className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
          />
        </div>

        {/* Relationship Score */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Relationship Score
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              value={editScore}
              onChange={(e) => handleSaveScore(Number(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono text-xs text-foreground">
              {editScore}/10
            </span>
          </div>
        </div>

        <hr className="border-border" />

        {/* AI Profile */}
        {ai ? (
          <div className="space-y-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              AI Profile
            </h3>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Role Summary</span>
                <p className="text-foreground">{ai.role_summary}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Procurement Influence
                </span>
                <Badge
                  variant="outline"
                  className={`ml-2 text-[11px] ${
                    ai.procurement_influence === "high"
                      ? "border-gda-green/30 text-gda-green"
                      : ai.procurement_influence === "medium"
                        ? "border-gda-amber/30 text-gda-amber"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {ai.procurement_influence}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Decision Authority
                </span>
                <p className="text-foreground">
                  {ai.likely_decision_authority}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Engagement Approach
                </span>
                <p className="text-foreground">{ai.engagement_approach}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Relevance to Envision
                </span>
                <p className="text-foreground">{ai.relevance_to_envision}</p>
              </div>
              <div className="pt-2 text-[11px] text-muted-foreground">
                Model: {ai.model_used} | Generated:{" "}
                {contact.ai_ran_at
                  ? new Date(contact.ai_ran_at).toLocaleDateString()
                  : "—"}
              </div>
            </div>
            <button
              onClick={() => enrichMutation.mutate(contact.id)}
              disabled={enrichMutation.isPending}
              className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {enrichMutation.isPending ? "Re-enriching…" : "Re-enrich"}
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => enrichMutation.mutate(contact.id)}
              disabled={enrichMutation.isPending}
              className="rounded bg-gda-cyan px-3 py-1.5 text-xs font-medium text-black hover:bg-gda-cyan/80 disabled:opacity-50"
            >
              {enrichMutation.isPending
                ? "Running AI Enrichment…"
                : "Run AI Enrichment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */

export default function ContactsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [previousItems, setPreviousItems] = useState<GovTriContact[]>([]);
  const [activeCategory, setActiveCategory] = useState<
    ContactCategory | "all"
  >("all");
  const [selectedContact, setSelectedContact] = useState<GovTriContact | null>(
    null,
  );
  const [addModalOpen, setAddModalOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enrichMutation = useEnrichContact();
  const deleteMutation = useDeleteContact();

  const params = useMemo(
    () => ({
      q: searchQuery || undefined,
      category: activeCategory,
      cursor,
    }),
    [searchQuery, activeCategory, cursor],
  );

  const { data, isLoading, error, refetch } = useContacts(params);
  const { data: countData } = useContactsCount(activeCategory);

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

  const handleCategoryChange = useCallback(
    (cat: ContactCategory | "all") => {
      setActiveCategory(cat);
      setCursor(undefined);
      setPreviousItems([]);
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
          Contacts
        </h1>
        <ErrorState
          message="Failed to load contacts"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-bold text-foreground">
            Contacts
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
        <button
          onClick={() => setAddModalOpen(true)}
          className="rounded bg-gda-cyan px-3 py-1.5 text-xs font-medium text-black hover:bg-gda-cyan/80"
        >
          + Add Contact
        </button>
      </div>

      {isEmpty ? (
        <Card className="border-border bg-gda-panel">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No contacts found — add one manually or wait for the next GovTribe
              ingest (Mon/Thu 6am ET)
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Category tabs + search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleCategoryChange(tab.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeCategory === tab.value
                      ? "bg-gda-cyan text-black"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search name, title, agency, or company…"
              value={searchInput}
              onChange={handleSearchChange}
              className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-72"
            />
          </div>

          {/* Table */}
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Agency / Company
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Rel.</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Last Seen
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && allItems.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 9 }).map((__, j) => (
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
                        {/* Name — click to open drawer */}
                        <td className="px-3 py-2 text-xs">
                          <button
                            onClick={() => setSelectedContact(c)}
                            className="text-gda-cyan hover:underline text-left"
                          >
                            {c.name ?? "—"}
                          </button>
                        </td>
                        {/* Category badge */}
                        <td className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${CATEGORY_BADGE_STYLES[c.contact_category]}`}
                          >
                            {CATEGORY_LABELS[c.contact_category]}
                          </Badge>
                        </td>
                        {/* Title */}
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.title ?? "—"}
                        </td>
                        {/* Agency / Company */}
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.agency ?? c.company ?? "—"}
                        </td>
                        {/* Relationship Score */}
                        <td className="px-3 py-2 text-xs">
                          {c.relationship_score !== null ? (
                            <span className="font-mono text-foreground">
                              {c.relationship_score}/10
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {/* Email */}
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
                        {/* Source */}
                        <td className="px-3 py-2">
                          <SourceChip
                            label={c.source_label ?? "GovTribe"}
                            url={c.source_url}
                            kind={c.is_manual ? "heuristic" : "real"}
                          />
                        </td>
                        {/* Last Seen */}
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {c.last_seen_at
                            ? new Date(c.last_seen_at).toLocaleDateString()
                            : "—"}
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => enrichMutation.mutate(c.id)}
                              disabled={enrichMutation.isPending}
                              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                              title="AI Enrich"
                            >
                              Enrich
                            </button>
                            <button
                              onClick={() => setSelectedContact(c)}
                              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              Edit
                            </button>
                            {c.is_manual && (
                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Delete ${c.name ?? "this contact"}?`,
                                    )
                                  )
                                    deleteMutation.mutate(c.id);
                                }}
                                disabled={deleteMutation.isPending}
                                className="rounded border border-gda-red/30 px-2 py-0.5 text-[11px] text-gda-red hover:bg-gda-red/10 disabled:opacity-50"
                                title="Delete"
                              >
                                Del
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="rounded border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {isLoading ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Contact Detail Drawer */}
      {selectedContact && (
        <ContactDetailDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}

      {/* Add Contact Modal */}
      <AddContactModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </div>
  );
}
