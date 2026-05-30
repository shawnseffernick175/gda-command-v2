import type { KeyboardShortcutHintProps } from '../../types';

export function KeyboardShortcutHint({ keys, label }: KeyboardShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-dim">
      {label && <span className="mr-1">{label}</span>}
      {keys.map((key, i) => (
        <kbd key={i} className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-sm border border-border bg-surface text-[10px] font-mono min-w-5 text-center">
          {key}
        </kbd>
      ))}
    </span>
  );
}
