import type { SkeletonProps } from '../../types';

export function Skeleton({ width, height, lines = 1, variant = 'text' }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-ink-dim/20 rounded-sm';
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  if (variant === 'circle') {
    return <div className={`${baseClasses} rounded-full`} style={{ ...style, width: style.width || '32px', height: style.height || '32px' }} />;
  }

  if (variant === 'rect') {
    return <div className={baseClasses} style={{ ...style, width: style.width || '100%', height: style.height || '48px' }} />;
  }

  return (
    <div className="flex flex-col gap-2" style={{ width: style.width || '100%' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={baseClasses} style={{ height: '12px', width: i === lines - 1 && lines > 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}
