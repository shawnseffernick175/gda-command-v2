import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "./Toast";
import {
  quickCreateOpportunity,
  quickCreateContact,
  quickCreateDiscussionThread,
  quickCreateNote,
} from "../api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  color: string;
}

const ACTIONS: QuickAction[] = [
  { id: "opportunity", icon: "📡", label: "New Opportunity", color: "#3b82f6" },
  { id: "contact", icon: "👤", label: "New Contact", color: "#8b5cf6" },
  { id: "discussion", icon: "💬", label: "New Discussion", color: "#f59e0b" },
  { id: "note", icon: "📝", label: "Quick Note", color: "#22c55e" },
];

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

interface OpportunityForm {
  title: string;
  agency: string;
  department: string;
  status: string;
  value_estimated: string;
}

interface ContactForm {
  first_name: string;
  last_name: string;
  title: string;
  agency: string;
  email: string;
  phone: string;
}

interface DiscussionForm {
  title: string;
  entity_type: string;
  tags: string;
}

interface NoteForm {
  title: string;
  content: string;
  tags: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuickEntry() {
  const [open, setOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const navigate = useNavigate();

  // Opportunity form state
  const [oppForm, setOppForm] = useState<OpportunityForm>({
    title: "", agency: "", department: "", status: "discovery", value_estimated: "",
  });

  // Contact form state
  const [contactForm, setContactForm] = useState<ContactForm>({
    first_name: "", last_name: "", title: "", agency: "", email: "", phone: "",
  });

  // Discussion form state
  const [discForm, setDiscForm] = useState<DiscussionForm>({
    title: "", entity_type: "general", tags: "",
  });

  // Note form state
  const [noteForm, setNoteForm] = useState<NoteForm>({
    title: "", content: "", tags: "",
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!activeForm) setActiveForm(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, activeForm]);

  // Escape key closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activeForm) setActiveForm(null);
        else setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeForm]);

  const resetForms = useCallback(() => {
    setOppForm({ title: "", agency: "", department: "", status: "discovery", value_estimated: "" });
    setContactForm({ first_name: "", last_name: "", title: "", agency: "", email: "", phone: "" });
    setDiscForm({ title: "", entity_type: "general", tags: "" });
    setNoteForm({ title: "", content: "", tags: "" });
  }, []);

  function handleActionClick(id: string) {
    setActiveForm(id);
    setOpen(false);
  }

