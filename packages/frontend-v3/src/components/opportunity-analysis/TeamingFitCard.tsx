"use client";

import Link from "next/link";
import { useTeamingFit, type TeamingFitResult } from "@/hooks/use-partners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TeamingFitCardProps {
  opportunityId: string | undefined;
}

function FitScoreBadge({ score }: { score: number }) {
  const variant =
    score >= 50
      ? "border-accent/40 text-accent"
      : score >= 25
        ? "border-border text-ink"
        : "border-border text-muted";
  return (
    <Badge
      variant="outline"
      className={`text-[11px] font-medium tabular-nums px-1.5 py-0 ${variant}`}
    >
      {score}%
    </Badge>
  );
}

function FitRow({ fit }: { fit: TeamingFitResult }) {
  const slug = fit.ou.replace(/_/g, "-");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Link
          href={`/partners/${slug}`}
          className="text-body text-accent font-medium hover:underline"
        >
          {fit.partner_name}
        </Link>
        <FitScoreBadge score={fit.fit_score} />
      </div>
      <ul className="space-y-0.5">
        {fit.reasons.map((reason, idx) => (
          <li key={idx} className="text-caption text-muted">
            {reason}
          </li>
        ))}
      </ul>
      {fit.cited_evidence.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {fit.cited_evidence.map((ev, idx) => (
            <Badge
              key={idx}
              variant="outline"
              className="text-[11px] font-normal border-border text-muted px-1 py-0"
            >
              {ev.value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamingFitCard({ opportunityId }: TeamingFitCardProps) {
  const { data, isLoading, error } = useTeamingFit(opportunityId);

  if (isLoading) {
    return (
      <Card className="border-border bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-ink">
            Teaming Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null;
  }

  const fits = data?.fits ?? [];

  if (fits.length === 0) {
    return (
      <Card className="border-border bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-ink">
            Teaming Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-caption text-muted">
            No teaming fit identified — Envision can pursue solo
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-white border-l-4 border-l-accent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-ink">
          Teaming Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fits.map((fit) => (
          <FitRow key={fit.ou} fit={fit} />
        ))}
        <Link
          href="/partners"
          className="text-caption text-accent hover:underline block mt-2"
        >
          View all partner profiles →
        </Link>
      </CardContent>
    </Card>
  );
}
