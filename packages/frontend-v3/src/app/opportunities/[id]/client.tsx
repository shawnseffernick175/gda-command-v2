"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { OpportunityDetail } from "../page";

/**
 * Client half of the `/opportunities/[id]` route. Reads the id from the path and
 * renders the shared OpportunityDetail — the same component the `?id=` alias uses
 * on the `/opportunities` page — so a single-opportunity view is identical from
 * every entry point.
 */
export function OpportunityByIdClient() {
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (!id) return <Skeleton className="h-8 w-64 bg-gda-panel" />;
  return <OpportunityDetail key={id} id={id} />;
}
