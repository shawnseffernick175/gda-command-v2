/**
 * Soak instrumentation — F-213.
 *
 * Captures failed fetches, 5xx responses, and R2 analysis timeouts (503).
 * Batches events and flushes to the backend soak-metrics endpoint every 30 s.
 * The backend rolls them up into the soak_metrics table for Sentinel.
 */

import { API_BASE, API_VERSION } from "./config";

interface SoakEvent {
  kind: "fetch_error" | "5xx" | "503_timeout";
  url: string;
  status?: number;
  durationMs?: number;
  message?: string;
  ts: string;
}

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER = 200;

let buffer: SoakEvent[] = [];

function push(event: SoakEvent): void {
  if (buffer.length < MAX_BUFFER) {
    buffer.push(event);
  }
}

function flush(): void {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];

  const payload = { apiVersion: API_VERSION, events };
  // Fire-and-forget — soak reporting must never disrupt the user
  fetch(`${API_BASE}/soak-metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

/** Call once at app boot to start the flush timer. */
export function initSoakReporter(): void {
  setInterval(flush, FLUSH_INTERVAL_MS);
  // Flush on page unload so we don't lose the last batch
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/**
 * Wrap a fetch response to record soak-relevant events.
 * Call this after every API fetch completes (success or failure).
 */
export function recordFetchResult(
  url: string,
  status: number,
  startMs: number,
): void {
  const durationMs = Math.round(performance.now() - startMs);
  const ts = new Date().toISOString();

  if (status === 503) {
    push({ kind: "503_timeout", url, status, durationMs, ts });
  } else if (status >= 500) {
    push({ kind: "5xx", url, status, durationMs, ts });
  }
}

/** Record a network-level failure (no response at all). */
export function recordFetchError(url: string, message: string): void {
  push({
    kind: "fetch_error",
    url,
    message,
    ts: new Date().toISOString(),
  });
}
