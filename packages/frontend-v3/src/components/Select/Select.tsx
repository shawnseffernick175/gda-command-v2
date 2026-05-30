import { useId } from "react";
import * as RadixSelect from "@radix-ui/react-select";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  label?: string;
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Select<T extends string = string>({
  label,
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled,
}: SelectProps<T>) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs text-ink-muted">
          {label}
        </label>
      )}
      <RadixSelect.Root
        {...(value != null ? { value } : {})}
        onValueChange={(v) => onChange(v as T)}
        disabled={disabled ?? false}
      >
        <RadixSelect.Trigger
          id={id}
          className={[
            "inline-flex items-center justify-between h-8 rounded-sm border border-border",
            "bg-surface px-2 text-sm text-ink-primary",
            "hover:border-border-strong focus:outline-[1.5px] focus:outline-accent focus:outline-offset-2",
            "disabled:opacity-40 disabled:pointer-events-none",
            "data-[placeholder]:text-ink-dim",
          ].join(" ")}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="ml-2 text-ink-muted">▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            className="overflow-hidden rounded-md border border-border bg-surface-raised max-h-60"
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled ?? false}
                  className={[
                    "flex items-center h-8 px-2 rounded-sm text-sm text-ink-primary cursor-pointer",
                    "hover:bg-surface focus:bg-surface outline-none",
                    "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
                  ].join(" ")}
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="ml-auto text-accent">
                    ✓
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
