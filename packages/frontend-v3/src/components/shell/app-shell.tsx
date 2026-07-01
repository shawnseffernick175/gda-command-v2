"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { IngestAlertBanner } from "./ingest-alert-banner";
import { QaChecklistProvider } from "@/components/qa-checklist/qa-checklist-context";
import { QaChecklistLauncher } from "@/components/qa-checklist/QaChecklistLauncher";
import { QaChecklistDrawer } from "@/components/qa-checklist/QaChecklistDrawer";
import { UniversalDropZone } from "@/components/UniversalDropZone";
import { IngestJobsPanel } from "@/components/shared/IngestJobsPanel";
import { Inbox } from "lucide-react";

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
  "/awards": "vault",
  "/risks": "sentinel",
  "/contacts": "vault",
  "/competitors": "vault",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const surface = PATH_TO_SURFACE[pathname ?? ""] ?? "vault";
  const [ingestPanelOpen, setIngestPanelOpen] = useState(false);

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
        {/* Ingest panel toggle */}
        <button
          type="button"
          onClick={() => setIngestPanelOpen(!ingestPanelOpen)}
          title="Ingestion Queue"
          className="fixed bottom-4 left-4 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-gda-bg-raised ring-1 ring-foreground/10 transition-colors hover:bg-gda-panel"
        >
          <Inbox className="h-4 w-4 text-muted-foreground" />
        </button>
        <IngestJobsPanel
          open={ingestPanelOpen}
          onClose={() => setIngestPanelOpen(false)}
        />
      </div>
    </QaChecklistProvider>
  );
}
