"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AiAnalyzeModal({
  open,
  onOpenChange,
  analysis,
  generatedAt,
  isLoading,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: string | null;
  generatedAt: string | null;
  isLoading: boolean;
  title?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ? `AI Analysis — ${title}` : "CFO Analysis"}</DialogTitle>
          <DialogDescription>
            AI-generated financial analysis for Envision Innovative Solutions
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Analyzing financial data...
              </p>
              <div className="h-32 animate-pulse rounded bg-gda-skeleton" />
            </div>
          ) : analysis ? (
            <>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {analysis}
              </div>
              {generatedAt && (
                <p className="text-[12px] text-muted-foreground">
                  Generated{" "}
                  {new Date(generatedAt).toISOString().replace("T", " ").slice(0, 19)}{" "}
                  UTC
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No analysis available. Ensure financial data is loaded and try
              again.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
