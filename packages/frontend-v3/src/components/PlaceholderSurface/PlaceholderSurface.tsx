import { useLocation } from "react-router-dom";

interface PlaceholderSurfaceProps {
  name: string;
}

export function PlaceholderSurface({ name }: PlaceholderSurfaceProps) {
  const location = useLocation();

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-ink-primary">{name}</h1>
      <p className="text-sm text-ink-muted font-mono">{location.pathname}</p>
    </div>
  );
}
