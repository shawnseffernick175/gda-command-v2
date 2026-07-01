"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { IngestAlertBanner } from "./ingest-alert-banner";
import { QaChecklistProvider } from "@/components/qa-checklist/qa-checklist-context";
import { QaChecklistLauncher } from "@/components/qa-checklist/QaChecklistLauncher";
import { QaChecklistDrawer } from "@/components/qa-checklist/QaChecklistDrawer";
import { UniversalDropZone } from "@/components/UniversalDropZone";

const PATH_TO_SURFACE: Record<string, string> = {
  "/digest": "digest",
  "/opportunities": "opportunities",
  "/pipeline": "pipeline",
  "/capture": "capture",
  "/action-items": "action_items",
  "/vault": "vault",
  "/financials": "financials",
  "/regulatory": "regulatory",
  "/fastrac": "fastrac",
  "/vehicles": "vehicles",
  "/awards": "awards",
  "/risks": "sentinel",
  "/contacts": "vault",
  "/competitors": "vault",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const surface = PATH_TO_SURFACE[pathname ?? ""] ?? "vault";

  return (
    <QaChecklistProvider>
      <div className="flex h-screen overflow-hidden bg-gda-bg-deep">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <IngestAlertBanner />
          <UniversalDropZone target={surface}>
            <main className="flex-1 overflow-y-auto bg-gda-bg-deep px-6 pb-6">{children}</main>
          </UniversalDropZone>
        </div>
        <QaChecklistLauncher />
        <QaChecklistDrawer />
      </div>
    </QaChecklistProvider>
  );
}
