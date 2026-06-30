"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { IngestAlertBanner } from "./ingest-alert-banner";
import { QaChecklistProvider } from "@/components/qa-checklist/qa-checklist-context";
import { QaChecklistLauncher } from "@/components/qa-checklist/QaChecklistLauncher";
import { QaChecklistDrawer } from "@/components/qa-checklist/QaChecklistDrawer";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QaChecklistProvider>
      <div className="flex h-screen overflow-hidden bg-gda-bg-deep">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <IngestAlertBanner />
          <main className="flex-1 overflow-y-auto bg-gda-bg-deep px-6 pb-6">{children}</main>
        </div>
        <QaChecklistLauncher />
        <QaChecklistDrawer />
      </div>
    </QaChecklistProvider>
  );
}
