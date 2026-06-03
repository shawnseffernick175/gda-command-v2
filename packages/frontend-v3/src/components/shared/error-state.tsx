"use client";

import { Button } from "@/components/ui/button";

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-md border border-gda-red/30 bg-gda-red/10 p-4">
      <p className="text-sm text-gda-red">{message}</p>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-gda-red hover:text-gda-red"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
