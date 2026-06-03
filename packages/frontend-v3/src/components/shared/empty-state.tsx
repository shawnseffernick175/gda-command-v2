"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="border-dashed border-border bg-gda-panel/30">
      <CardContent className="py-12 text-center">
        <h3 className="font-mono text-sm font-medium text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        {actionLabel && onAction && (
          <Button
            size="sm"
            className="mt-4 bg-gda-green text-gda-bg-deep hover:bg-gda-green-muted"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
