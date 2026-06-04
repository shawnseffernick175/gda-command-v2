"use client";

import { useSentinel } from "@/hooks/use-sentinel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PendingState } from "@/components/shared/pending-state";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { data: sentinel, isLoading: sentinelLoading } = useSentinel();

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Settings
      </h1>

      {/* Sentinel Health */}
      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Sentinel — Data Source Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sentinelLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded bg-gda-bg-base"
                />
              ))}
            </div>
          ) : sentinel?.sources ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">
                  Overall:
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    sentinel.overall === "healthy"
                      ? "border-gda-green/30 text-gda-green"
                      : sentinel.overall === "degraded"
                        ? "border-gda-amber/30 text-gda-amber"
                        : "border-gda-red/30 text-gda-red",
                  )}
                >
                  {sentinel.overall}
                </Badge>
              </div>
              {sentinel.sources.map((source) => (
                <div
                  key={source.source_key}
                  className="flex items-center gap-3 rounded border border-border bg-gda-bg-base px-3 py-2"
                  title={source.message}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      source.status === "healthy"
                        ? "bg-gda-green"
                        : source.status === "stale"
                          ? "bg-gda-amber"
                          : source.status === "unknown"
                            ? "bg-muted-foreground"
                            : "bg-gda-red",
                    )}
                  />
                  <span className="flex-1 text-sm text-foreground">
                    {source.label}
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {source.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {source.last_success_at
                      ? new Date(source.last_success_at).toLocaleString()
                      : "Never"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to fetch sentinel data.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Doctrine */}
      <CollapseSection
        id="settings-doctrine"
        title="Doctrine Configuration"
        defaultOpen={false}
      >
        <PendingState
          surface="Doctrine Configuration"
          reason="Doctrine enforcement rules and thresholds. Configure which checks are active, exclusions, and override policies."
        />
      </CollapseSection>

      {/* User / Auth */}
      <CollapseSection
        id="settings-users"
        title="Users & Authentication"
        defaultOpen={false}
      >
        <PendingState
          surface="User Management"
          reason="Manage team members, roles, and permissions. Pending admin panel integration."
        />
      </CollapseSection>

      {/* Integrations */}
      <CollapseSection
        id="settings-integrations"
        title="Integrations"
        defaultOpen={false}
      >
        <PendingState
          surface="Integration Settings"
          reason="Configure GovTribe, GovWin, SAM.gov, FPDS, and other data source connections."
        />
      </CollapseSection>
    </div>
  );
}
