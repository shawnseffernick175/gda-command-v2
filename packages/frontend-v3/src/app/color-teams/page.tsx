"use client";

import dynamic from "next/dynamic";

const ColorTeamsContent = dynamic(
  () =>
    import("@/components/color-teams/ColorTeamsContent").then(
      (m) => m.ColorTeamsContent,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading Color Team Reviews...</p>
      </div>
    ),
  },
);

export default function ColorTeamsPage() {
  return <ColorTeamsContent />;
}
