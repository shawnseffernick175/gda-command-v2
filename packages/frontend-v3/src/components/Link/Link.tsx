import { type AnchorHTMLAttributes, type ReactNode, forwardRef } from "react";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  external?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ children, external, className = "", ...props }, ref) => (
    <a
      ref={ref}
      className={[
        "text-accent hover:text-accent-hover underline-offset-2 hover:underline",
        "transition-colors duration-[var(--duration-state)]",
        "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
        className,
      ].join(" ")}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
    </a>
  )
);

Link.displayName = "Link";
