import type { CardProps } from '../../types';

const paddingMap = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };

export function Card({
  variant = 'default',
  bannerSeverity,
  clickable = false,
  onClick,
  padding = 'md',
  children,
}: CardProps) {
  const base = 'rounded-md border border-border bg-surface';
  const hover = clickable ? 'cursor-pointer hover:bg-surface-raised transition-colors duration-[var(--duration-state)]' : '';
  const banner =
    variant === 'banner'
      ? bannerSeverity === 'critical'
        ? 'border-l-4 border-l-critical'
        : 'border-l-4 border-l-accent'
      : '';

  return (
    <div
      className={`${base} ${paddingMap[padding]} ${hover} ${banner}`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {children}
    </div>
  );
}
