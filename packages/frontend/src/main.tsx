import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { API_BASE, API_VERSION } from "./api/config";
import { initSoakReporter } from "./api/soakReporter";

initSoakReporter();

// Global error handler — reports uncaught errors and promise rejections to backend
function reportError(payload: { message: string; stack?: string; type: string }) {
  fetch(`${API_BASE}/errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, url: window.location.href, timestamp: new Date().toISOString(), apiVersion: API_VERSION }),
  }).catch(() => {});
}

window.addEventListener("error", (e) => {
  reportError({ message: e.message, stack: e.error?.stack, type: "uncaught_error" });
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
  const stack = e.reason instanceof Error ? e.reason.stack : undefined;
  reportError({ message: msg, stack, type: "unhandled_rejection" });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
