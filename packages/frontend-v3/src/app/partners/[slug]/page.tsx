import { PartnerDetailClient } from "./PartnerDetailClient";

export function generateStaticParams() {
  return [{ slug: "riverstone" }, { slug: "pd-systems" }];
}

export default function PartnerDetailPage() {
  return <PartnerDetailClient />;
}
