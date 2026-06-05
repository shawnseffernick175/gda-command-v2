"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";

export function TopBar() {
  const { user, logout } = useAuth();
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <div className="flex h-10 items-center justify-between border-b border-border bg-gda-bg-base px-4">
        <div className="flex items-center gap-3">
          <a
            href="https://csr-llc.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs font-bold text-gda-green hover:opacity-80 transition-opacity"
          >
            Envision
          </a>
          <span className="text-[11px] text-muted-foreground">OU</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCmdkOpen(true)}
            className="flex items-center gap-1.5 rounded border border-border bg-gda-bg-base px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-gda-panel hover:text-foreground"
          >
            <span>Search</span>
            <kbd className="rounded border border-border bg-gda-bg-deep px-1 text-[11px]">
              ⌘K
            </kbd>
          </button>

          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-gda-green hover:text-gda-green"
              onClick={() => setAddOpen(!addOpen)}
            >
              + Add
            </Button>
            {addOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-border bg-gda-bg-raised shadow-lg">
                <a
                  href="/opportunities"
                  className="block px-3 py-2 text-xs text-foreground hover:bg-gda-panel"
                  onClick={() => setAddOpen(false)}
                >
                  Opportunity
                </a>
                <a
                  href="/risks"
                  className="block px-3 py-2 text-xs text-foreground hover:bg-gda-panel"
                  onClick={() => setAddOpen(false)}
                >
                  Risk
                </a>
                <a
                  href="/action-items"
                  className="block px-3 py-2 text-xs text-foreground hover:bg-gda-panel"
                  onClick={() => setAddOpen(false)}
                >
                  Action Item
                </a>
              </div>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {user.display_name || user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                onClick={() => void logout()}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </div>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </>
  );
}
