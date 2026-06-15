"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { AuthProvider } from "@/lib/auth-context";
import { AuthGate } from "@/components/shell/auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <TooltipProvider>
          <AuthGate>
            <AppShell>{children}</AppShell>
          </AuthGate>
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "text-sm font-sans",
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
