"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { KpiHeader } from "./kpi-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gda-bg-deep">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <KpiHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
