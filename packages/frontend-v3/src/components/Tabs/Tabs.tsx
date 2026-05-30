import * as RadixTabs from "@radix-ui/react-tabs";
import { type ReactNode } from "react";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
}

export function Tabs({ items, value, onChange, defaultValue }: TabsProps) {
  return (
    <RadixTabs.Root
      {...(value != null ? { value } : {})}
      {...(onChange != null ? { onValueChange: onChange } : {})}
      defaultValue={defaultValue ?? items[0]?.value ?? ""}
    >
      <RadixTabs.List className="flex gap-4 border-b border-border">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={[
              "px-1 pb-2 text-sm font-medium text-ink-muted",
              "border-b-2 border-transparent",
              "hover:text-ink-primary",
              "data-[state=active]:text-ink-primary data-[state=active]:border-accent",
              "focus-visible:outline-[1.5px] focus-visible:outline-accent focus-visible:outline-offset-2",
            ].join(" ")}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} className="pt-4">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
