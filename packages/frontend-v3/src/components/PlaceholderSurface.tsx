import { useLocation, useParams } from "react-router-dom";

interface PlaceholderSurfaceProps {
  name: string;
}

export function PlaceholderSurface({ name }: PlaceholderSurfaceProps) {
  const location = useLocation();
  const params = useParams();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="text-sm opacity-60">
        {location.pathname}
        {location.search}
      </p>
      {Object.keys(params).length > 0 && (
        <pre className="rounded border px-4 py-2 text-xs opacity-50">
          {JSON.stringify(params, null, 2)}
        </pre>
      )}
    </div>
  );
}
