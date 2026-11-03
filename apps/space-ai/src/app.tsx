import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { SpaceAgent } from "./server";

function MessageParts({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      <div className="message-bubble">
        {message.parts.map((part, index) => {
          if (part.type === "text" && part.text.trim()) {
            return <p key={index}>{part.text}</p>;
          }

          if (isToolUIPart(part)) {
            return (
              <details className="tool-event" key={index}>
                <summary>{part.type.replace("tool-", "")} · {part.state}</summary>
                <pre>{JSON.stringify(part, null, 2)}</pre>
              </details>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agent = useAgent<SpaceAgent>({
    agent: "SpaceAgent",
    onOpen: useCallback(() => {
      setConnected(true);
      setError("");
    }, []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(() => {
      setConnected(false);
      setError("Koneksi ke space terputus. Periksa jaringan dan status deployment.");
    }, [])
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({ agent });

  const busy = status === "streaming" || status === "submitted";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text || !connected || busy) return;

    setDraft("");
    setError("");
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }]
    });
  };

  const clear = () => {
    if (!window.confirm("Hapus riwayat percakapan untuk agent ini? Catatan proyek yang disimpan terpisah tidak ikut dihapus.")) {
      return;
    }
    clearHistory();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">s</div>
          <div>
            <strong>space</strong>
            <span>one AI · one workspace</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`connection ${connected ? "online" : "offline"}`}>
            <i /> {connected ? "Connected" : "Connecting"}
          </span>
          <button className="text-button" type="button" onClick={clear} disabled={!messages.length || busy}>
            Clear chat
          </button>
        </div>
      </header>

      <section className="chat-layout">
        <div className="welcome">
          <p className="eyebrow">AUTONOMOUS AI WORKSPACE · MVP 0.1</p>
          <h1>What should we work on?</h1>
          <p className="welcome-copy">
            One AI core with persistent conversation state. It will tell you clearly which tools are connected and which capabilities are still being built.
          </p>
          <div className="capability-chips">
            <span>Persistent chat</span>
            <span>Verified calculations</span>
            <span>Private by default</span>
          </div>
        </div>

        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-orbit">✦</div>
              <p>Start with a goal, a question, or a project idea.</p>
              <span>Try: “Explain how we should build the next part of space.”</span>
            </div>
          )}

          {messages.map((message) => (
            <div className="message-group" key={message.id}>
              <MessageParts message={message} />
              {message.parts.map((part, index) => {
                if (!isToolUIPart(part) || part.state !== "approval-requested") return null;

                const approvalId =
                  "approval" in part && part.approval && typeof part.approval === "object"
                    ? (part.approval as { id?: string }).id
                    : undefined;

                if (!approvalId) return null;

                return (
                  <div className="approval-card" key={`${message.id}-approval-${index}`}>
                    <strong>Approval required</strong>
                    <p>The AI wants to save a project memory. Review the proposed memory before it is stored.</p>
                    <pre>{JSON.stringify(part.input, null, 2)}</pre>
                    <div className="approval-actions">
                      <button
                        type="button"
                        onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                      >
                        Approve save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {busy && <div className="thinking"><span /> space is working…</div>}
          <div ref={endRef} />
        </div>

        {error && <div className="error-banner" role="status">{error}</div>}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Message space…"
            rows={2}
            maxLength={8000}
            disabled={!connected || busy}
            aria-label="Message space"
          />
          <div className="composer-footer">
            <span>Enter to send · Shift + Enter for a new line</span>
            {busy ? (
              <button type="button" className="send-button stop" onClick={stop}>Stop</button>
            ) : (
              <button type="submit" className="send-button" disabled={!draft.trim() || !connected}>Send ↗</button>
            )}
          </div>
        </form>
        <p className="disclaimer">
          Early MVP. Browser access, code execution, files, image/video/audio, and OS sandboxes are not connected yet.
        </p>
      </section>
    </main>
  );
}
