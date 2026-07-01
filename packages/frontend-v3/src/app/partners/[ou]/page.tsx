import { PartnerDetailClient } from "./partner-detail-client";

export function generateStaticParams() {
  return [{ ou: "riverstone" }, { ou: "pd-systems" }];
}

export default function PartnerDetailPage({
  params,
}: {
  params: { ou: string };
}) {
  return <PartnerDetailClient ou={params.ou} />;
}
