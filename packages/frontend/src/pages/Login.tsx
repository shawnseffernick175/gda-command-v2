import { useState } from "react";
import { login, register } from "../api/auth";

interface LoginProps {
  onAuth: () => void;
}

export default function Login({ onAuth }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result =
      mode === "login"
        ? await login(email, password)
        : await register(email, password, displayName);

    setLoading(false);
    if (result.success) {
      onAuth();
    } else {
      setError(result.error ?? "Unknown error");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      }}
    >
      <div
        style={{
          width: 400,
          background: "#1e293b",
          borderRadius: 12,
          padding: 32,
          boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
          border: "1px solid #334155",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ color: "#e2e8f0", fontSize: 24, margin: 0 }}>
            GDA Command
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 4 }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  color: "#e2e8f0",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
                placeholder="Your name"
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 4 }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#e2e8f0",
                fontSize: 14,
                boxSizing: "border-box",
              }}
              placeholder="you@company.com"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 4 }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#e2e8f0",
                fontSize: 14,
                boxSizing: "border-box",
              }}
              placeholder="Min 6 characters"
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1px solid #ef4444",
                borderRadius: 6,
                padding: "8px 12px",
                marginBottom: 16,
                color: "#fca5a5",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 0",
              background: loading ? "#334155" : "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <div
          style={{ textAlign: "center", marginTop: 16, color: "#94a3b8", fontSize: 13 }}
        >
          {mode === "login" ? (
            <>
              No account?{" "}
              <button
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#3b82f6",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                }}
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#3b82f6",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                }}
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
