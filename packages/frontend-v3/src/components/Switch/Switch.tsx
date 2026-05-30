import * as RadixSwitch from "@radix-ui/react-switch";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={[
          "relative h-5 w-9 rounded-full border border-border bg-surface",
          "transition-colors duration-[var(--duration-state)]",
          "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
          "disabled:opacity-40 disabled:pointer-events-none",
          "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
        ].join(" ")}
      >
        <RadixSwitch.Thumb
          className={[
            "block h-4 w-4 rounded-full bg-white",
            "transition-transform duration-[var(--duration-state)]",
            "translate-x-0.5 data-[state=checked]:translate-x-[18px]",
          ].join(" ")}
        />
      </RadixSwitch.Root>
      <span className="text-sm text-ink-primary">{label}</span>
    </label>
  );
}
