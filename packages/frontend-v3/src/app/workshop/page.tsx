"use client";

import dynamic from "next/dynamic";

const WorkshopContent = dynamic(
  () =>
    import("@/components/workshop/WorkshopContent").then(
      (m) => m.WorkshopContent,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading Workshop...</p>
      </div>
    ),
  },
);

export default function WorkshopPage() {
  return <WorkshopContent />;
}
