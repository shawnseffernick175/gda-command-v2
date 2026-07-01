"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { usePartnerProfile } from "@/hooks/use-partners";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ErrorState } from "@/components/shared/error-state";
import type {
  CapabilitySummary,
  PastPerformanceEntry,
  KeyPersonnel,
} from "@/hooks/use-partners";

function formatDate(iso: string | null): string {
  if (!iso) return "---";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export default function PartnerDetailPage() {
  const params = useParams();
  const ou = params.ou as string;
  const { data: profile, isLoading, error } = usePartnerProfile(ou);

  if (isLoading) {
    return (
      <div className="container-page py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container-page py-8">
        <ErrorState message="Failed to load partner profile" />
      </div>
    );
  }

  const capabilities = (profile.capabilities_summary ?? []) as CapabilitySummary[];
  const pastPerformance = (profile.past_performance_summary ?? []) as PastPerformanceEntry[];
  const personnel = (profile.key_personnel ?? []) as KeyPersonnel[];

  return (
    <div className="container-page py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/partners"
              className="text-caption text-accent hover:underline"
            >
              Partner Intel
            </Link>
            <span className="text-caption text-muted">/</span>
          </div>
          <h1 className="text-display text-ink mt-1">{profile.name}</h1>
          <p className="text-body text-muted mt-1">
            Read-only teaming context — Envision cannot edit
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.stale && (
            <Badge
              variant="outline"
              className="text-[11px] font-normal border-critical/40 text-critical px-1.5 py-0"
            >
              Stale — last reviewed {formatDate(profile.last_reviewed_at)}
            </Badge>
          )}
          {!profile.stale && (
            <Badge
              variant="outline"
              className="text-[11px] font-normal border-accent/40 text-accent px-1.5 py-0"
            >
              Reviewed {formatDate(profile.last_reviewed_at)}
            </Badge>
          )}
        </div>
      </div>

      {/* Overview Card */}
      <Card className="border-border bg-white border-l-4 border-l-accent">
        <CardContent className="pt-6">
          <p className="text-body text-ink">{profile.overview}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Capabilities */}
        <Card className="border-border bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink">
              Capabilities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {capabilities.map((cap) => (
              <div key={cap.area}>
                <p className="text-body text-ink font-medium">{cap.area}</p>
                <p className="text-caption text-muted">{cap.description}</p>
              </div>
            ))}
            {capabilities.length === 0 && (
              <p className="text-caption text-muted">No capabilities listed</p>
            )}
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card className="border-border bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink">
              Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.certifications.map((cert) => (
                <Badge
                  key={cert}
                  variant="outline"
                  className="text-caption font-normal border-accent/30 text-accent px-2 py-0.5"
                >
                  {cert}
                </Badge>
              ))}
              {profile.certifications.length === 0 && (
                <p className="text-caption text-muted">
                  No certifications listed
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Past Performance */}
        <Card className="border-border bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink">
              Past Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pastPerformance.map((pp, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between">
                  <p className="text-body text-ink font-medium">{pp.agency}</p>
                  <span className="text-caption text-muted">{pp.period}</span>
                </div>
                <p className="text-caption text-muted">
                  {pp.contract_id} — {pp.value}
                </p>
              </div>
            ))}
            {pastPerformance.length === 0 && (
              <p className="text-caption text-muted">
                No past performance entries
              </p>
            )}
          </CardContent>
        </Card>

        {/* Key Personnel */}
        <Card className="border-border bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink">
              Key Personnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {personnel.map((person, idx) => (
              <div key={idx}>
                <p className="text-body text-ink font-medium">{person.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-caption text-muted">
                    {person.clearance}
                  </span>
                  {person.certifications.length > 0 && (
                    <>
                      <Separator orientation="vertical" className="h-3" />
                      <span className="text-caption text-muted">
                        {person.certifications.join(", ")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
            {personnel.length === 0 && (
              <p className="text-caption text-muted">No personnel listed</p>
            )}
          </CardContent>
        </Card>

        {/* Agencies of Strength */}
        <Card className="border-border bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink">
              Agencies of Strength
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.agencies_of_strength.map((agency) => (
                <Badge
                  key={agency}
                  variant="outline"
                  className="text-caption font-normal border-border text-ink px-2 py-0.5"
                >
                  {agency}
                </Badge>
              ))}
              {profile.agencies_of_strength.length === 0 && (
                <p className="text-caption text-muted">No agencies listed</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* NAICS Codes */}
        <Card className="border-border bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink">
              NAICS Codes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.naics_codes.map((code) => (
                <Badge
                  key={code}
                  variant="outline"
                  className="text-caption font-normal border-border text-ink px-2 py-0.5"
                >
                  {code}
                </Badge>
              ))}
              {profile.naics_codes.length === 0 && (
                <p className="text-caption text-muted">No NAICS codes listed</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
