import type { IconButtonProps } from '../../types';

const variantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
  secondary: 'bg-transparent text-ink-primary border-border hover:bg-surface active:bg-surface-raised',
  ghost: 'bg-transparent text-ink-muted border-transparent hover:bg-surface active:bg-surface-raised',
};

export function IconButton({
  icon,
  'aria-label': ariaLabel,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onClick,
}: IconButtonProps) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-sm border transition-colors duration-[var(--duration-state)] ${dim} ${variantClasses[variant]} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
