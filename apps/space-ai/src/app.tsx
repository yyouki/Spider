import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { AutonomySettings, SpaceAgent } from "./server";
import type { ComponentType } from "react";
import type { Props as WorkspaceIDEProps } from "./ide";

const WorkspaceIDE = lazy<ComponentType<WorkspaceIDEProps>>(() => {
  // Monaco and its Web Workers are browser-only; do not bundle workers into the Cloudflare SSR Worker.
  if (import.meta.env.SSR) {
    const Placeholder: ComponentType<WorkspaceIDEProps> = () => null;
    return Promise.resolve({ default: Placeholder });
  }
  return import("./ide");
});

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

function Workspace({ onLogout }: { onLogout: () => void }) {
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AutonomySettings>(DEFAULT_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [shareInfo, setShareInfo] = useState<{ url: string; jsonUrl: string; token: string; expiresAt: string; messageCount: number } | null>(null);
  const [shareNotice, setShareNotice] = useState("");
  const [tokenUsage, setTokenUsage] = useState<{ requests: number; inputTokens: number; outputTokens: number; totalTokens: number; latestAt: string | null; source: string } | null>(null);
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

  const loadTokenUsage = useCallback(async () => {
    try {
      const summary = await agent.stub.getTokenUsage();
      setTokenUsage(summary);
    } catch {
      // A failed usage read should not block chat or file editing.
    }
  }, [agent]);

  useEffect(() => {
    if (connected && !busy) void loadTokenUsage();
  }, [connected, busy, loadTokenUsage]);

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

  const listWorkspaceFiles = useCallback(() => agent.stub.listWorkspaceFiles(), [agent]);
  const readWorkspaceFile = useCallback((path: string) => agent.stub.readWorkspaceFile(path), [agent]);
  const writeWorkspaceFile = useCallback((path: string, content: string) => agent.stub.writeWorkspaceFile(path, content), [agent]);
  const workspaceRefreshKey = useMemo(
    () => messages.map((message) => message.parts
      .filter(isToolUIPart)
      .map((part) => part.type + ":" + part.state)
      .join(",")).join("|"),
    [messages]
  );

  const shareChat = async () => {
    if (!messages.length || busy) return;
    const approved = window.confirm(
      "Create a read-only share link for this conversation? Anyone with the link can read the message text and tool details. The link expires in 7 days and can be revoked."
    );
    if (!approved) return;

    setShareNotice("Creating share link…");
    try {
      const result = await agent.stub.createChatShare();
      setShareInfo(result);
      setShareNotice("Share link created. Anyone with the link can view this snapshot for 7 days.");
      try {
        await navigator.clipboard.writeText(result.url);
        setShareNotice("Share link copied. Anyone with the link can view this snapshot for 7 days.");
      } catch {
        // The visible link remains available when clipboard access is blocked.
      }
    } catch (shareError) {
      setShareNotice(shareError instanceof Error ? shareError.message : "Could not create a share link.");
    }
  };

  const revokeShare = async () => {
    if (!shareInfo) return;
    if (!window.confirm("Revoke this share link now? Anyone opening it afterwards will receive a not found page.")) return;
    try {
      const result = await agent.stub.revokeChatShare(shareInfo.token);
      if (result.revoked) {
        setShareInfo(null);
        setShareNotice("Share link revoked.");
      } else {
        setShareNotice("This share link was already unavailable.");
      }
    } catch {
      setShareNotice("Could not revoke the share link.");
    }
  };

  const copyShare = async () => {
    if (!shareInfo) return;
    try {
      await navigator.clipboard.writeText(shareInfo.url);
      setShareNotice("Share link copied.");
    } catch {
      setShareNotice("Clipboard unavailable. Copy the visible URL manually.");
    }
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
          <button
            className="text-button"
            type="button"
            onClick={() => void shareChat()}
            disabled={!messages.length || busy}
            title="Create an expiring, revocable read-only share link"
          >
            Share chat
          </button>
          <button className="text-button" type="button" onClick={clear} disabled={!messages.length || busy}>
            Clear chat
          </button>
          <button className="text-button" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <section className="chat-layout">
        {shareNotice && (
          <section className="share-panel" role="status">
            <div className="share-panel-copy">
              <strong>Conversation share</strong>
              <span>{shareNotice}</span>
              {shareInfo && <a href={shareInfo.url} target="_blank" rel="noreferrer">{shareInfo.url}</a>}
              {shareInfo && <small>{shareInfo.messageCount} messages · expires {new Date(shareInfo.expiresAt).toLocaleString()}</small>}
            </div>
            {shareInfo && <div className="share-panel-actions">
              <button type="button" onClick={() => void copyShare()}>Copy link</button>
              <a href={shareInfo.jsonUrl} target="_blank" rel="noreferrer">JSON</a>
              <button type="button" className="danger" onClick={() => void revokeShare()}>Revoke</button>
            </div>}
          </section>
        )}
        <div className="welcome">
          <p className="eyebrow">AUTONOMOUS AI WORKSPACE · MVP 0.5</p>
          <h1>What should we work on?</h1>
          <p className="welcome-copy">
            One AI core with persistent state and owner-configurable autonomy preferences.
          </p>
          <div className="capability-chips">
            <span>Persistent chat</span>
            <span>Task ledger</span>
            <span>Offline Linux sandbox</span>
          </div>
        </div>

        <div className="workspace-grid">
          <Suspense fallback={<section className="ide-panel ide-loading">Loading code editor…</section>}>
            <WorkspaceIDE
              refreshKey={workspaceRefreshKey}
              tokenUsage={tokenUsage}
              onListFiles={listWorkspaceFiles}
              onReadFile={readWorkspaceFile}
              onWriteFile={writeWorkspaceFile}
            />
          </Suspense>
          <section className="conversation-panel">
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
              description="Run bounded Python and JavaScript snippets on a temporary GitHub-hosted Linux runner inside an offline Docker container."
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
              description="Create, read, and edit files in the private Space IDE workspace."
              value={settings.projectFiles}
              options={[
                { value: "ask_before_write", label: "Ask before every write" },
                { value: "selected_workspace", label: "Private Space workspace" }
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
                    <p>Review this requested action before it runs or changes saved project data.</p>
                    <pre>{JSON.stringify(part.input, null, 2)}</pre>
                    <div className="approval-actions">
                      <button
                        type="button"
                        onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                      >
                        Approve action
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
          Private workspace files are stored in Space, while code execution uses temporary offline GitHub-hosted containers. GitHub repository sync, browser tools, multimodal tools, and external account connectors are not connected.
        </p>
          </section>
        </div>
      </section>
    </main>
  );
}


type SessionResponse = {
  authenticated: boolean;
  login: string | null;
};

export default function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not verify the current session.");
        return await response.json() as SessionResponse;
      })
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active) setSessionError("Could not connect to the private Space service.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
    setSession({ authenticated: false, login: null });
  };

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-live="polite">
          <div className="brand-mark">s</div>
          <h1>space</h1>
          <p>Checking your private workspace session…</p>
        </section>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">s</div>
          <h1>space</h1>
          <p role="alert">{sessionError}</p>
          <button type="button" className="send-button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  if (!session?.authenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">s</div>
          <p className="eyebrow">PRIVATE AI WORKSPACE</p>
          <h1>Sign in to space</h1>
          <p>Only the configured owner GitHub account can open this workspace.</p>
          <a className="auth-button" href="/auth/github">
            Continue with GitHub
          </a>
        </section>
      </main>
    );
  }

  return <Workspace onLogout={() => void logout()} />;
}
