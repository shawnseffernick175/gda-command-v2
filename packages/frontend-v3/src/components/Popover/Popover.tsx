import * as RadixPopover from "@radix-ui/react-popover";
import { type ReactNode } from "react";

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function Popover({ trigger, children, side = "bottom", align = "center" }: PopoverProps) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={4}
          className={[
            "rounded-md border border-border bg-surface-raised p-4",
            "text-sm text-ink-primary z-50",
            "animate-[fadeIn_120ms_ease-out]",
          ].join(" ")}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
