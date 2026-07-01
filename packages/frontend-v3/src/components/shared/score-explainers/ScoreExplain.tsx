"use client";

import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { getExplainer, type ScoreType, type ScoreInputs, type PeriodMode } from "./registry";

export interface ScoreExplainProps {
  score: number | string | null;
  label: string;
  scoreType: ScoreType;
  inputs?: ScoreInputs;
  periodMode?: PeriodMode;
  className?: string;
}

export function ScoreExplain({
  score,
  label,
  scoreType,
  inputs,
  periodMode,
  className,
}: ScoreExplainProps) {
  const explainer = getExplainer(scoreType);

  const description =
    typeof explainer.description === "function"
      ? explainer.description(periodMode)
      : explainer.description;

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
                  Definition
                </p>
                <p className="mt-0.5 text-foreground leading-relaxed">
                  {description}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
                  Calculation Method
                </p>
                <div className="mt-0.5 text-foreground leading-relaxed">
                  {explainer.renderFormula(inputs, periodMode)}
                </div>
              </div>

              {explainer.renderDataSources && (
                <div>
                  <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
                    Input Data
                  </p>
                  <div className="mt-0.5 text-foreground leading-relaxed">
                    {explainer.renderDataSources(periodMode)}
                  </div>
                </div>
              )}

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
