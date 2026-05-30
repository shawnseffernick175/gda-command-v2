import type { LinkProps } from '../../types';

export function Link({ href, external = false, children, className = '' }: LinkProps) {
  return (
    <a
      href={href}
      className={`text-accent hover:text-accent-hover underline transition-colors duration-[var(--duration-state)] ${className}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
