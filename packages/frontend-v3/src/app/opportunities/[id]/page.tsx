import { OpportunityByIdClient } from "./client";

/**
 * Canonical REST-style detail route: `/opportunities/<id>`.
 *
 * The app is a static export (`output: "export"`), so opportunity ids are not
 * known at build time. `output: export` requires at least one prerendered param,
 * so we emit a single inert placeholder page; real ids are served by the SPA
 * fallback (nginx serves the opportunities shell for `/opportunities/<id>`),
 * which then client-renders this route from the id in the path. The legacy
 * `/opportunities?id=<id>` query form still resolves to the same detail view.
 */
export function generateStaticParams(): { id: string }[] {
  // Placeholder only — never linked to. All real detail views render client-side
  // via the SPA fallback. `__placeholder__` cannot collide with a real numeric id.
  return [{ id: "__placeholder__" }];
}

export default function OpportunityByIdPage() {
  return <OpportunityByIdClient />;
}
