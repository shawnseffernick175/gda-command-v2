import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Canonical URL for a single opportunity's detail view. Every single-opportunity
 * affordance should route through this so a click opens the same deep-linkable,
 * shareable detail page from anywhere in the tool.
 *
 * Canonical form is the REST-style path `/opportunities/<id>`, served by the
 * `app/opportunities/[id]` route. The legacy `/opportunities?id=<id>` query form
 * still resolves to the same detail view (handled on the `/opportunities` page),
 * so older links/bookmarks keep working. Centralizing the shape here means there
 * is a single place that defines how an opportunity is opened.
 */
export function opportunityHref(id: string | number | null | undefined): string {
  if (id == null || id === "") return "/opportunities";
  return `/opportunities/${encodeURIComponent(String(id))}`;
}

type OpportunityLinkProps = {
  id: string | number;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "children" | "id">;

/**
 * Reusable link that opens an opportunity's canonical detail view. Use in place
 * of hand-written `<Link href={`/opportunities?id=...`}>` so click-through is
 * uniform everywhere.
 */
export function OpportunityLink({ id, children, ...rest }: OpportunityLinkProps) {
  return (
    <Link href={opportunityHref(id)} {...rest}>
      {children}
    </Link>
  );
}
