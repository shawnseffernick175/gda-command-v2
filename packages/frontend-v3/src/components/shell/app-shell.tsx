"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { KpiHeader } from "./kpi-header";
import { IngestAlertBanner } from "./ingest-alert-banner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gda-bg-deep">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <IngestAlertBanner />
        <KpiHeader />
        <main className="flex-1 overflow-y-auto bg-gda-bg-deep px-6 pb-6">{children}</main>
      </div>
    </div>
  );
}
