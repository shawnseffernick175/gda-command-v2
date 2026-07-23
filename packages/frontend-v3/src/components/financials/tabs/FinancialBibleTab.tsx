"use client";

import { useState, useCallback } from "react";
import {
  useBibleActive,
  useBibleVersions,
  useBibleVersionDetail,
  useUploadBible,
  useActivateBibleVersion,
  type BibleVersionSummary,
} from "@/hooks/use-financial-bible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[12px] font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

// ── Upload Panel ────────────────────────────────────────────────────────────

function UploadPanel({ onSuccess }: { onSuccess?: () => void }) {
  const upload = useUploadBible();
  const [files, setFiles] = useState<Record<string, File>>({});
  const [notes, setNotes] = useState("");

  const FILE_SLOTS = [
    { key: "rates", label: "01_Rates.xlsx", hint: "Labor categories, rates, clearances" },
    { key: "indirects", label: "02_Indirects.xlsx", hint: "Fringe, OH, G&A, fee bands" },
    { key: "odcs", label: "03_ODCs_Escalation.xlsx", hint: "Other direct costs, escalation" },
    { key: "history", label: "04_History_Priced.xlsx", hint: "Past priced pursuits" },
  ];

  const allPresent = FILE_SLOTS.every((s) => files[s.key]);

  const handleSubmit = useCallback(() => {
    if (!allPresent) return;
    upload.mutate(
      {
        rates: files["rates"],
        indirects: files["indirects"],
        odcs: files["odcs"],
        history: files["history"],
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setFiles({});
          setNotes("");
          onSuccess?.();
        },
      },
    );
  }, [allPresent, files, notes, upload, onSuccess]);

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Upload PD-SYS 4-File Set
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {FILE_SLOTS.map((slot) => (
            <div key={slot.key} className="space-y-1">
              <label className="text-[12px] font-medium text-foreground">
                {slot.label}
              </label>
              <p className="text-[12px] text-muted-foreground">{slot.hint}</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-[12px] text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-card file:px-2 file:py-1 file:text-[12px] file:font-medium file:text-foreground"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFiles((prev) => ({ ...prev, [slot.key]: f }));
                }}
              />
              {files[slot.key] && (
                <p className="text-[12px] text-gda-green font-mono truncate">
                  {files[slot.key].name}
                </p>
              )}
            </div>
          ))}
        </div>

        <div>
          <label className="text-[12px] font-medium text-foreground">
            Upload Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Q3 rate refresh, updated fringe"
            className="mt-1 block w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {upload.isError && (
          <p className="text-[12px] text-gda-red">
            {(upload.error as Error).message}
          </p>
        )}

        {upload.isSuccess && (
          <p className="text-[12px] text-gda-green font-mono">
            Uploaded successfully: {upload.data?.summary?.rates ?? 0} rates,{" "}
            {upload.data?.summary?.indirects ?? 0} indirects,{" "}
            {upload.data?.summary?.odcs ?? 0} ODCs,{" "}
            {upload.data?.summary?.history ?? 0} history records
          </p>
        )}

        <button
          type="button"
          disabled={!allPresent || upload.isPending}
          onClick={handleSubmit}
          className={cn(
            "rounded px-4 py-1.5 text-[13px] font-medium transition-colors",
            allPresent
              ? "bg-gda-green text-black hover:bg-gda-green/90"
              : "bg-card text-muted-foreground cursor-not-allowed",
          )}
        >
          {upload.isPending ? "Uploading..." : "Upload & Validate"}
        </button>
      </CardContent>
    </Card>
  );
}

// ── Version Row ─────────────────────────────────────────────────────────────

