"use client";

import Link from "next/link";
import { usePartners } from "@/hooks/use-partners";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/error-state";

export default function PartnersPage() {
  const { data, isLoading, error } = usePartners();

  if (isLoading) {
    return (
      <div className="container-page py-8 space-y-6">
        <h1 className="text-display text-ink">Partner Intel</h1>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-page py-8">
        <ErrorState message="Failed to load partner profiles" />
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="container-page py-8 space-y-6">
      <div>
        <h1 className="text-display text-ink">Partner Intel</h1>
        <p className="text-body text-muted mt-1">
          Read-only teaming context for cross-OU collaboration
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {items.map((partner) => {
          const slug = partner.ou.replace(/_/g, "-");
          return (
            <Link key={partner.ou} href={`/partners/${slug}`}>
              <Card className="border-border bg-white hover:border-accent transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-section text-ink">
                      {partner.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {partner.stale && (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-normal border-critical/40 text-critical px-1.5 py-0"
                        >
                          Stale ({">"}90d)
                        </Badge>
                      )}
                      {!partner.active && (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-normal border-muted/40 text-muted px-1.5 py-0"
                        >
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-body text-ink line-clamp-2">
                    {partner.overview}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {partner.certifications.slice(0, 4).map((cert) => (
                      <Badge
                        key={cert}
                        variant="outline"
                        className="text-caption font-normal border-accent/30 text-accent px-1.5 py-0"
                      >
                        {cert}
                      </Badge>
                    ))}
                    {partner.certifications.length > 4 && (
                      <span className="text-caption text-muted">
                        +{partner.certifications.length - 4} more
                      </span>
                    )}
                  </div>
                  {partner.agencies_of_strength.length > 0 && (
                    <p className="text-caption text-muted">
                      Agencies: {partner.agencies_of_strength.join(", ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
