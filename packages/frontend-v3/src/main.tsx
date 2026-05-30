import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { registerGdaThemes } from "./lib/echarts-theme";
import "./styles/globals.css";

// Register ECharts themes on boot
registerGdaThemes();

// Apply stored theme preference
const storedTheme = localStorage.getItem("gda-theme");
if (storedTheme === "light") {
  document.documentElement.setAttribute("data-theme", "light");
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
