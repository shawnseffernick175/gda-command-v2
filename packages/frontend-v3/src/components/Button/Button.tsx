import { type ReactNode, type ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
}

const variantClasses: Record<ButtonProps["variant"], string> = {
  primary:
    "bg-accent text-white border-accent hover:bg-accent-hover active:bg-accent-pressed",
  secondary:
    "bg-transparent text-ink-primary border-border hover:bg-surface active:bg-surface-raised",
  ghost:
    "bg-transparent text-ink-muted border-transparent hover:bg-surface active:bg-surface-raised",
  danger:
    "bg-transparent text-critical border-critical hover:bg-critical hover:text-white active:bg-critical-hover active:text-white",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant,
      size = "md",
      loading,
      disabled,
      iconLeft,
      iconRight,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const height = size === "sm" ? "h-7" : "h-8";
    const padding = iconLeft || iconRight ? "px-3" : "px-4";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-disabled={disabled || loading || undefined}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-sm border text-sm font-medium",
          "transition-colors duration-[var(--duration-state)]",
          "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
          "disabled:opacity-40 disabled:pointer-events-none",
          height,
          padding,
          variantClasses[variant],
          className,
        ].join(" ")}
        {...props}
      >
        {loading && <span className="animate-spin text-xs">⟳</span>}
        {!loading && iconLeft}
        {children}
        {!loading && iconRight}
      </button>
    );
  }
);

Button.displayName = "Button";
