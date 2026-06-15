"use client";

import { useState } from "react";
import { useSentinel } from "@/hooks/use-sentinel";
import { useSystemHealth, type SystemHealth } from "@/hooks/use-system-health";
import {
  useDoctrinePrinciples,
  useDoctrineConfig,
  useUpdateDoctrineConfig,
} from "@/hooks/use-doctrine";
import { Badge } from "@/components/ui/badge";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";
import type { DoctrineConfigRow } from "@/hooks/use-doctrine";
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeactivateAdminUser,
} from "@/hooks/use-admin-users";
import { IngestPipelineSection } from "@/components/settings/ingest-pipeline";
import {
  useUserSettings,
  useUpdateUserSettings,
} from "@/hooks/use-user-settings";
import { useMatchSuggestions } from "@/hooks/use-approvals";
import { MatchApprovals } from "@/components/settings/MatchApprovals";

/* ── Config key editor ──────────────────────────────────────────── */
function ConfigKeyRow({ row }: { row: DoctrineConfigRow }) {
  const update = useUpdateDoctrineConfig();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(JSON.stringify(row.value));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    try {
      const parsed = JSON.parse(draft);
      setError(null);
      update.mutate(
        { key: row.key, value: parsed },
        {
          onSuccess: () => setEditing(false),
          onError: () => setError("Save failed"),
        }
      );
    } catch {
      setError("Invalid JSON");
    }
  }

  const displayValue =
    typeof row.value === "object"
      ? JSON.stringify(row.value)
      : String(row.value);

  return (
    <div className="rounded border border-border bg-gda-bg-base px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">{row.key}</span>
        <button
          type="button"
          onClick={() => {
            setDraft(JSON.stringify(row.value, null, 2));
            setEditing((v) => !v);
            setError(null);
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {row.description && (
        <p className="text-[11px] text-muted-foreground">{row.description}</p>
      )}
      {editing ? (
        <div className="space-y-1.5 pt-1">
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded border border-border bg-gda-panel px-2 py-1 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={update.isPending}
              className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[11px] font-mono text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="font-mono text-[11px] text-muted-foreground truncate">{displayValue}</p>
      )}
      <p className="text-[11px] text-muted-foreground/50">
        Updated {new Date(row.updated_at).toLocaleString()}
      </p>
    </div>
  );
}

/* ── System Health Section ─────────────────────────────────────── */
function SystemHealthSection({ sysHealth }: {
  sysHealth: SystemHealth | undefined;
}) {
  const INFRA = [
    { key: "backend_api",   label: "API" },
    { key: "database",      label: "DB" },
    { key: "agent_service", label: "Agent" },
    { key: "mcp_server",    label: "MCP" },
  ] as const;

  return (
    <div className="space-y-3">
      {/* Compact infra status bar */}
      <div className="flex items-center gap-4 px-1">
        {INFRA.map((svc) => {
          const s = sysHealth?.[svc.key as keyof typeof sysHealth];
          const up = s === "up";
          const checking = s === undefined;
          return (
            <div key={svc.key} className="flex items-center gap-1.5">
              <span className={cn(
                "h-2 w-2 rounded-full shrink-0",
                checking ? "bg-muted-foreground animate-pulse" : up ? "bg-gda-green" : "bg-gda-red"
              )} />
              <span className="font-mono text-[11px] text-muted-foreground">{svc.label}</span>
            </div>
          );
        })}
      </div>
      {/* Ingest pipeline table */}
      <IngestPipelineSection />
    </div>
  );
}

/* ── Integrations Section ──────────────────────────────────────── */
const DOCS_URLS: Record<string, string> = {
  "sam.gov": "https://open.sam.gov",
  "usaspending.gov": "https://api.usaspending.gov",
  "govtribe": "https://api.govtribe.com",
  "govtribe.contacts": "https://api.govtribe.com",
  "govtribe.vehicles": "https://api.govtribe.com",
  "govtribe.budget": "https://api.govtribe.com",
  "govwin": "https://iq.govwin.com",
  "federalregister.gov": "https://www.federalregister.gov/developers",
  "sbir": "https://www.dodsbirsttr.mil/submissions/api-docs",
  "nsf": "https://www.research.gov/common/webapi/awardapisearch-v1.htm",
  "dod_rss": "https://www.defense.gov/News/Contracts",
  "nih": "https://api.reporter.nih.gov",
  "arxiv": "https://arxiv.org/help/api",
  "dibbs": "https://www.dibbs.bsm.dla.mil",
  "neco": "https://www.neco.navy.mil",
  "grants.gov": "https://www.grants.gov/web/grants/s2s/grantor/apis.html",
};

const GOVTRIBE_CHILDREN = ["govtribe.contacts", "govtribe.vehicles", "govtribe.budget"];

// Retained for future re-wiring of the integrations settings panel; not currently rendered.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function IntegrationsSection({ sentinel }: { sentinel: ReturnType<typeof useSentinel>["data"] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [govtribeOpen, setGovtribeOpen] = useState(false);

  const sources = sentinel?.sources ?? [];
  const topLevel = sources.filter((s) => !GOVTRIBE_CHILDREN.includes(s.source_key));

  function getStatusLabel(status: string) {
    if (status === "healthy") return "Connected";
    if (status === "stale") return "Stale";
    if (status === "error") return "Error";
    return "Unknown";
  }

  function getDotColor(status: string) {
    if (status === "healthy") return "bg-gda-green";
    if (status === "stale") return "bg-gda-amber";
    if (status === "error") return "bg-gda-red";
    return "bg-muted-foreground";
  }

  function SourceRow({ s, indent = false }: { s: typeof sources[0]; indent?: boolean }) {
    const isExpanded = expanded === s.source_key;
    const isGovTribeParent = s.source_key === "govtribe";
    const isGovTribeFamily = s.source_key === "govtribe" || s.source_key.startsWith("govtribe.");
    const credits = isGovTribeFamily ? sentinel?.govtribe_credits : undefined;
    const lastRun = s.last_success_at ? timeAgo(new Date(s.last_success_at)) : "Never";

    return (
      <div className={indent ? "ml-4" : ""}>
        <button
          type="button"
          onClick={() => {
            if (isGovTribeParent) setGovtribeOpen((v) => !v);
            setExpanded(isExpanded ? null : s.source_key);
          }}
          className="flex w-full items-center gap-3 rounded border border-border bg-gda-bg-base px-4 py-2.5 text-left hover:bg-gda-panel/50 transition-colors cursor-pointer"
        >
          <span className={cn("h-2 w-2 rounded-full shrink-0", getDotColor(s.status))} />
          <span className="text-sm font-medium text-foreground flex-1">{s.label}</span>
          <span className="text-xs text-muted-foreground font-mono">{getStatusLabel(s.status)}</span>
          {isGovTribeFamily && credits ? (
            <span className="text-xs text-muted-foreground font-mono">
              {credits.credits_used}/{credits.credits_budget} credits
            </span>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">Last sync: {lastRun}</span>
          )}
          <span className={cn("text-xs text-muted-foreground transition-transform", isExpanded && "rotate-90")}>▸</span>
        </button>

        {isExpanded && (
          <div className="ml-5 mt-1 rounded border border-border bg-gda-panel px-4 py-2 text-xs text-muted-foreground space-y-1">
            <p>Status: <span className="text-foreground font-mono">{s.status}</span></p>
            <p>Last success: <span className="text-foreground font-mono">{s.last_success_at ? new Date(s.last_success_at).toLocaleString() : "Never"}</span></p>
            {s.message && <p>Message: <span className="text-foreground">{s.message}</span></p>}
            {isGovTribeFamily && credits && (
              <div className="space-y-1">
                <p>Credits: <span className="text-foreground font-mono">{credits.credits_used} / {credits.credits_budget}</span></p>
                <div className="h-1.5 w-full rounded-full bg-gda-bg-base overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", credits.pct > 80 ? "bg-gda-red" : credits.pct > 60 ? "bg-gda-amber" : "bg-gda-green")}
                    style={{ width: `${Math.min(credits.pct, 100)}%` }}
                  />
                </div>
              </div>
            )}
            {DOCS_URLS[s.source_key] && (
              <a href={DOCS_URLS[s.source_key]} target="_blank" rel="noopener noreferrer"
                className="inline-block text-gda-cyan hover:underline mt-1">
                Docs ↗
              </a>
            )}
          </div>
        )}

        {isGovTribeParent && govtribeOpen && (
          <div className="mt-1 space-y-1">
            {sources
              .filter((c) => GOVTRIBE_CHILDREN.includes(c.source_key))
              .map((child) => (
                <SourceRow key={child.source_key} s={child} indent />
              ))}
          </div>
        )}
      </div>
    );
  }

  if (!sentinel) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-mono">{sources.length} sources monitored</p>
      {topLevel.map((s) => (
        <SourceRow key={s.source_key} s={s} />
      ))}
    </div>
  );
}

