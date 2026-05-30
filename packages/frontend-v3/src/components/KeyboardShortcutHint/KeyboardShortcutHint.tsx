export interface KeyboardShortcutHintProps {
  keys: string[];
}

export function KeyboardShortcutHint({ keys }: KeyboardShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, i) => (
        <kbd
          key={i}
          className={[
            "inline-flex items-center justify-center min-w-5 h-5 px-1",
            "rounded-sm border border-border bg-surface text-xs text-ink-muted font-mono",
          ].join(" ")}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
