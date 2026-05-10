import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        GDA Command Center
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 32 }}>
        Shawn's operating system for Golden Dome / GDA business development,
        capture, competitive intelligence, opportunity management, and platform
        health.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        <Card
          title="QA Center"
          description="Platform health checks, smoke tests, and latest failures."
          to="/qa-center"
          statusColor="var(--color-success)"
        />
        <Card
          title="Ops Tracker"
          description="Opportunity discovery and operator management."
          to="/ops-tracker"
          statusColor="var(--color-text-muted)"
          upcoming
        />
        <Card
          title="Pipeline"
          description="Read-only view of qualified opportunities."
          to="/pipeline"
          statusColor="var(--color-text-muted)"
          upcoming
        />
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  to,
  statusColor,
  upcoming,
}: {
  title: string;
  description: string;
  to: string;
  statusColor: string;
  upcoming?: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        padding: 20,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--color-surface-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--color-surface)")
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor,
            display: "inline-block",
          }}
        />
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
        {upcoming && (
          <span style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            background: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}>
            upcoming
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
        {description}
      </p>
    </Link>
  );
}
