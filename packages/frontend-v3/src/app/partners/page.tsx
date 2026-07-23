"use client";

import Link from "next/link";
import {
  usePartners,
  type PartnerListItem,
} from "@/hooks/use-partners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

const OU_SLUGS: Record<string, string> = {
  riverstone: "riverstone",
  pd_systems: "pd-systems",
};

export default function PartnersPage() {
  const { data, isLoading, error } = usePartners();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="font-mono text-lg font-bold text-foreground">Partner Profiles</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={(error as Error).message} />;

  const partners = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="shrink-0 font-mono text-lg font-bold text-foreground">
          Partner Profiles
        </h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Read-only teaming context for Envision. Profiles are maintained by each OU lead.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {partners.map((p) => (
          <PartnerCard key={p.ou} partner={p} />
        ))}
      </div>
    </div>
  );
}

function PartnerCard({ partner }: { partner: PartnerListItem }) {
  const slug = OU_SLUGS[partner.ou] ?? partner.ou;

  return (
    <Link href={`/partners/${slug}`}>
      <Card className="border-border bg-gda-panel hover:border-gda-cyan/40 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-sm text-foreground">
              {partner.name}
            </CardTitle>
            <div className="flex items-center gap-2">
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
                  STALE
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {partner.overview}
          </p>

          <div className="space-y-1">
            <span className="font-mono text-[12px] uppercase text-muted-foreground">
              Certifications
            </span>
            <div className="flex flex-wrap gap-1">
              {partner.certifications.map((cert) => (
                <Badge
                  key={cert}
                  variant="outline"
                  className="border-border text-[12px] font-mono text-foreground"
                >
                  {cert}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="font-mono text-[12px] uppercase text-muted-foreground">
              Agencies of Strength
            </span>
            <p className="text-xs text-foreground font-mono">
              {partner.agencies_of_strength.join(", ") || "---"}
            </p>
          </div>

          <p className="text-[12px] text-muted-foreground font-mono">
            Last reviewed: {new Date(partner.last_reviewed_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
