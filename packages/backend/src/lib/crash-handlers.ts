/**
 * Process-level crash handlers.
 *
 * Must be imported early in the server lifecycle. Catches unhandled promise
 * rejections (logged, process survives) and uncaught exceptions (logged,
 * process exits after flush).
 */

import { log } from "./logger";

let installed = false;

export function installCrashHandlers(): void {
  if (installed) return;
  installed = true;

  process.on("unhandledRejection", (reason) => {
    log.error("unhandled_rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined,
    });
  });

  process.on("uncaughtException", (err) => {
    log.error("uncaught_exception", {
      error: err.message,
      stack: err.stack?.slice(0, 2000),
    });
    // Give the logger time to flush, then exit (container will restart)
    setTimeout(() => process.exit(1), 1000);
  });
}
