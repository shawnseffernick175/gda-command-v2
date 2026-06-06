"use client";

import { useState } from "react";
import { useIngestHealth } from "@/hooks/use-ingest-status";
import Link from "next/link";

const DISMISS_KEY = "ingest_alert_dismissed";

function isDismissedForKey(key: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DISMISS_KEY) === key;
}

export function IngestAlertBanner() {
  const { data } = useIngestHealth();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const currentKey = `${data?.stale_count ?? 0}_${data?.error_count ?? 0}`;
  const storedDismissed = isDismissedForKey(currentKey);
  const dismissed = storedDismissed || dismissedKey === currentKey;

  if (!data) return null;

  const total = data.stale_count + data.error_count;
  if (total === 0) return null;
  if (dismissed) return null;

  const message =
    data.error_count > 0 && data.stale_count > 0
      ? `${data.error_count} data source${data.error_count > 1 ? "s" : ""} errored, ${data.stale_count} stale`
      : data.error_count > 0
      ? `${data.error_count} data source${data.error_count > 1 ? "s" : ""} errored`
      : `${data.stale_count} data source${data.stale_count > 1 ? "s are" : " is"} stale`;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, currentKey);
    setDismissedKey(currentKey);
  }

  return (
    <div className="bg-gda-amber/10 border-b border-gda-amber/30 text-gda-amber text-xs font-mono px-4 py-1.5 flex items-center gap-3">
      <span>{"\u26A0"} {message} {"\u2014"} check Settings for details.</span>
      <Link
        href="/settings"
        className="underline hover:text-gda-amber/80 ml-auto"
      >
        → Settings
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-gda-amber/60 hover:text-gda-amber ml-2"
        aria-label="Dismiss"
      >
        {"\u2715"}
      </button>
    </div>
  );
}
