"use client";

import { Card, CardContent } from "@/components/ui/card";

export function PendingState({
  surface,
  reason,
}: {
  surface: string;
  reason?: string;
}) {
  return (
    <Card className="border-dashed border-border bg-gda-panel/30">
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-gda-bg-base">
          <span className="text-lg text-muted-foreground">...</span>
        </div>
        <h3 className="font-mono text-sm font-medium text-foreground">
          {surface} — Pending
        </h3>
        <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
          {reason ??
            "Activates with the intelligence layer. Real data will appear here once the backend integration is complete."}
        </p>
      </CardContent>
    </Card>
  );
}
