import * as Radix from "@radix-ui/react-radio-group";

export interface RadioOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  name: string;
}

export function RadioGroup<T extends string = string>({
  value,
  onChange,
  options,
  name,
}: RadioGroupProps<T>) {
  return (
    <Radix.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      name={name}
      className="flex flex-col gap-2"
    >
      {options.map((opt) => (
        <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer">
          <Radix.Item
            value={opt.value}
            disabled={opt.disabled}
            className={[
              "h-4 w-4 rounded-full border border-border bg-surface",
              "hover:border-border-strong",
              "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
              "disabled:opacity-40 disabled:pointer-events-none",
              "data-[state=checked]:border-accent",
            ].join(" ")}
          >
            <Radix.Indicator className="flex items-center justify-center">
              <span className="block h-2 w-2 rounded-full bg-accent" />
            </Radix.Indicator>
          </Radix.Item>
          <span className="text-sm text-ink-primary">{opt.label}</span>
        </label>
      ))}
    </Radix.Root>
  );
}
