"use client";

import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { getExplainer, type ScoreType, type ScoreInputs } from "./registry";

export interface ScoreExplainProps {
  score: number | string | null;
  label: string;
  scoreType: ScoreType;
  inputs?: ScoreInputs;
  className?: string;
}

export function ScoreExplain({
  score,
  label,
  scoreType,
  inputs,
  className,
}: ScoreExplainProps) {
  const explainer = getExplainer(scoreType);

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground hover:bg-gda-panel cursor-pointer",
              className,
            )}
            aria-label={`Explain ${label}`}
          />
        }
      >
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-[100]">
          <Popover.Popup className="z-[100] w-72 rounded border border-border bg-gda-bg-raised p-3 text-xs shadow-lg">
            <p className="font-mono font-bold text-foreground">{label}</p>

            {score != null && (
              <p className="mt-1 text-muted-foreground">
                Value:{" "}
                <span className="font-mono text-foreground">{score}</span>
              </p>
            )}

            <div className="mt-2 space-y-2">
              <div>
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
                  What this measures
                </p>
                <p className="mt-0.5 text-foreground leading-relaxed">
                  {explainer.description}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
                  {"How it\u2019s calculated"}
                </p>
                <div className="mt-0.5 text-foreground leading-relaxed">
                  {explainer.renderFormula(inputs)}
                </div>
              </div>

              {inputs && explainer.renderInputs && (
                <div>
                  <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
                    For this item
                  </p>
                  <div className="mt-0.5 text-foreground leading-relaxed">
                    {explainer.renderInputs(inputs, score)}
                  </div>
                </div>
              )}

              {score != null && (
                <p className="text-muted-foreground border-t border-border pt-1.5 mt-1.5">
                  Final score:{" "}
                  <span className="font-mono font-bold text-foreground">
                    {score}
                  </span>
                </p>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
