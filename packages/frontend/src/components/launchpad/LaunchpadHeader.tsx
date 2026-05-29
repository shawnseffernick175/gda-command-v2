interface LaunchpadHeaderProps {
  dateStr: string;
}

export default function LaunchpadHeader({ dateStr }: LaunchpadHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="h-display text-ink m-0">
        Launchpad
        <span className="text-body font-normal text-muted ml-3 num">
          {dateStr}
        </span>
      </h1>
      <p className="doctrine-tag mt-1 m-0">
        &ldquo;The standard you walk past is the standard you accept.&rdquo;
      </p>
    </div>
  );
}
