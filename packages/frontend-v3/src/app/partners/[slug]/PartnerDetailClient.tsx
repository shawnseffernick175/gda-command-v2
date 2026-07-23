"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { usePartner } from "@/hooks/use-partners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ErrorState } from "@/components/shared/error-state";
import { cn } from "@/lib/utils";

const OU_LABELS: Record<string, string> = {
  riverstone: "Riverstone (OU2)",
  pd_systems: "PD Systems (OU1)",
};

const OU_COLORS: Record<string, string> = {
  riverstone: "border-gda-cyan/40 text-gda-cyan",
  pd_systems: "border-gda-amber/40 text-gda-amber",
};

function slugToOu(slug: string): string {
  if (slug === "pd-systems") return "pd_systems";
  return slug;
}

export function PartnerDetailClient() {
  const params = useParams<{ slug: string }>();
  const ou = slugToOu(params.slug);
  const { data: partner, isLoading, error } = usePartner(ou);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) return <ErrorState message={(error as Error).message} />;
  if (!partner) return <ErrorState message="Partner not found" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/partners"
          className="text-xs font-mono text-muted-foreground hover:text-gda-cyan transition-colors"
        >
          Partners
        </Link>
        <span className="text-xs text-muted-foreground">/</span>
        <h1 className="font-mono text-lg font-bold text-foreground">
          {partner.name}
        </h1>
        <Badge
          variant="outline"
          className={cn("text-[12px] font-mono", OU_COLORS[partner.ou])}
        >
          {OU_LABELS[partner.ou]}
        </Badge>
        {partner.is_stale && (
          <Badge
            variant="outline"
            className="border-gda-amber text-gda-amber text-[12px] font-mono"
          >
            STALE — last reviewed {daysSince(partner.last_reviewed_at)}d ago
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground italic">
        Read-only from Envision. Profile data is curated by the owning OU lead.
      </p>

      <Separator className="bg-border" />

      {/* Two column layout */}
      <div className="grid gap-4 lg:grid-cols-[55%_1fr]">
        {/* Column A */}
        <div className="space-y-4">
          {/* Overview */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-foreground leading-relaxed">
                {partner.overview}
              </p>
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {partner.capabilities_summary.map((cap) => (
                <div key={cap.area} className="rounded border border-border bg-gda-bg-base px-3 py-2">
                  <p className="text-xs font-mono font-semibold text-foreground">
                    {cap.area}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{cap.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Past Performance */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Past Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {partner.past_performance_summary.length === 0 ? (
                <p className="text-xs text-muted-foreground">No past performance data available</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-1 text-left font-mono text-[12px] uppercase text-muted-foreground tracking-wider">
                        Agency
                      </th>
                      <th className="pb-1 text-left font-mono text-[12px] uppercase text-muted-foreground tracking-wider">
                        Contract
                      </th>
                      <th className="pb-1 text-left font-mono text-[12px] uppercase text-muted-foreground tracking-wider">
                        Period
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {partner.past_performance_summary.map((pp, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="py-1.5 text-foreground">{pp.agency}</td>
                        <td className="py-1.5 font-mono text-foreground">
                          {pp.contract_id ?? "---"}
                        </td>
                        <td className="py-1.5 text-muted-foreground">{pp.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Column B */}
        <div className="space-y-4">
          {/* Certifications */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Certifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {partner.certifications.map((cert) => (
                <div key={cert} className="flex items-center gap-2">
                  <span className="text-gda-green text-[12px]">●</span>
                  <span className="text-xs font-mono text-foreground">{cert}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Agencies of Strength */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Agencies of Strength
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {partner.agencies_of_strength.map((agency) => (
                  <Badge
                    key={agency}
                    variant="outline"
                    className="border-border text-[12px] font-mono text-foreground"
                  >
                    {agency}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* NAICS Codes */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                NAICS Codes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {partner.naics_codes.map((naics) => (
                  <Badge
                    key={naics}
                    variant="outline"
                    className="border-border text-[12px] font-mono text-foreground"
                  >
                    {naics}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Key Personnel */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Key Personnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {partner.key_personnel.length === 0 ? (
                <p className="text-xs text-muted-foreground">No key personnel data</p>
              ) : (
                partner.key_personnel.map((person, idx) => (
                  <div key={idx} className="rounded border border-border bg-gda-bg-base px-3 py-2">
                    <p className="text-xs font-mono font-semibold text-foreground">
                      {person.name}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      Clearance: {person.clearance}
                      {person.certifications.length > 0 &&
                        ` | ${person.certifications.join(", ")}`}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card className="border-border bg-gda-panel">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-xs text-muted-foreground uppercase">
                Profile Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <MetaRow
                label="Last Reviewed"
                value={new Date(partner.last_reviewed_at).toLocaleDateString()}
              />
              <MetaRow
                label="Status"
                value={partner.active ? "Active" : "Inactive"}
              />
              <MetaRow
                label="Freshness"
                value={
                  partner.is_stale
                    ? `Stale (${daysSince(partner.last_reviewed_at)}d since review)`
                    : "Current"
                }
                className={partner.is_stale ? "text-gda-amber" : "text-gda-green"}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", className ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
