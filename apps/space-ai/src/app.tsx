import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { AutonomySettings, SpaceAgent } from "./server";

const DEFAULT_SETTINGS: AutonomySettings = {
  workspaceExecution: "autonomous_sandbox",
  browserResearch: "read_only_auto",
  projectFiles: "selected_workspace",
  selfUpdate: "automatic_after_gates"
};

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

function SettingSelect<T extends string>({
  label,
  description,
  value,
  options,
  onChange
}: {
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AutonomySettings>(DEFAULT_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

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

  const loadSettings = useCallback(async () => {
    try {
      const response = await agent.stub.getAutonomySettings();
      setSettings(response.settings);
    } catch {
      setSettingsNotice("Could not load saved autonomy preferences.");
    }
  }, [agent]);

  useEffect(() => {
    if (connected) void loadSettings();
  }, [connected, loadSettings]);

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
    if (!window.confirm("Hapus riwayat percakapan untuk agent ini? Catatan proyek dan rencana kerja yang disimpan terpisah tidak ikut dihapus.")) {
      return;
    }
    clearHistory();
  };

  const saveSettings = async () => {
    setSettingsBusy(true);
    setSettingsNotice("");
    try {
      const response = await agent.stub.updateAutonomySettings(settings);
      setSettings(response.settings);
      setSettingsNotice("Preferences saved. Future tools will follow these settings when connected.");
    } catch {
      setSettingsNotice("Could not save preferences. Check the connection and try again.");
    } finally {
      setSettingsBusy(false);
    }
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
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setShowSettings((shown) => !shown);
              setSettingsNotice("");
            }}
          >
            {showSettings ? "Close settings" : "Autonomy"}
          </button>
          <button className="text-button" type="button" onClick={clear} disabled={!messages.length || busy}>
            Clear chat
          </button>
        </div>
      </header>

      <section className="chat-layout">
        <div className="welcome">
          <p className="eyebrow">AUTONOMOUS AI WORKSPACE · MVP 0.3</p>
          <h1>What should we work on?</h1>
          <p className="welcome-copy">
            One AI core with persistent state and owner-configurable autonomy preferences.
          </p>
          <div className="capability-chips">
            <span>Persistent chat</span>
            <span>Task ledger</span>
            <span>Owner-controlled settings</span>
          </div>
        </div>

        {showSettings && (
          <section className="settings-panel" aria-label="Autonomy settings">
            <div className="settings-heading">
              <div>
                <p className="eyebrow">OWNER SETTINGS</p>
                <h2>Autonomy preferences</h2>
              </div>
              <span className="settings-owner">Private workspace</span>
            </div>
            <p className="settings-intro">
              Choose how autonomous connected tools should be. These preferences are stored persistently. They do not activate tools that have not been implemented.
            </p>

            <SettingSelect
              label="Workspace execution"
              description="Allow future code tasks to run automatically inside a resource-limited sandbox."
              value={settings.workspaceExecution}
              options={[
                { value: "manual", label: "Ask before each run" },
                { value: "autonomous_sandbox", label: "Autonomous inside sandbox" }
              ]}
              onChange={(value) => setSettings((current) => ({ ...current, workspaceExecution: value }))}
            />
            <SettingSelect
              label="Browser research"
              description="Reading public pages can be automatic; external write actions remain gated."
              value={settings.browserResearch}
              options={[
                { value: "manual", label: "Ask before browsing" },
                { value: "read_only_auto", label: "Automatic read-only research" }
              ]}
              onChange={(value) => setSettings((current) => ({ ...current, browserResearch: value }))}
            />
            <SettingSelect
              label="Project files"
              description="Limit file operations to a workspace you explicitly connect."
              value={settings.projectFiles}
              options={[
                { value: "ask_before_write", label: "Ask before every write" },
                { value: "selected_workspace", label: "Manage selected workspace" }
              ]}
              onChange={(value) => setSettings((current) => ({ ...current, projectFiles: value }))}
            />
            <SettingSelect
              label="Self-update"
              description="Automatic promotion is limited to low-risk releases that pass every required gate and have a verified rollback."
              value={settings.selfUpdate}
              options={[
                { value: "manual", label: "Manual release only" },
                { value: "automatic_after_gates", label: "Auto-release after all gates pass" }
              ]}
              onChange={(value) => setSettings((current) => ({ ...current, selfUpdate: value }))}
            />

            <div className="settings-boundary">
              <strong>Account and device access</strong>
              <p>
                Connect each service with its official OAuth consent and choose its provider scopes. Android camera, microphone, files, and biometric authentication must use Android's own permission prompts. These integrations are not connected in this MVP. The AI never receives passwords, one-time codes, or raw biometric templates.
              </p>
            </div>
            <div className="settings-boundary">
              <strong>Actions that always remain protected</strong>
              <p>
                Sending or publishing content, spending money, deleting important data, changing account security, modifying access permissions, and changing the security policy require owner confirmation. Automatic self-updates cannot modify these protected controls.
              </p>
            </div>

            <div className="settings-footer">
              <span role="status">{settingsNotice}</span>
              <button type="button" className="send-button" onClick={saveSettings} disabled={!connected || settingsBusy}>
                {settingsBusy ? "Saving…" : "Save preferences"}
              </button>
            </div>
          </section>
        )}

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
                    <p>Review this requested project-memory change before it is stored.</p>
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
          Early MVP. Browser access, code execution, files, image/video/audio, account connectors, device integrations, and OS sandboxes are not connected yet.
        </p>
      </section>
    </main>
  );
}
