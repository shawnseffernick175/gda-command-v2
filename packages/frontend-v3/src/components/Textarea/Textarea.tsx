import { type TextareaHTMLAttributes, forwardRef, useId } from "react";

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  label?: string;
  error?: string;
  helper?: string;
  onChange?: (value: string) => void;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, onChange, className = "", id, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id || autoId;
    const helperId = `${textareaId}-helper`;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label htmlFor={textareaId} className="text-xs text-ink-muted">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error || helper ? helperId : undefined}
          className={[
            "rounded-sm border bg-surface px-2 py-2 text-sm text-ink-primary",
            "placeholder:text-ink-dim outline-none resize-y min-h-20",
            "transition-colors duration-[var(--duration-state)]",
            error
              ? "border-[1.5px] border-critical"
              : "border-border hover:border-border-strong focus:border-[1.5px] focus:border-accent",
          ].join(" ")}
          onChange={(e) => onChange?.(e.target.value)}
          {...props}
        />
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

Textarea.displayName = "Textarea";
