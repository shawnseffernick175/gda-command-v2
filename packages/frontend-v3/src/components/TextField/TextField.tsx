import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from "react";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "prefix"> {
  label?: string;
  error?: string;
  helper?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onChange?: (value: string) => void;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, helper, prefix, suffix, onChange, className = "", id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const helperId = `${inputId}-helper`;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-xs text-ink-muted">
            {label}
          </label>
        )}
        <div
          className={[
            "flex items-center h-8 rounded-sm border bg-surface px-2 text-sm",
            "transition-colors duration-[var(--duration-state)]",
            error
              ? "border-[1.5px] border-critical"
              : "border-border hover:border-border-strong focus-within:border-[1.5px] focus-within:border-accent",
          ].join(" ")}
        >
          {prefix && <span className="mr-2 text-ink-muted">{prefix}</span>}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error || helper ? helperId : undefined}
            className="flex-1 bg-transparent text-ink-primary placeholder:text-ink-dim outline-none"
            onChange={(e) => onChange?.(e.target.value)}
            {...props}
          />
          {suffix && <span className="ml-2 text-ink-muted">{suffix}</span>}
        </div>
        {(error || helper) && (
          <span
            id={helperId}
            className={`text-xs ${error ? "text-critical" : "text-ink-muted"}`}
          >
            {error || helper}
          </span>
        )}
      </div>
    );
  }
);

TextField.displayName = "TextField";
