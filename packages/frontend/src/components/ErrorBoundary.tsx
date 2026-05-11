import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report to backend error endpoint
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1117",
          color: "#e4e4e7",
        }}>
          <div style={{
            textAlign: "center",
            maxWidth: 480,
            padding: 40,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#x26A0;</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{
              fontSize: 14,
              color: "#9ca3af",
              marginBottom: 24,
              lineHeight: 1.6,
            }}>
              An unexpected error occurred. This has been automatically reported.
            </p>
            {this.state.error && (
              <pre style={{
                background: "#1a1d27",
                border: "1px solid #2a2e3a",
                borderRadius: 8,
                padding: 16,
                fontSize: 12,
                color: "#ef4444",
                textAlign: "left",
                overflow: "auto",
                maxHeight: 160,
                marginBottom: 24,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "1px solid #2a2e3a",
                  background: "transparent",
                  color: "#9ca3af",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Go to Launchpad
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
