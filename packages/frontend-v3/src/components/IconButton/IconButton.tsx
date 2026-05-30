import { type ReactNode, type ButtonHTMLAttributes, forwardRef } from "react";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: "secondary" | "ghost";
  size?: "sm" | "md";
  "aria-label": string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", size = "md", children, className = "", ...props }, ref) => {
    const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
    const bg =
      variant === "secondary"
        ? "border-border hover:bg-surface"
        : "border-transparent hover:bg-surface";

    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center rounded-sm border text-ink-muted",
          "transition-colors duration-[var(--duration-state)]",
          "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
          "disabled:opacity-40 disabled:pointer-events-none",
          dim,
          bg,
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
