"use client";

import { useState } from "react";
import { useSentinel } from "@/hooks/use-sentinel";
import {
  useDoctrinePrinciples,
  useDoctrineExclusions,
  useDoctrineConfig,
  useUpdateDoctrineConfig,
} from "@/hooks/use-doctrine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PendingState } from "@/components/shared/pending-state";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";
import type { DoctrineConfigRow } from "@/hooks/use-doctrine";
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeactivateAdminUser,
} from "@/hooks/use-admin-users";

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
      <p className="text-[10px] text-muted-foreground/50">
        Updated {new Date(row.updated_at).toLocaleString()}
      </p>
    </div>
  );
}

/* ── Integrations Panel ───────────────────────────────────────── */
const INTEGRATION_SOURCES: Array<{
  key: string;
  label: string;
  description: string;
  docsUrl: string;
}> = [
  { key: 'sam.gov', label: 'SAM.gov', description: 'Federal solicitations — free API, no credential required', docsUrl: 'https://open.sam.gov' },
  { key: 'govtribe', label: 'GovTribe', description: 'Opportunity intelligence + contract vehicles + agency contacts', docsUrl: 'https://api.govtribe.com' },
  { key: 'govwin', label: 'GovWin IQ', description: 'Forecast pipeline + competitive intelligence (CAS auth)', docsUrl: 'https://iq.govwin.com' },
  { key: 'usaspending.gov', label: 'USAspending', description: 'Federal awards database — free public API', docsUrl: 'https://api.usaspending.gov' },
  { key: 'grants.gov', label: 'Grants.gov', description: 'Federal grant opportunities — public XML feed', docsUrl: 'https://www.grants.gov/xml-extract' },
  { key: 'federalregister.gov', label: 'Federal Register', description: 'Regulatory notices and agency rules', docsUrl: 'https://www.federalregister.gov/developers' },
  { key: 'sbir', label: 'SBIR/STTR', description: 'DoD DSIP open topics — public API', docsUrl: 'https://www.dodsbirsttr.mil/topics-app/' },
  { key: 'dibbs', label: 'DIBBS (DLA)', description: 'DLA small business RFQs — .mil site (egress blocked from VPS)', docsUrl: 'https://www.dibbs.bsm.dla.mil' },
  { key: 'neco', label: 'NECO (Navy)', description: 'Navy electronic commerce — .mil site (egress blocked from VPS)', docsUrl: 'https://www.neco.navy.mil' },
  { key: 'nih', label: 'NIH RePORTER', description: 'Research awards — weekly ingest (Mon 3am ET)', docsUrl: 'https://api.reporter.nih.gov' },
  { key: 'arxiv', label: 'arXiv', description: 'Defense/tech research papers — weekly ingest (Mon 2am ET)', docsUrl: 'https://arxiv.org/help/api' },
];

type SentinelData = {
  overall: string;
  sources: Array<{
    source_key: string;
    label: string;
    status: string;
    last_success_at: string | null;
    message?: string;
  }>;
} | null | undefined;

function IntegrationsPanel({ sentinel }: { sentinel: SentinelData }) {
  const sourceMap = new Map(
    (sentinel?.sources ?? []).map((s) => [s.source_key, s])
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground mb-3">
        Live status from Sentinel. All data source connections are managed via environment variables on the VPS.
      </p>
      {INTEGRATION_SOURCES.map((integration) => {
        const live = sourceMap.get(integration.key);
        const status = live?.status ?? 'unknown';
        const lastRun = live?.last_success_at
          ? new Date(live.last_success_at).toLocaleString()
          : 'Never';

        return (
          <div
            key={integration.key}
            className="flex items-start gap-3 rounded border border-border bg-gda-bg-base px-3 py-2.5"
          >
            <span
              className={cn(
                'mt-0.5 h-2 w-2 rounded-full shrink-0',
                status === 'healthy' ? 'bg-gda-green' :
                status === 'stale' ? 'bg-amber-400' :
                status === 'error' ? 'bg-red-500' :
                'bg-muted-foreground'
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">{integration.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] px-1.5 py-0',
                    status === 'healthy' ? 'border-gda-green/30 text-gda-green' :
                    status === 'stale' ? 'border-amber-400/30 text-amber-400' :
                    status === 'error' ? 'border-red-500/30 text-red-400' :
                    'border-border text-muted-foreground'
                  )}
                >
                  {status}
                </Badge>
                <a
                  href={integration.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground ml-auto"
                >
                  Docs ↗
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{integration.description}</p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Last success: {lastRun}</p>
            </div>
          </div>
        );
      })}
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

/* ── Main Settings Page ─────────────────────────────────────────── */
export default function SettingsPage() {
  const { data: sentinel, isLoading: sentinelLoading } = useSentinel();
  const { data: principles, isLoading: principlesLoading } = useDoctrinePrinciples();
  const { data: exclusions, isLoading: exclusionsLoading } = useDoctrineExclusions();
  const { data: configRows, isLoading: configLoading } = useDoctrineConfig();

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">Settings</h1>

      {/* ── Sentinel Health ───────────────────────────────────── */}
      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Sentinel — Data Source Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sentinelLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-gda-bg-base" />
              ))}
            </div>
          ) : sentinel?.sources ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Overall:</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    sentinel.overall === "healthy"
                      ? "border-gda-green/30 text-gda-green"
                      : sentinel.overall === "degraded"
                      ? "border-gda-amber/30 text-gda-amber"
                      : "border-gda-red/30 text-gda-red",
                  )}
                >
                  {sentinel.overall}
                </Badge>
              </div>
              {sentinel.sources.map((source) => (
                <div
                  key={source.source_key}
                  className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2"
                  title={source.message}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      source.status === "healthy"
                        ? "bg-gda-green"
                        : source.status === "stale"
                        ? "bg-gda-amber"
                        : source.status === "unknown"
                        ? "bg-muted-foreground"
                        : "bg-gda-red",
                    )}
                  />
                  <span className="flex-1 text-sm text-foreground">{source.label}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {source.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {source.last_success_at
                      ? new Date(source.last_success_at).toLocaleString()
                      : "Never"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to fetch sentinel data.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Doctrine Configuration ────────────────────────────── */}
      <CollapseSection id="settings-doctrine" title="Doctrine Configuration" defaultOpen={false}>
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

          {/* Exclusions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Strategic Exclusions
            </p>
            {exclusionsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
                ))}
              </div>
            ) : exclusions && exclusions.length > 0 ? (
              <div className="space-y-1.5">
                {exclusions.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-start gap-3 rounded border border-border bg-gda-bg-base px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-foreground">{ex.name}</p>
                        {ex.is_hard_block && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0"
                          >
                            Hard Block
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {ex.description}
                      </p>
                      {ex.override_requires && (
                        <p className="text-[11px] text-amber-400 mt-0.5">
                          Override requires: {ex.override_requires}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No exclusions loaded.</p>
            )}
          </div>
        </div>
      </CollapseSection>

      {/* ── Users & Auth ─────────────────────────────────────── */}
      <CollapseSection id="settings-users" title="Users & Authentication" defaultOpen={false}>
        <UserManagementPanel />
      </CollapseSection>

      {/* ── Integrations ─────────────────────────────────────── */}
      <CollapseSection id="settings-integrations" title="Integrations" defaultOpen={false}>
        <IntegrationsPanel sentinel={sentinel} />
      </CollapseSection>
    </div>
  );
}
