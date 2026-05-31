import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { registerGdaThemes } from "./lib/echarts-theme";
import { initTheme } from "./lib/theme";
import { shouldRefreshToken, getToken, setToken, getUser } from "./lib/auth";
import "./app.css";

const API_BASE = import.meta.env.VITE_V3_API_URL || 'https://gda-v3.csr-llc.tech';

const queryClient = new QueryClient();

initTheme();
registerGdaThemes();

// Fire-and-forget token refresh on startup if within 60min of expiry
if (shouldRefreshToken()) {
  const token = getToken();
  if (token) {
    fetch(`${API_BASE}/v3/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((json: { success: boolean; data?: { token: string } }) => {
        if (json.success && json.data?.token) {
          const user = getUser();
          if (user) setToken(json.data.token, user);
        }
      })
      .catch(() => { /* ignore refresh failures */ });
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
