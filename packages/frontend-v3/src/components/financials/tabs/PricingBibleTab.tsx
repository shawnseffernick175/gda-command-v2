"use client";

import { useState, useCallback, useRef } from "react";
import {
  useFinancialBibleActive,
  useFinancialBibleVersions,
  useFinancialBibleUpload,
  useActivateVersion,
  useFinancialBibleRates,
  useFinancialBibleIndirects,
  useFinancialBibleHistory,
} from "@/hooks/use-financial-bible-upload";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function fmt$(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

type SubView = "overview" | "rates" | "indirects" | "history";

export function PricingBibleTab() {
  const activeQ = useFinancialBibleActive();
  const versionsQ = useFinancialBibleVersions();
  const uploadMut = useFinancialBibleUpload();
  const activateMut = useActivateVersion();

  const [subView, setSubView] = useState<SubView>("overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadNotes, setUploadNotes] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});

  const ratesInputRef = useRef<HTMLInputElement>(null);
  const indirectsInputRef = useRef<HTMLInputElement>(null);
  const odcsInputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFiles((prev) => ({ ...prev, [key]: file }));
      }
    },
    [],
  );

  const allFilesSelected =
    selectedFiles["rates"] &&
    selectedFiles["indirects"] &&
    selectedFiles["odcs"] &&
    selectedFiles["history"];

  const handleUpload = useCallback(async () => {
    if (!allFilesSelected) return;
    await uploadMut.mutateAsync({
      rates: selectedFiles["rates"],
      indirects: selectedFiles["indirects"],
      odcs: selectedFiles["odcs"],
      history: selectedFiles["history"],
      notes: uploadNotes || undefined,
    });
    setUploadOpen(false);
    setSelectedFiles({});
    setUploadNotes("");
  }, [allFilesSelected, selectedFiles, uploadNotes, uploadMut]);

  const active = activeQ.data?.active ?? null;
  const versions = versionsQ.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex items-center gap-1">
        {(
          [
            { id: "overview", label: "Overview" },
            { id: "rates", label: "Rate Card" },
            { id: "indirects", label: "Indirect Rates" },
            { id: "history", label: "Priced History" },
          ] as { id: SubView; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
              subView === t.id
                ? "bg-white text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setSubView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subView === "overview" && (
        <>
          {/* Active version card */}
          <div className="rounded border border-border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">
                  Active Version
                </h2>
                {active ? (
                  <div className="mt-2 space-y-1 text-[13px]">
                    <p className="text-muted-foreground">
                      Uploaded {formatDate(active.uploaded_at)} by{" "}
                      {active.uploaded_by}
                    </p>
                    {active.notes && (
                      <p className="text-muted-foreground italic">
                        {active.notes}
                      </p>
                    )}
                    <div className="mt-3 flex gap-6 text-[13px]">
                      <span>
                        <span className="font-medium">{active.rates_count}</span>{" "}
                        rates
                      </span>
                      <span>
                        <span className="font-medium">
                          {active.indirects_count}
                        </span>{" "}
                        indirect pools
                      </span>
                      <span>
                        <span className="font-medium">{active.odcs_count}</span>{" "}
                        ODC items
                      </span>
                      <span>
                        <span className="font-medium">
                          {active.history_count}
                        </span>{" "}
                        past pursuits
                      </span>
                    </div>
                    {active.validation_warnings.length > 0 && (
                      <div className="mt-2 rounded border border-[#B45309]/30 bg-[#B45309]/5 px-3 py-2 text-[12px] text-[#B45309]">
                        {active.validation_warnings.map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    No active version. Upload the PD-SYS 4-file set to get
                    started.
                  </p>
                )}
              </div>

              <button
                type="button"
                className="shrink-0 rounded border border-accent bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#015C61]"
                onClick={() => setUploadOpen(true)}
              >
                Upload Files
              </button>
            </div>
          </div>

          {/* Upload modal */}
          {uploadOpen && (
            <div className="rounded border border-border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <h3 className="text-[15px] font-semibold text-foreground">
                Upload PD-SYS 4-File Set
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Select all 4 xlsx files: Rates, Indirects, ODCs/Escalation,
                History/Priced
              </p>

              <div className="mt-4 grid grid-cols-2 gap-4">
                {[
                  {
                    key: "rates",
                    label: "01_Rates.xlsx",
                    ref: ratesInputRef,
                  },
                  {
                    key: "indirects",
                    label: "02_Indirects.xlsx",
                    ref: indirectsInputRef,
                  },
                  {
                    key: "odcs",
                    label: "03_ODCs_Escalation.xlsx",
                    ref: odcsInputRef,
                  },
                  {
                    key: "history",
                    label: "04_History_Priced.xlsx",
                    ref: historyInputRef,
                  },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1">
                      {f.label}
                    </label>
                    <input
                      ref={f.ref}
                      type="file"
                      accept=".xlsx,.xls"
                      className="block w-full text-[13px] text-foreground file:mr-2 file:rounded file:border file:border-border file:bg-white file:px-3 file:py-1 file:text-[12px] file:font-medium file:text-foreground hover:file:bg-gda-bg-deep"
                      onChange={handleFileSelect(f.key)}
                    />
                    {selectedFiles[f.key] && (
                      <p className="mt-1 text-[11px] text-accent">
                        {selectedFiles[f.key].name}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="block text-[12px] font-medium text-muted-foreground mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-border px-3 py-1.5 text-[13px] text-foreground"
                  placeholder="e.g. FY26 Q3 rate update"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={!allFilesSelected || uploadMut.isPending}
                  className={cn(
                    "rounded border px-4 py-1.5 text-[13px] font-medium transition-colors",
                    allFilesSelected && !uploadMut.isPending
                      ? "border-accent bg-accent text-white hover:bg-[#015C61]"
                      : "border-border bg-white text-muted-foreground cursor-not-allowed",
                  )}
                  onClick={handleUpload}
                >
                  {uploadMut.isPending ? "Uploading..." : "Upload & Validate"}
                </button>
                <button
                  type="button"
                  className="rounded border border-border bg-white px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
                  onClick={() => {
                    setUploadOpen(false);
                    setSelectedFiles({});
                  }}
                >
                  Cancel
                </button>
                {uploadMut.isError && (
                  <span className="text-[12px] text-critical">
                    {(uploadMut.error as Error).message}
                  </span>
                )}
                {uploadMut.isSuccess && (
                  <span className="text-[12px] text-accent">
                    Uploaded {uploadMut.data.summary.rates} rates,{" "}
                    {uploadMut.data.summary.indirects} indirects,{" "}
                    {uploadMut.data.summary.odcs} ODCs,{" "}
                    {uploadMut.data.summary.history} history records
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Version history */}
          {versions.length > 0 && (
            <div className="rounded border border-border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <h3 className="text-[15px] font-semibold text-foreground">
                Version History
              </h3>
              <table className="mt-3 w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[12px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Uploaded</th>
                    <th className="pb-2 text-left font-medium">Notes</th>
                    <th className="pb-2 text-right font-medium">Rates</th>
                    <th className="pb-2 text-right font-medium">Indirects</th>
                    <th className="pb-2 text-right font-medium">ODCs</th>
                    <th className="pb-2 text-right font-medium">History</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                    <th className="pb-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-b border-border">
                      <td className="py-2 text-foreground">
                        {formatDate(v.uploaded_at)}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {v.notes ?? "\u2014"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {v.rates_count}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {v.indirects_count}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {v.odcs_count}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {v.history_count}
                      </td>
                      <td className="py-2 text-right">
                        {v.active ? (
                          <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            inactive
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!v.active && (
                          <button
                            type="button"
                            className="rounded border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-gda-bg-deep"
                            onClick={() => activateMut.mutate(v.id)}
                            disabled={activateMut.isPending}
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subView === "rates" && <RatesSubView />}
      {subView === "indirects" && <IndirectsSubView />}
      {subView === "history" && <HistorySubView />}
    </div>
  );
}

function RatesSubView() {
  const [filter, setFilter] = useState("");
  const ratesQ = useFinancialBibleRates(
    filter ? { labor_category: filter } : undefined,
  );
  const items = ratesQ.data?.items ?? [];

  return (
    <div className="rounded border border-border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold text-foreground">
          Rate Card
        </h3>
        <input
          type="text"
          placeholder="Filter by labor category..."
          className="rounded border border-border px-3 py-1 text-[13px] text-foreground w-64"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {ratesQ.isLoading
            ? "Loading..."
            : "No rates found. Upload a Rates file first."}
        </p>
      ) : (
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-[12px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 text-left font-medium">Labor Category</th>
              <th className="pb-2 text-left font-medium">Clearance</th>
              <th className="pb-2 text-right font-medium">Rate</th>
              <th className="pb-2 text-left font-medium">Effective From</th>
              <th className="pb-2 text-left font-medium">Effective To</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2 text-foreground">{r.labor_category}</td>
                <td className="py-2 text-foreground">{r.clearance}</td>
                <td className="py-2 text-right tabular-nums">
                  {fmt$(r.rate)}
                </td>
                <td className="py-2 text-muted-foreground">
                  {r.effective_from}
                </td>
                <td className="py-2 text-muted-foreground">
                  {r.effective_to ?? "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function IndirectsSubView() {
  const indirectsQ = useFinancialBibleIndirects();
  const items = indirectsQ.data?.items ?? [];

  return (
    <div className="rounded border border-border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h3 className="text-[15px] font-semibold text-foreground">
        Indirect Rates by Contract Type
      </h3>
      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {indirectsQ.isLoading
            ? "Loading..."
            : "No indirect rates. Upload an Indirects file first."}
        </p>
      ) : (
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-[12px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 text-left font-medium">Contract Type</th>
              <th className="pb-2 text-right font-medium">Fringe</th>
              <th className="pb-2 text-right font-medium">Overhead</th>
              <th className="pb-2 text-right font-medium">G&A</th>
              <th className="pb-2 text-right font-medium">Fee Low</th>
              <th className="pb-2 text-right font-medium">Fee High</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2 text-foreground">{r.contract_type}</td>
                <td className="py-2 text-right tabular-nums">
                  {fmtPct(r.fringe_pct)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmtPct(r.overhead_pct)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmtPct(r.ga_pct)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmtPct(r.fee_band_low)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmtPct(r.fee_band_high)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistorySubView() {
  const historyQ = useFinancialBibleHistory();
  const items = historyQ.data?.items ?? [];

  const outcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case "won":
        return (
          <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
            WON
          </span>
        );
      case "lost":
        return (
          <span className="rounded bg-critical/10 px-2 py-0.5 text-[11px] font-semibold text-critical">
            LOST
          </span>
        );
      case "no_bid":
        return (
          <span className="rounded bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            NO BID
          </span>
        );
      case "withdrew":
        return (
          <span className="rounded bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            WITHDREW
          </span>
        );
      default:
        return (
          <span className="text-[11px] text-muted-foreground">
            {outcome ?? "\u2014"}
          </span>
        );
    }
  };

  return (
    <div className="rounded border border-border bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h3 className="text-[15px] font-semibold text-foreground">
        Priced Pursuit History
      </h3>
      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {historyQ.isLoading
            ? "Loading..."
            : "No history. Upload a History file first."}
        </p>
      ) : (
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-[12px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 text-left font-medium">Pursuit ID</th>
              <th className="pb-2 text-left font-medium">Agency</th>
              <th className="pb-2 text-left font-medium">Outcome</th>
              <th className="pb-2 text-right font-medium">Bid Price</th>
              <th className="pb-2 text-right font-medium">Winner Price</th>
              <th className="pb-2 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2 font-medium text-foreground">
                  {r.pursuit_id}
                </td>
                <td className="py-2 text-foreground">
                  {r.agency ?? "\u2014"}
                </td>
                <td className="py-2">{outcomeBadge(r.outcome)}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.bid_price != null ? fmt$(r.bid_price) : "\u2014"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.winner_price != null ? fmt$(r.winner_price) : "\u2014"}
                </td>
                <td className="py-2 text-muted-foreground">
                  {r.notes ?? "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
