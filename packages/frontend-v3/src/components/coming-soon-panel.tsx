"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ComingSoonPanel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed border-border bg-gda-panel/50">
      <CardHeader>
        <CardTitle className="font-mono text-sm text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {description ??
            "Coming soon — pending real intelligence layer"}
        </p>
      </CardContent>
    </Card>
  );
}
