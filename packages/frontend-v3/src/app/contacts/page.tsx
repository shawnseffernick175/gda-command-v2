"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  useContacts,
  useContactsCount,
  useCreateContact,
  useUpdateContact,
  useEnrichContact,
  useDeleteContact,
  useLogContact,
  useLinkContact,
  useSearchLinkable,
} from "@/hooks/use-contacts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/error-state";
import type {
  GovTriContact,
  ContactCategory,
  RelationshipTemp,
  ContactsMeta,
} from "@/lib/types";

/* ── Helpers ──────────────────────────────────────────────────── */

function inferTemperature(c: GovTriContact): RelationshipTemp {
  if (c.relationship_temp && c.relationship_temp !== "unknown") return c.relationship_temp;
  if (!c.last_contacted_at) return "unknown";
  const days = Math.floor(
    (Date.now() - new Date(c.last_contacted_at).getTime()) / 86_400_000,
  );
  const hasLinked =
    (c.linked_opportunities?.length ?? 0) > 0 ||
    (c.linked_captures?.length ?? 0) > 0;
  if (days < 30 && hasLinked) return "hot";
  if (days < 90) return "warm";
  return "cold";
}

const TEMP_DOT: Record<RelationshipTemp, string> = {
  hot: "bg-gda-green",
  warm: "bg-gda-cyan",
  cold: "bg-gda-amber",
  unknown: "bg-gda-red/10",
};

const TEMP_LABEL: Record<RelationshipTemp, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  unknown: "Unknown",
};