  async function handleSubmitOpportunity() {
    if (!oppForm.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const env = await quickCreateOpportunity({
        title: oppForm.title.trim(),
        agency: oppForm.agency.trim() || undefined,
        department: oppForm.department.trim() || undefined,
        status: oppForm.status,
        value_estimated: oppForm.value_estimated ? Number(oppForm.value_estimated) : undefined,
      });
      if (env.success) {
        toast.success("Opportunity created");
        setActiveForm(null);
        resetForms();
        navigate("/ops-tracker");
      } else {
        toast.error(env.error?.message ?? "Failed to create opportunity");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitContact() {
    if (!contactForm.first_name.trim() || !contactForm.last_name.trim()) {
      toast.error("First and last name are required"); return;
    }
    setSubmitting(true);
    try {
      const env = await quickCreateContact({
        first_name: contactForm.first_name.trim(),
        last_name: contactForm.last_name.trim(),
        title: contactForm.title.trim() || undefined,
        agency: contactForm.agency.trim() || undefined,
        email: contactForm.email.trim() || undefined,
        phone: contactForm.phone.trim() || undefined,
      });
      if (env.success) {
        toast.success("Contact created");
        setActiveForm(null);
        resetForms();
        navigate("/contacts");
      } else {
        toast.error(env.error?.message ?? "Failed to create contact");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitDiscussion() {
    if (!discForm.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const tags = discForm.tags.split(",").map(t => t.trim()).filter(Boolean);
      const env = await quickCreateDiscussionThread({
        title: discForm.title.trim(),
        entity_type: discForm.entity_type,
        tags,
      });
      if (env.success) {
        toast.success("Discussion thread created");
        setActiveForm(null);
        resetForms();
        navigate("/discussions");
      } else {
        toast.error(env.error?.message ?? "Failed to create discussion");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitNote() {
    if (!noteForm.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const tags = noteForm.tags.split(",").map(t => t.trim()).filter(Boolean);
      const env = await quickCreateNote({
        title: noteForm.title.trim(),
        content: noteForm.content.trim() || undefined,
        tags,
      });
      if (env.success) {
        toast.success("Note added to Knowledge Base");
        setActiveForm(null);
        resetForms();
        navigate("/knowledge");
      } else {
        toast.error(env.error?.message ?? "Failed to create note");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div ref={containerRef}>
      {/* Modal overlay for forms */}
      {activeForm && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            background: "var(--color-surface, #1a1d27)",
            border: "1px solid var(--color-border, #2a2d3a)",
            borderRadius: 12,
            padding: 24,
            width: "90%",
            maxWidth: 480,
            maxHeight: "80vh",
            overflow: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            {/* Form header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text, #e4e4e7)", margin: 0 }}>
                {ACTIONS.find(a => a.id === activeForm)?.icon}{" "}
                {ACTIONS.find(a => a.id === activeForm)?.label}
              </h2>
              <button
                onClick={() => { setActiveForm(null); resetForms(); }}
                style={{
                  background: "transparent", border: "none", color: "var(--color-text-muted, #6b7280)",
                  fontSize: 20, cursor: "pointer", padding: "2px 6px",
                }}
              >&times;</button>
            </div>

            {/* Opportunity form */}
            {activeForm === "opportunity" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label="Title *" value={oppForm.title} onChange={v => setOppForm(p => ({ ...p, title: v }))} placeholder="e.g. DoD IT Modernization" autoFocus />
                <FormField label="Agency" value={oppForm.agency} onChange={v => setOppForm(p => ({ ...p, agency: v }))} placeholder="e.g. Department of Defense" />
                <FormField label="Department" value={oppForm.department} onChange={v => setOppForm(p => ({ ...p, department: v }))} placeholder="e.g. Army" />
                <FormSelect label="Status" value={oppForm.status} onChange={v => setOppForm(p => ({ ...p, status: v }))}
                  options={[
                    { value: "discovery", label: "Discovery" },
                    { value: "qualified", label: "Qualified" },
                    { value: "pipeline", label: "Pipeline" },
                  ]} />
                <FormField label="Estimated Value ($)" value={oppForm.value_estimated} onChange={v => setOppForm(p => ({ ...p, value_estimated: v }))} placeholder="e.g. 5000000" type="number" />
                <FormActions onCancel={() => { setActiveForm(null); resetForms(); }} onSubmit={handleSubmitOpportunity} submitting={submitting} />
              </div>
            )}

            {/* Contact form */}
            {activeForm === "contact" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FormField label="First Name *" value={contactForm.first_name} onChange={v => setContactForm(p => ({ ...p, first_name: v }))} placeholder="John" autoFocus />
                  <FormField label="Last Name *" value={contactForm.last_name} onChange={v => setContactForm(p => ({ ...p, last_name: v }))} placeholder="Smith" />
                </div>
                <FormField label="Title" value={contactForm.title} onChange={v => setContactForm(p => ({ ...p, title: v }))} placeholder="e.g. Program Manager" />
                <FormField label="Agency" value={contactForm.agency} onChange={v => setContactForm(p => ({ ...p, agency: v }))} placeholder="e.g. Department of Defense" />
                <FormField label="Email" value={contactForm.email} onChange={v => setContactForm(p => ({ ...p, email: v }))} placeholder="john.smith@agency.gov" type="email" />
                <FormField label="Phone" value={contactForm.phone} onChange={v => setContactForm(p => ({ ...p, phone: v }))} placeholder="(555) 123-4567" />
                <FormActions onCancel={() => { setActiveForm(null); resetForms(); }} onSubmit={handleSubmitContact} submitting={submitting} />
              </div>
            )}

            {/* Discussion form */}
            {activeForm === "discussion" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label="Thread Title *" value={discForm.title} onChange={v => setDiscForm(p => ({ ...p, title: v }))} placeholder="e.g. Strategy for DoD contract" autoFocus />
                <FormSelect label="Category" value={discForm.entity_type} onChange={v => setDiscForm(p => ({ ...p, entity_type: v }))}
                  options={[
                    { value: "general", label: "General" },
                    { value: "opportunity", label: "Opportunity" },
                    { value: "capture", label: "Capture Plan" },
                    { value: "proposal", label: "Proposal" },
                    { value: "intel", label: "Intel" },
                  ]} />
                <FormField label="Tags" value={discForm.tags} onChange={v => setDiscForm(p => ({ ...p, tags: v }))} placeholder="strategy, review (comma-separated)" />
                <FormActions onCancel={() => { setActiveForm(null); resetForms(); }} onSubmit={handleSubmitDiscussion} submitting={submitting} />
              </div>
            )}

            {/* Note form */}
            {activeForm === "note" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label="Title *" value={noteForm.title} onChange={v => setNoteForm(p => ({ ...p, title: v }))} placeholder="e.g. Meeting notes - Army PEO" autoFocus />
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted, #9ca3af)", marginBottom: 4, display: "block" }}>Content</label>
                  <textarea
                    value={noteForm.content}
                    onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))}
                    placeholder="Enter your notes..."
                    rows={5}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 6,
                      border: "1px solid var(--color-border, #2a2d3a)",
                      background: "var(--color-bg, #12141c)", color: "var(--color-text, #e4e4e7)",
                      fontSize: 13, resize: "vertical", fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <FormField label="Tags" value={noteForm.tags} onChange={v => setNoteForm(p => ({ ...p, tags: v }))} placeholder="meeting, army (comma-separated)" />
                <FormActions onCancel={() => { setActiveForm(null); resetForms(); }} onSubmit={handleSubmitNote} submitting={submitting} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Speed-dial menu */}
      {open && !activeForm && (
        <div style={{
          position: "fixed",
          bottom: 88,
          right: 24,
          zIndex: 9998,
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
        }}>
          {ACTIONS.map((action, i) => (
            <div
              key={action.id}
              onClick={() => handleActionClick(action.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                animation: `quickentry-fadein 0.15s ease ${i * 0.04}s both`,
              }}
            >
              <span style={{
                background: "var(--color-surface, #1a1d27)",
                border: "1px solid var(--color-border, #2a2d3a)",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-text, #e4e4e7)",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}>
                {action.label}
              </span>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: action.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                flexShrink: 0,
              }}>
                {action.icon}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => { setOpen(p => !p); if (activeForm) setActiveForm(null); }}
        aria-label="Quick Entry"
        title="Quick Entry — create new items fast"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(59,130,246,0.4)",
          transition: "transform 0.2s, box-shadow 0.2s",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
        }}
        onMouseEnter={e => {
          (e.target as HTMLButtonElement).style.transform = open ? "rotate(45deg) scale(1.1)" : "scale(1.1)";
          (e.target as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(59,130,246,0.5)";
        }}
        onMouseLeave={e => {
          (e.target as HTMLButtonElement).style.transform = open ? "rotate(45deg)" : "rotate(0deg)";
          (e.target as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(59,130,246,0.4)";
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Animation keyframes */}
      <style>{`
        @keyframes quickentry-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form primitives
// ---------------------------------------------------------------------------

function FormField({
  label, value, onChange, placeholder, type = "text", autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted, #9ca3af)", marginBottom: 4, display: "block" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 6,
          border: "1px solid var(--color-border, #2a2d3a)",
          background: "var(--color-bg, #12141c)", color: "var(--color-text, #e4e4e7)",
          fontSize: 13, boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function FormSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted, #9ca3af)", marginBottom: 4, display: "block" }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 6,
          border: "1px solid var(--color-border, #2a2d3a)",
          background: "var(--color-bg, #12141c)", color: "var(--color-text, #e4e4e7)",
          fontSize: 13, boxSizing: "border-box",
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FormActions({
  onCancel, onSubmit, submitting,
}: {
  onCancel: () => void; onSubmit: () => void; submitting: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
      <button onClick={onCancel} disabled={submitting} style={{
        padding: "8px 16px", borderRadius: 6, border: "1px solid var(--color-border, #2a2d3a)",
        background: "transparent", color: "var(--color-text-muted, #9ca3af)", fontSize: 13,
        fontWeight: 600, cursor: "pointer",
      }}>
        Cancel
      </button>
      <button onClick={onSubmit} disabled={submitting} style={{
        padding: "8px 16px", borderRadius: 6, border: "none",
        background: submitting ? "#6b7280" : "#3b82f6", color: "#fff", fontSize: 13,
        fontWeight: 600, cursor: submitting ? "wait" : "pointer",
        opacity: submitting ? 0.7 : 1,
      }}>
        {submitting ? "Creating..." : "Create"}
      </button>
    </div>
  );
}
