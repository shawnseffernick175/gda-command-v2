import * as RadixCheckbox from "@radix-ui/react-checkbox";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  indeterminate?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled, indeterminate }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <RadixCheckbox.Root
        checked={indeterminate ? "indeterminate" : checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className={[
          "h-4 w-4 rounded-sm border border-border bg-surface",
          "hover:border-border-strong",
          "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
          "disabled:opacity-40 disabled:pointer-events-none",
          "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
          "data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent",
        ].join(" ")}
      >
        <RadixCheckbox.Indicator className="flex items-center justify-center text-white text-xs">
          {indeterminate ? "−" : "✓"}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className="text-sm text-ink-primary">{label}</span>
    </label>
  );
}