function relativeDate(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: "Never", cls: "text-gda-red" };
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (days < 1) return { text: "Today", cls: "text-gda-green" };
  if (days < 7) return { text: `${days}d ago`, cls: "text-gda-green" };
  if (days < 30) return { text: `${days}d ago`, cls: "text-foreground" };
  if (days < 90) {
    const mo = Math.floor(days / 30);
    return { text: `${mo}mo ago`, cls: "text-muted-foreground" };
  }
  const mo = Math.floor(days / 30);
  return { text: `${mo}mo ago`, cls: "text-gda-amber" };
}

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
              <label className="mb-1 block text-[11px] text-muted-foreground">Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Category *</label>
            <select value={form.contact_category} onChange={(e) => setForm({ ...form, contact_category: e.target.value as ContactCategory })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50">
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
              <label className="mb-1 block text-[11px] text-muted-foreground">Agency</label>
              <input type="text" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Company</label>
              <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">LinkedIn URL</label>
              <input type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Source Label</label>
              <input type="text" value={form.source_label} placeholder="e.g. LinkedIn, Referral" onChange={(e) => setForm({ ...form, source_label: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="rounded bg-gda-cyan px-3 py-1.5 text-xs font-medium text-black hover:bg-gda-cyan/80 disabled:opacity-50">
              {createMutation.isPending ? "Saving\u2026" : "Save Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Link Opportunity Modal ───────────────────────────────────── */

function LinkOpportunityModal({
  contactId,
  onClose,
}: {
  contactId: number;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useSearchLinkable(q);
  const linkMutation = useLinkContact();

  const handleLink = (type: "opportunity" | "capture", id: number) => {
    linkMutation.mutate(
      type === "opportunity"
        ? { id: contactId, opportunity_id: id }
        : { id: contactId, capture_id: id },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded border border-border bg-gda-panel p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Link Opportunity / Capture
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <input
          type="text"
          placeholder="Search opportunities or captures\u2026"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-3 w-full rounded border border-border bg-gda-bg-base px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
          autoFocus
        />
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {data?.opportunities?.map((o) => (
            <button
              key={`opp-${o.id}`}
              onClick={() => handleLink("opportunity", o.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-gda-bg-base"
            >
              <span className="text-foreground">{o.title}</span>
              <span className="text-muted-foreground">{o.stage ?? "Opportunity"}</span>
            </button>
          ))}
          {data?.captures?.map((c) => (
            <button
              key={`cap-${c.id}`}
              onClick={() => handleLink("capture", c.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-gda-bg-base"
            >
              <span className="text-foreground">{c.title}</span>
              <span className="text-muted-foreground">Capture</span>
            </button>
          ))}
          {q && !data?.opportunities?.length && !data?.captures?.length && (
            <p className="py-4 text-center text-xs text-muted-foreground">No results</p>
          )}
          {!q && (
            <p className="py-4 text-center text-xs text-muted-foreground">Type to search</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Contact Inline Expand ────────────────────────────────────── */

function ContactExpandRow({
  contact,
  onClose,
}: {
  contact: GovTriContact;
  onClose: () => void;
}) {
  const enrichMutation = useEnrichContact();
  const updateMutation = useUpdateContact();
  const logMutation = useLogContact();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editNotes, setEditNotes] = useState(contact.contact_notes ?? contact.notes ?? "");
  const temp = inferTemperature(contact);

  const handleTempChange = (val: RelationshipTemp) => {
    updateMutation.mutate({ id: contact.id, relationship_temp: val });
  };

  const handleLogContact = () => {
    logMutation.mutate(contact.id);
  };

  const handleSaveNotes = () => {
    updateMutation.mutate({ id: contact.id, contact_notes: editNotes });
  };

  const ai = contact.ai_profile;

  return (
    <tr>
      <td colSpan={8} className="border-b border-border bg-gda-panel/50 px-4 py-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-mono text-sm font-bold text-foreground">
                {contact.name ?? "Unknown"} — {contact.title ?? "No title"}, {contact.agency ?? contact.company ?? ""}
              </h3>
              <div className="mt-1 flex items-center gap-3 text-xs">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="text-gda-cyan hover:underline">{contact.email}</a>
                )}
                {contact.phone && (
                  <span className="text-muted-foreground">{contact.phone}</span>
                )}
                {contact.linkedin_url && (
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-gda-cyan hover:underline">
                    LinkedIn &#8599;
                  </a>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Relationship */}
          <div>
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Relationship
            </h4>
            <div className="mt-1 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Temperature:</span>
                <select
                  value={temp}
                  onChange={(e) => handleTempChange(e.target.value as RelationshipTemp)}
                  className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                  <option value="unknown">Unknown</option>
                </select>
                <span className={`inline-block h-2 w-2 rounded-full ${TEMP_DOT[temp]}`} />
              </div>
              <span className="text-muted-foreground">
                Last contacted: {contact.last_contacted_at ? new Date(contact.last_contacted_at).toLocaleDateString() : "Never"}
              </span>
            </div>
            <div className="mt-2">
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Notes\u2026"
                className="w-full rounded border border-border bg-gda-bg-base px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gda-cyan/50"
              />
            </div>
          </div>

          {/* Linked Pursuits */}
          <div>
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Linked Pursuits
            </h4>
            <div className="mt-1 space-y-1">
              {(contact.linked_opportunities ?? []).map((o) => (
                <a
                  key={`opp-${o.id}`}
                  href={`/opportunities/${o.id}`}
                  className="block text-xs text-gda-cyan hover:underline"
                >
                  &#8594; {o.title} &#8212; {o.stage ?? "Opportunity"}
                </a>
              ))}
              {(contact.linked_captures ?? []).map((c) => (
                <a
                  key={`cap-${c.id}`}
                  href={`/captures/${c.id}`}
                  className="block text-xs text-gda-cyan hover:underline"
                >
                  &#8594; {c.title} &#8212; Capture
                </a>
              ))}
              {!(contact.linked_opportunities?.length) && !(contact.linked_captures?.length) && (
                <p className="text-xs text-muted-foreground">No linked pursuits</p>
              )}
            </div>
          </div>

          {/* AI Enrichment */}
          {ai ? (
            <div>
              <h4 className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                AI Enrichment
              </h4>
              <div className="mt-1 space-y-1 text-xs text-foreground">
                <p>{ai.role_summary}</p>
                <p className="text-muted-foreground">
                  Procurement influence: {ai.procurement_influence} | Decision authority: {ai.likely_decision_authority}
                </p>
                <p className="text-muted-foreground">{ai.engagement_approach}</p>
              </div>
            </div>
          ) : (
            <div>
              <button
                onClick={() => enrichMutation.mutate(contact.id)}
                disabled={enrichMutation.isPending}
                className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {enrichMutation.isPending ? "Enriching\u2026" : "Enrich with AI"}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <button
              onClick={onClose}
              className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
            <button
              onClick={() => setShowLinkModal(true)}
              className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              + Link Opportunity
            </button>
            <button
              onClick={handleLogContact}
              disabled={logMutation.isPending}
              className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {logMutation.isPending ? "Logging\u2026" : logMutation.isSuccess ? "Logged" : "Log Contact"}
            </button>
          </div>
        </div>

        {showLinkModal && (
          <LinkOpportunityModal
            contactId={contact.id}
            onClose={() => setShowLinkModal(false)}
          />
        )}
      </td>
    </tr>
  );
}

/* ── By Agency View ───────────────────────────────────────────── */

function ByAgencyView({
  items,
  expandedId,
  onToggleExpand,
}: {
  items: GovTriContact[];
  expandedId: number | null;
  onToggleExpand: (id: number) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, GovTriContact[]>();
    for (const c of items) {
      const key = c.agency ?? c.company ?? "Unknown Agency";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <div className="space-y-4">
      {grouped.map(([agency, contacts]) => (
        <div key={agency}>
          <div className="border-b border-border py-1">
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {agency} ({contacts.length} contact{contacts.length !== 1 ? "s" : ""})
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {contacts.map((c) => {
                const temp = inferTemperature(c);
                const touch = relativeDate(c.last_contacted_at);
                const isExpanded = expandedId === c.id;
                return [
                  <tr
                    key={c.id}
                    className="border-b border-border hover:bg-gda-panel/50 transition-colors cursor-pointer"
                    onClick={() => onToggleExpand(c.id)}
                  >
                    <td className="w-[30px] px-2 py-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${TEMP_DOT[temp]}`}
                        title={TEMP_LABEL[temp]}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <button className="text-gda-cyan hover:underline text-left">
                        {c.name ?? "\u2014"}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {c.title ?? "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="text-gda-cyan hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">\u2014</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <LinkedChips contact={c} />
                    </td>
                    <td className={`px-2 py-2 text-xs ${touch.cls}`}>
                      {touch.text}
                    </td>
                  </tr>,
                  isExpanded && (
                    <ContactExpandRow
                      key={`expand-${c.id}`}
                      contact={c}
                      onClose={() => onToggleExpand(c.id)}
                    />
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ── Linked Chips ─────────────────────────────────────────────── */

function LinkedChips({ contact }: { contact: GovTriContact }) {
  const opps = contact.linked_opportunities ?? [];
  const caps = contact.linked_captures ?? [];
  if (opps.length === 0 && caps.length === 0) {
    return <span className="text-muted-foreground">\u2014</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {opps.map((o) => (
        <a
          key={`opp-${o.id}`}
          href={`/opportunities/${o.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center rounded bg-gda-cyan/10 px-1.5 py-0.5 text-[11px] text-gda-cyan hover:bg-gda-cyan/20"
        >
          {o.title.length > 20 ? o.title.slice(0, 20) + "\u2026" : o.title} &#8599;
        </a>
      ))}
      {caps.map((c) => (
        <a
          key={`cap-${c.id}`}
          href={`/captures/${c.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center rounded bg-gda-green/10 px-1.5 py-0.5 text-[11px] text-gda-green hover:bg-gda-green/20"
        >
          {c.title.length > 20 ? c.title.slice(0, 20) + "\u2026" : c.title} &#8599;
        </a>
      ))}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */

export default function ContactsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [previousItems, setPreviousItems] = useState<GovTriContact[]>([]);
  const [activeCategory, setActiveCategory] = useState<ContactCategory | "all">("all");
  const [activeTemp, setActiveTemp] = useState<RelationshipTemp | "all">("all");
  const [activeLinked, setActiveLinked] = useState<"yes" | "no" | "">("");
  const [activeSource, setActiveSource] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "agency">("list");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deleteMutation = useDeleteContact();

  const params = useMemo(
    () => ({
      q: searchQuery || undefined,
      category: activeCategory,
      temperature: activeTemp !== "all" ? activeTemp : undefined,
      linked: activeLinked || undefined,
      source: activeSource || undefined,
      cursor,
    }),
    [searchQuery, activeCategory, activeTemp, activeLinked, activeSource, cursor],
  );

  const { data, isLoading, error, refetch } = useContacts(params);
  const { data: countData } = useContactsCount(activeCategory);

  const meta: ContactsMeta = data?.meta ?? {
    total_count: 0,
    warm_no_touch: 0,
    linked_to_pursuits: 0,
    agency_count: 0,
  };

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

  const handleClearFilters = useCallback(() => {
    setActiveCategory("all");
    setActiveTemp("all");
    setActiveLinked("");
    setActiveSource("");
    setSearchInput("");
    setSearchQuery("");
    setCursor(undefined);
    setPreviousItems([]);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (data?.pagination?.cursor) {
      setPreviousItems((prev) => [...prev, ...(data?.items ?? [])]);
      setCursor(data.pagination.cursor);
    }
  }, [data]);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const hasMore = data?.pagination?.hasMore ?? false;
  const totalCount = countData?.count ?? meta.total_count;
  const isEmpty = !isLoading && !error && totalCount === 0;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg font-bold text-foreground">Contacts</h1>
        <ErrorState message="Failed to load contacts" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intelligence Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="border-gda-cyan/30 text-gda-cyan font-mono text-[11px]">
          {meta.total_count.toLocaleString()} Total Contacts
        </Badge>
        {meta.warm_no_touch > 0 && (
          <Badge variant="outline" className="border-gda-red/30 text-gda-red font-mono text-[11px]">
            {meta.warm_no_touch} Warm — No Recent Touch
          </Badge>
        )}
        <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[11px]">
          {meta.linked_to_pursuits} Linked to Active Pursuits
        </Badge>
        <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[11px]">
          {meta.agency_count} Agencies
        </Badge>
        <button
          onClick={() => setAddModalOpen(true)}
          className="ml-auto rounded bg-gda-cyan px-3 py-1.5 text-xs font-medium text-black hover:bg-gda-cyan/80"
        >
          + Add Contact
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search name, email, agency\u2026"
            value={searchInput}
            onChange={handleSearchChange}
            className="rounded border border-border bg-gda-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-cyan/50 w-60"
          />
          <select
            value={activeCategory}
            onChange={(e) => {
              setActiveCategory(e.target.value as ContactCategory | "all");
              setCursor(undefined);
              setPreviousItems([]);
            }}
            className="rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="government">Government</option>
            <option value="teaming_partner">Teaming</option>
            <option value="competitor">Competitor</option>
            <option value="industry">Industry</option>
            <option value="internal">Internal</option>
          </select>
          <select
            value={activeTemp}
            onChange={(e) => {
              setActiveTemp(e.target.value as RelationshipTemp | "all");
              setCursor(undefined);
              setPreviousItems([]);
            }}
            className="rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="all">Temperature</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            value={activeLinked}
            onChange={(e) => {
              setActiveLinked(e.target.value as "yes" | "no" | "");
              setCursor(undefined);
              setPreviousItems([]);
            }}
            className="rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="">Linked</option>
            <option value="yes">Linked to Pursuit</option>
            <option value="no">No Pursuits</option>
          </select>
          <select
            value={activeSource}
            onChange={(e) => {
              setActiveSource(e.target.value);
              setCursor(undefined);
              setPreviousItems([]);
            }}
            className="rounded border border-border bg-gda-panel px-2 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="">Source</option>
            <option value="GovTribe">GovTribe</option>
            <option value="GovWin">GovWin</option>
            <option value="Manual">Manual</option>
            <option value="Imported">Imported</option>
          </select>
          {(activeCategory !== "all" || activeTemp !== "all" || activeLinked || activeSource || searchQuery) && (
            <button
              onClick={handleClearFilters}
              className="rounded border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("list")}
            className={`rounded px-2 py-1 text-xs ${
              viewMode === "list"
                ? "bg-gda-cyan text-black"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            &#8801; List
          </button>
          <button
            onClick={() => setViewMode("agency")}
            className={`rounded px-2 py-1 text-xs ${
              viewMode === "agency"
                ? "bg-gda-cyan text-black"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            &#127970; By Agency
          </button>
        </div>
      </div>

      {isEmpty ? (
        <Card className="border-border bg-gda-panel">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No contacts found — add one manually or wait for the next GovTribe ingest (Mon/Thu 6am ET)
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "agency" ? (
        <ByAgencyView
          items={allItems}
          expandedId={expandedId}
          onToggleExpand={handleToggleExpand}
        />
      ) : (
        <>
          {/* List Table */}
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="w-[30px] px-2 py-2 text-left font-medium" />
                  <th className="w-[160px] px-3 py-2 text-left font-medium">Name</th>
                  <th className="w-[140px] px-3 py-2 text-left font-medium">Title / Role</th>
                  <th className="w-[140px] px-3 py-2 text-left font-medium">Agency</th>
                  <th className="w-[120px] px-3 py-2 text-left font-medium">Contact</th>
                  <th className="px-3 py-2 text-left font-medium">Linked To</th>
                  <th className="w-[80px] px-3 py-2 text-left font-medium">Last Touch</th>
                  <th className="w-[60px] px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && allItems.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-3 py-2">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : allItems.map((c) => {
                      const temp = inferTemperature(c);
                      const touch = relativeDate(c.last_contacted_at);
                      const isExpanded = expandedId === c.id;
                      return [
                        <tr
                          key={c.id}
                          className="border-b border-border hover:bg-gda-panel/50 transition-colors cursor-pointer"
                          onClick={() => handleToggleExpand(c.id)}
                        >
                          {/* Temperature dot */}
                          <td className="w-[30px] px-2 py-2">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${TEMP_DOT[temp]}`}
                              title={TEMP_LABEL[temp]}
                            />
                          </td>
                          {/* Name */}
                          <td className="px-3 py-2 text-xs">
                            <button className="text-gda-cyan hover:underline text-left">
                              {c.name ?? "\u2014"}
                            </button>
                          </td>
                          {/* Title / Role */}
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {c.title ?? "\u2014"}
                          </td>
                          {/* Agency */}
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {c.agency ?? c.company ?? "\u2014"}
                          </td>
                          {/* Contact (email/phone) */}
                          <td className="px-3 py-2 text-xs">
                            {c.email ? (
                              <a
                                href={`mailto:${c.email}`}
                                className="text-gda-cyan hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {c.email}
                              </a>
                            ) : c.phone ? (
                              <span className="text-muted-foreground">{c.phone}</span>
                            ) : (
                              <span className="text-muted-foreground">\u2014</span>
                            )}
                          </td>
                          {/* Linked To */}
                          <td className="px-3 py-2 text-xs">
                            <LinkedChips contact={c} />
                          </td>
                          {/* Last Touch */}
                          <td className={`px-3 py-2 text-xs ${touch.cls}`}>
                            {touch.text}
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleExpand(c.id);
                                }}
                                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                Edit
                              </button>
                              {c.is_manual && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete ${c.name ?? "this contact"}?`))
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
                        </tr>,
                        isExpanded && (
                          <ContactExpandRow
                            key={`expand-${c.id}`}
                            contact={c}
                            onClose={() => handleToggleExpand(c.id)}
                          />
                        ),
                      ];
                    })}
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
                {isLoading ? "Loading\u2026" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Add Contact Modal */}
      <AddContactModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </div>
  );
}
