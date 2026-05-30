import * as RadixDialog from "@radix-ui/react-dialog";
import { type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
}

const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };

export function Dialog({ open, onClose, title, size = "md", children, footer }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-canvas/60 z-40" />
        <RadixDialog.Content
          className={[
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
            "w-full rounded-md border border-border bg-surface-raised p-6",
            "animate-[fadeIn_120ms_ease-out]",
            sizes[size],
          ].join(" ")}
        >
          <div className="flex items-center justify-between mb-4">
            <RadixDialog.Title className="text-md font-semibold text-ink-primary">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close className="text-ink-muted hover:text-ink-primary text-lg">
              ×
            </RadixDialog.Close>
          </div>
          <div className="text-sm text-ink-primary">{children}</div>
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
