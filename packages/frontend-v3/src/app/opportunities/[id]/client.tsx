"use client";

import { useParams, usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveOpportunityId } from "@/lib/opportunity-route";
import { OpportunityDetail } from "../page";

/**
 * Client half of the `/opportunities/[id]` route. Renders the shared
 * OpportunityDetail — the same component the `?id=` alias uses on the
 * `/opportunities` page — so a single-opportunity view is identical from every
 * entry point.
 *
 * The app is a static export, so this dynamic route is prerendered from a single
 * build-time placeholder param (`generateStaticParams → __placeholder__`) and the
 * real id is served by the SPA fallback. On that fallback `useParams()` can return
 * the prerendered sentinel `__placeholder__` rather than the real path segment, so
 * the id is resolved from the actual URL (`usePathname()`, which reflects
 * `window.location`) with the param only as a fallback — see `resolveOpportunityId`.
 */
export function OpportunityByIdClient() {
  const params = useParams<{ id: string | string[] }>();
  const pathname = usePathname();

  const id = resolveOpportunityId(pathname, params?.id);

  if (!id) return <Skeleton className="h-8 w-64 bg-gda-panel" />;
  return <OpportunityDetail key={id} id={id} />;
}
