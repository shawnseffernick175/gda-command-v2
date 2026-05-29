interface LaunchpadHeaderProps {
  dateStr: string;
}

export default function LaunchpadHeader({ dateStr }: LaunchpadHeaderProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: "#28251D",
          margin: 0,
          lineHeight: 1.2,
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        Launchpad
        <span
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: "#6b7280",
            marginLeft: 12,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {dateStr}
        </span>
      </h1>
      <p
        style={{
          margin: "4px 0 0 0",
          fontSize: 13,
          color: "#9ca3af",
          fontStyle: "italic",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        &ldquo;The standard you walk past is the standard you accept.&rdquo;
      </p>
    </div>
  );
}
