import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "calc(100vh - 200px)",
      padding: 40,
    }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: "#3b82f6", marginBottom: 8 }}>404</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "var(--color-text)" }}>
          Page not found
        </h1>
        <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 28, lineHeight: 1.6 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          style={{
            display: "inline-block",
            padding: "10px 28px",
            borderRadius: 8,
            background: "#3b82f6",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to Launchpad
        </Link>
      </div>
    </div>
  );
}
