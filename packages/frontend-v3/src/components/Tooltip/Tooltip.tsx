import * as RadixTooltip from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";

export interface TooltipProps {
  content: string | ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
  children: ReactNode;
}

export function Tooltip({ content, side = "top", delay = 300, children }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delay}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={4}
            className={[
              "rounded-sm border border-border-strong bg-surface-raised",
              "px-2 py-1 text-xs text-ink-primary max-w-60 z-50",
            ].join(" ")}
          >
            {content}
            <RadixTooltip.Arrow className="fill-surface-raised" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
