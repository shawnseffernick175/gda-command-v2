import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AskAIChatProps {
  opportunityId: string;
  opportunityTitle: string;
}

export default function AskAIChat({ opportunityId, opportunityTitle }: AskAIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/opportunity-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          question: userMsg.content,
          history: messages.slice(-6),
        }),
      });
      const data = await res.json();
      const answer = data?.data?.answer ?? data?.answer ?? "I couldn't generate an answer. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error connecting to AI service. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "14px 20px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-surface)")}
      >
        <span style={{ fontSize: 20 }}>💬</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
            Ask AI about this opportunity
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Ask questions about {opportunityTitle} — competitive analysis, strategy, pricing, past performance, and more.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💬</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Ask AI about {opportunityTitle}</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          Collapse
        </button>
      </div>

      <div style={{
        height: 280,
        overflowY: "auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        {messages.length === 0 && (
          <div style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>
            Ask me anything about this opportunity. Examples:
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                "What's the incumbent's biggest weakness?",
                "What past performance should we highlight?",
                "What's our competitive advantage here?",
                "Draft an executive summary for the proposal",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  style={{
                    background: "rgba(59,130,246,0.08)",
                    border: "1px solid rgba(59,130,246,0.2)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "#60a5fa",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "8px 12px",
              borderRadius: 8,
              background: msg.role === "user" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
              color: "var(--color-text)",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", color: "var(--color-text-muted)", fontSize: 13 }}>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        borderTop: "1px solid var(--color-border)",
        padding: 12,
        display: "flex",
        gap: 8,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask a question about this opportunity..."
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: loading || !input.trim() ? "rgba(59,130,246,0.3)" : "#3b82f6",
            color: "#fff",
            cursor: loading || !input.trim() ? "default" : "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
