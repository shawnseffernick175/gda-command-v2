import { type ReactNode } from "react";
import { TopBar } from "../TopBar/TopBar";

export interface AppShellProps {
  sidebar?: ReactNode;
  topBarActions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, topBarActions, children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-canvas">
      <TopBar actions={topBarActions} />
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
