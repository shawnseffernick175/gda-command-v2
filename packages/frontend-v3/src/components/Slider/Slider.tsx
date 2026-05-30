import * as RadixSlider from "@radix-ui/react-slider";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  disabled?: boolean;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  disabled,
}: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-ink-muted">{label}</span>}
      <RadixSlider.Root
        value={[value]}
        onValueChange={([v]) => { if (v !== undefined) onChange(v); }}
        min={min}
        max={max}
        step={step}
        disabled={disabled ?? false}
        className="relative flex items-center h-5 w-full select-none touch-none"
      >
        <RadixSlider.Track className="relative h-1 grow rounded-full bg-border">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          className={[
            "block h-4 w-4 rounded-full bg-accent border-2 border-accent",
            "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
            "disabled:opacity-40",
          ].join(" ")}
        />
      </RadixSlider.Root>
    </div>
  );
}