/* ── User Management Panel ─────────────────────────────────────── */
const ROLES = ["admin", "operator", "viewer"] as const;
const EMPTY_USER = { email: "", display_name: "", role: "operator", password: "" };

function UserManagementPanel() {
  const { data, isLoading } = useAdminUsers();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deactivate = useDeactivateAdminUser();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_USER });
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const users = data?.items ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await createUser.mutateAsync({
        email: form.email.trim(),
        display_name: form.display_name.trim(),
        role: form.role,
        password: form.password.trim() || undefined,
      });
      if ((result as { _temp_password?: string })._temp_password) {
        setTempPassword((result as { _temp_password?: string })._temp_password ?? null);
      }
      setForm({ ...EMPTY_USER });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  function roleBadgeClass(role: string) {
    switch (role) {
      case "admin": return "border-red-500/30 text-red-400";
      case "operator": return "border-gda-green/30 text-gda-green";
      default: return "border-border text-muted-foreground";
    }
  }

  return (
    <div className="space-y-4">
      {tempPassword && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2">
          <p className="text-xs text-amber-400 font-mono">
            Temp password for new user: <strong>{tempPassword}</strong>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Share securely — only shown once.
          </p>
          <button
            type="button"
            onClick={() => setTempPassword(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {users.length} {users.length === 1 ? "user" : "users"}
        </p>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setForm({ ...EMPTY_USER }); }}
          className={cn(
            "rounded border px-3 py-1 text-xs font-mono font-medium transition-colors",
            showForm
              ? "border-border text-muted-foreground"
              : "border-gda-green bg-gda-green/10 text-gda-green hover:bg-gda-green/20"
          )}
        >
          {showForm ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded border border-border bg-gda-bg-base p-3 space-y-2.5">
          <p className="font-mono text-xs font-semibold text-foreground">New User</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Display Name *</label>
              <input
                required
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Password (leave blank to auto-generate)</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded border border-border bg-gda-panel px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                placeholder="Auto-generate if blank"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-mono text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create User"}
          </button>
        </form>
      )}

      {/* User table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">User</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Last Login</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  <td colSpan={5} className="px-3 py-2">
                    <div className="h-3 bg-gda-panel rounded w-2/3" />
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-gda-panel/50">
                  <td className="px-3 py-2">
                    <p className="text-xs font-medium text-foreground">{u.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        updateUser.mutate({ id: u.id, role: e.target.value })
                      }
                      className={cn(
                        "rounded border bg-transparent px-1.5 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-gda-green/50",
                        roleBadgeClass(u.role)
                      )}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <Badge
                      variant={u.is_active ? "outline" : "secondary"}
                      className={cn("text-[11px]", u.is_active ? "text-gda-green border-gda-green/30" : "text-muted-foreground")}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-left text-[11px] text-muted-foreground">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-3 py-2 text-left">
                    {u.is_active ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Deactivate ${u.email}?`)) {
                            deactivate.mutate(u.id);
                          }
                        }}
                        className="text-[11px] text-red-400 hover:text-red-300"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateUser.mutate({ id: u.id, is_active: true })}
                        className="text-[11px] text-gda-green hover:text-gda-green/80"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Time ago helper ───────────────────────────────────────────── */
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ── Notifications Panel ───────────────────────────────────────── */
function NotificationsPanel() {
  const { data: settings, isLoading } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [emailDraft, setEmailDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [saved, setSaved] = useState(false);

  const autoDelivery = settings?.briefing_auto_delivery ?? false;
  const deliveryEmail = settings?.briefing_delivery_email ?? "";

  function handleToggle() {
    const next = !autoDelivery;
    updateSettings.mutate(
      { briefing_auto_delivery: next },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } },
    );
  }

  function handleSaveEmail() {
    const trimmed = emailDraft.trim();
    if (!trimmed) return;
    updateSettings.mutate(
      { briefing_delivery_email: trimmed },
      {
        onSuccess: () => {
          setEditingEmail(false);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-8 animate-pulse rounded bg-gda-bg-base" />
        <div className="h-8 animate-pulse rounded bg-gda-bg-base" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Daily Brief Auto-Delivery
      </p>

      <div className="rounded border border-border bg-gda-bg-base px-4 py-3 space-y-3">
        {/* Toggle row */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              Scheduled delivery
            </p>
            <p className="text-[11px] text-muted-foreground">
              Generate and email the daily brief at 6:00 AM ET on weekdays
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={updateSettings.isPending}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gda-green/50 disabled:opacity-50",
              autoDelivery ? "bg-gda-green" : "bg-muted",
            )}
            role="switch"
            aria-checked={autoDelivery}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                autoDelivery ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </div>

        {/* Email row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground">Email:</span>
          {editingEmail ? (
            <>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                className="flex-1 min-w-[200px] rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
                placeholder="you@example.com"
              />
              <button
                type="button"
                onClick={handleSaveEmail}
                disabled={updateSettings.isPending}
                className="rounded border border-gda-green bg-gda-green/10 px-2 py-0.5 text-[11px] font-mono text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingEmail(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-foreground font-mono">
                {deliveryEmail || "Not set"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEmailDraft(deliveryEmail);
                  setEditingEmail(true);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
            </>
          )}
        </div>

        {saved && (
          <p className="text-[11px] text-gda-green">Settings saved.</p>
        )}
      </div>
    </div>
  );
}

/* ── Data Quality Section ──────────────────────────────────────── */
function DataQualitySection() {
  const { data } = useMatchSuggestions({ limit: 100 });
  const pendingCount = (data?.items ?? []).filter((s) => s.status === "pending").length;

  return (
    <CollapseSection
      id="settings-data-quality"
      title={pendingCount > 0 ? `DATA QUALITY (${pendingCount})` : "DATA QUALITY"}
      defaultOpen={false}
    >
      <MatchApprovals />
    </CollapseSection>
  );
}

/* ── Main Settings Page ─────────────────────────────────────────── */
export default function SettingsPage() {
  const { isLoading: sentinelLoading } = useSentinel();
  const { data: sysHealth } = useSystemHealth();
  const { data: principles, isLoading: principlesLoading } = useDoctrinePrinciples();
  const { data: configRows, isLoading: configLoading } = useDoctrineConfig();

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <h1 className="font-mono text-lg font-bold text-foreground">SETTINGS</h1>
        <p className="text-sm text-muted-foreground">System configuration and integrations</p>
      </div>

      {/* ── System Health ──────────────────────────────────────── */}
      <div id="sentinel" />
      <CollapseSection id="settings-system-health" title="SYSTEM HEALTH" defaultOpen={true}>
        {sentinelLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
            ))}
          </div>
        ) : (
          <SystemHealthSection sysHealth={sysHealth} />
        )}
      </CollapseSection>

      {/* ── Doctrine Configuration ─────────────────────────────── */}
      <CollapseSection id="settings-doctrine" title="DOCTRINE CONFIGURATION" defaultOpen={false}>
        <div className="space-y-5">
          {/* Config Keys */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Rules Config
            </p>
            {configLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
                ))}
              </div>
            ) : configRows && configRows.length > 0 ? (
              <div className="space-y-2">
                {configRows.map((row) => (
                  <ConfigKeyRow key={row.key} row={row} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No config keys found.</p>
            )}
          </div>

          {/* Principles */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              8 Doctrine Principles
            </p>
            {principlesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-gda-bg-base" />
                ))}
              </div>
            ) : principles && principles.length > 0 ? (
              <div className="space-y-1.5">
                {principles.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-start gap-3 rounded border border-border bg-gda-bg-base px-3 py-2"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground w-4 shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.short_form}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No principles loaded.</p>
            )}
          </div>
        </div>
      </CollapseSection>

      {/* ── Data Quality ───────────────────────────────────────── */}
      <DataQualitySection />

      {/* ── User Management ────────────────────────────────────── */}
      <CollapseSection id="settings-users" title="USER MANAGEMENT" defaultOpen={false}>
        <UserManagementPanel />
      </CollapseSection>

      {/* ── Notifications ─────────────────────────────────────── */}
      <CollapseSection id="settings-notifications" title="NOTIFICATIONS" defaultOpen={false}>
        <NotificationsPanel />
      </CollapseSection>
    </div>
  );
}
