import type { ButtonProps } from '../../types';

const variantClasses: Record<ButtonProps['variant'], string> = {
  primary:
    'bg-accent text-white border-accent hover:bg-accent-hover active:bg-accent-pressed',
  secondary:
    'bg-transparent text-ink-primary border-border hover:bg-surface active:bg-surface-raised',
  ghost:
    'bg-transparent text-ink-muted border-transparent hover:bg-surface active:bg-surface-raised',
  danger:
    'bg-transparent text-critical border-critical hover:bg-critical hover:text-white active:bg-critical-hover active:text-white',
};

export function Button({
  variant,
  size = 'md',
  disabled = false,
  loading = false,
  iconLeft,
  iconRight,
  children,
  onClick,
}: ButtonProps) {
  const h = size === 'sm' ? 'h-7' : 'h-8';
  const px = iconLeft || iconRight ? 'px-3' : 'px-4';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-sm border font-medium text-sm transition-colors duration-[var(--duration-state)] ${h} ${px} ${variantClasses[variant]} ${disabled || loading ? 'opacity-40 pointer-events-none' : ''}`}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />}
      {!loading && iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}