function VersionRow({
  v,
  onActivate,
  isActivating,
  onSelect,
}: {
  v: BibleVersionSummary;
  onActivate: (id: string) => void;
  isActivating: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded border px-3 py-2 text-xs",
        v.active
          ? "border-gda-green/40 bg-gda-green/5"
          : "border-border bg-card",
      )}
    >
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2">
          {v.active && (
            <Badge variant="outline" className="border-gda-green text-gda-green text-[12px]">
              ACTIVE
            </Badge>
          )}
          <span className="font-mono text-muted-foreground text-[12px]">
            {formatDate(v.uploaded_at)}
          </span>
        </div>
        {v.notes && (
          <p className="text-[12px] text-muted-foreground truncate max-w-[400px]">
            {v.notes}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <StatBadge label="Rates" value={v.rate_count} />
          <StatBadge label="Indirects" value={v.indirect_count} />
          <StatBadge label="ODCs" value={v.odc_count} />
          <StatBadge label="History" value={v.history_count} />
          {v.scenario_count != null && v.scenario_count > 0 && (
            <StatBadge label="Scenarios" value={v.scenario_count} />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-[12px] font-mono text-foreground hover:border-gda-green/40 hover:text-gda-green transition-colors"
          onClick={() => onSelect(v.id)}
        >
          Details
        </button>
        {!v.active && (
          <button
            type="button"
            disabled={isActivating}
            className="rounded border border-gda-green/40 px-2 py-1 text-[12px] font-mono text-gda-green hover:bg-gda-green/10 transition-colors disabled:opacity-50"
            onClick={() => onActivate(v.id)}
          >
            Activate
          </button>
        )}
      </div>
    </div>
  );
}

// ── Version Detail Drawer ───────────────────────────────────────────────────

function VersionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useBibleVersionDetail(id);
  const [tab, setTab] = useState<"rates" | "indirects" | "odcs" | "history">("rates");

  if (isLoading) {
    return (
      <Card className="border-border bg-gda-panel">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          Loading version detail...
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const TABS = [
    { id: "rates" as const, label: "Rates", count: data.rates.length },
    { id: "indirects" as const, label: "Indirects", count: data.indirects.length },
    { id: "odcs" as const, label: "ODCs", count: data.odcs.length },
    { id: "history" as const, label: "History", count: data.history.length },
  ];

  return (
    <Card className="border-border bg-gda-panel">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
          Version Detail — {formatDate(data.version.uploaded_at)}
        </CardTitle>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.version.notes && (
          <p className="text-[12px] text-muted-foreground">{data.version.notes}</p>
        )}

        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "border-b-2 px-2 pb-1 text-[12px] font-medium transition-colors",
                tab === t.id
                  ? "border-gda-cyan text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {tab === "rates" && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1">Labor Category</th>
                  <th className="px-2 py-1">Clearance</th>
                  <th className="px-2 py-1 text-right">Rate</th>
                  <th className="px-2 py-1">Effective From</th>
                  <th className="px-2 py-1">Effective To</th>
                </tr>
              </thead>
              <tbody>
                {data.rates.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono">{r.labor_category}</td>
                    <td className="px-2 py-1">{r.clearance}</td>
                    <td className="px-2 py-1 text-right font-mono">${r.rate.toLocaleString()}</td>
                    <td className="px-2 py-1">{r.effective_from}</td>
                    <td className="px-2 py-1">{r.effective_to ?? "---"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "indirects" && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1">Contract Type</th>
                  <th className="px-2 py-1 text-right">Fringe %</th>
                  <th className="px-2 py-1 text-right">Overhead %</th>
                  <th className="px-2 py-1 text-right">G&A %</th>
                  <th className="px-2 py-1 text-right">Fee Low</th>
                  <th className="px-2 py-1 text-right">Fee High</th>
                </tr>
              </thead>
              <tbody>
                {data.indirects.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono">{r.contract_type}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.fringe_pct}%</td>
                    <td className="px-2 py-1 text-right font-mono">{r.overhead_pct}%</td>
                    <td className="px-2 py-1 text-right font-mono">{r.ga_pct}%</td>
                    <td className="px-2 py-1 text-right font-mono">{r.fee_band_low}%</td>
                    <td className="px-2 py-1 text-right font-mono">{r.fee_band_high}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "odcs" && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1">Category</th>
                  <th className="px-2 py-1 text-right">Base Year</th>
                  <th className="px-2 py-1 text-right">Base Amount</th>
                  <th className="px-2 py-1 text-right">Escalation %</th>
                  <th className="px-2 py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.odcs.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono">{r.category}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.base_year}</td>
                    <td className="px-2 py-1 text-right font-mono">${r.base_amount.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.escalation_pct}%</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.notes ?? "---"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "history" && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1">Pursuit ID</th>
                  <th className="px-2 py-1">Agency</th>
                  <th className="px-2 py-1">Outcome</th>
                  <th className="px-2 py-1 text-right">Bid Price</th>
                  <th className="px-2 py-1 text-right">Winner Price</th>
                  <th className="px-2 py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono">{r.pursuit_id}</td>
                    <td className="px-2 py-1">{r.agency ?? "---"}</td>
                    <td className="px-2 py-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[12px]",
                          r.outcome === "won" && "border-gda-green text-gda-green",
                          r.outcome === "lost" && "border-gda-red text-gda-red",
                          r.outcome === "no_bid" && "border-muted-foreground text-muted-foreground",
                        )}
                      >
                        {r.outcome ?? "---"}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {r.bid_price != null ? `$${r.bid_price.toLocaleString()}` : "---"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {r.winner_price != null ? `$${r.winner_price.toLocaleString()}` : "---"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground truncate max-w-[200px]">
                      {r.notes ?? "---"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Tab ────────────────────────────────────────────────────────────────

export function FinancialBibleTab() {
  const activeQ = useBibleActive();
  const versionsQ = useBibleVersions();
  const activate = useActivateBibleVersion();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const active = activeQ.data?.active ?? null;
  const versions = versionsQ.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Active Version Summary */}
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Active Financial Bible
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : active ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-gda-green text-gda-green text-[12px]">
                  ACTIVE
                </Badge>
                <span className="text-[12px] font-mono text-muted-foreground">
                  Uploaded {formatDate(active.uploaded_at)}
                </span>
              </div>
              {active.notes && (
                <p className="text-[12px] text-muted-foreground">{active.notes}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                <StatBadge label="Labor Rates" value={active.rate_count} />
                <StatBadge label="Indirect Pools" value={active.indirect_count} />
                <StatBadge label="ODC Categories" value={active.odc_count} />
                <StatBadge label="Historical Pursuits" value={active.history_count} />
              </div>
              <div className="flex gap-2 flex-wrap text-[12px] text-muted-foreground">
                <span>Files: {Object.values(active.source_files).join(", ")}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No active version. Upload the PD-SYS 4-file set below and activate it.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upload */}
      <UploadPanel />

      {/* Version History */}
      <Card className="border-border bg-gda-panel">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {versionsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No versions uploaded yet.</p>
          ) : (
            versions.map((v) => (
              <VersionRow
                key={v.id}
                v={v}
                onActivate={(id) => activate.mutate(id)}
                isActivating={activate.isPending}
                onSelect={setSelectedVersion}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Version Detail */}
      {selectedVersion && (
        <VersionDetail
          id={selectedVersion}
          onClose={() => setSelectedVersion(null)}
        />
      )}
    </div>
  );
}
