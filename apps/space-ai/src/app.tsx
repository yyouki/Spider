import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { AutonomySettings, SpaceAgent } from "./server";
import type { ComponentType, MouseEvent } from "react";
import type { Props as WorkspaceIDEProps } from "./ide";
import AnalyticsPage, { type TokenUsageSummary, type WorkspaceFileMetadata } from "./analytics";

const WorkspaceIDE = lazy<ComponentType<WorkspaceIDEProps>>(() => {
  // Monaco and its Web Workers are browser-only; keep them out of the Cloudflare SSR bundle.
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

const NAV_ITEMS = [
  { href: "/", label: "Chat" },
  { href: "/ide", label: "IDE" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" }
];

function MessageParts({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">{isUser ? "Y" : "S"}</div>
      <div className="message-content">
        <div className="message-meta">{isUser ? "You" : "Space"} <span>·</span> {isUser ? "Message" : "Assistant"}</div>
        <div className="message-bubble">
          {message.parts.map((part, index) => {
            if (part.type === "text" && part.text.trim()) {
              return <p key={index}>{part.text}</p>;
            }

            if (isToolUIPart(part)) {
              return (
                <details className="tool-event" key={index}>
                  <summary><span className="tool-event-dot" />{part.type.replace("tool-", "")}<span className="tool-event-state">{part.state}</span></summary>
                  <pre>{JSON.stringify(part, null, 2)}</pre>
                </details>
              );
            }

            return null;
          })}
        </div>
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
  const [settings, setSettings] = useState<AutonomySettings>(DEFAULT_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [shareInfo, setShareInfo] = useState<{ url: string; jsonUrl: string; token: string; expiresAt: string; messageCount: number } | null>(null);
  const [shareNotice, setShareNotice] = useState("");
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileMetadata[]>([]);
  const [pathname, setPathname] = useState(() => typeof window === "undefined" ? "/" : window.location.pathname);
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
      setError("Koneksi ke Space terputus. Periksa jaringan dan status deployment.");
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
  const currentPath = NAV_ITEMS.some((item) => item.href === pathname) ? pathname : "/";

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

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
      // Analytics is optional and must not block the conversation or IDE.
    }
  }, [agent]);

  useEffect(() => {
    if (connected && !busy) void loadTokenUsage();
  }, [connected, busy, loadTokenUsage]);

  const listWorkspaceFiles = useCallback(async () => {
    const files = await agent.stub.listWorkspaceFiles();
    setWorkspaceFiles(files);
    return files;
  }, [agent]);

  const readWorkspaceFile = useCallback((path: string) => agent.stub.readWorkspaceFile(path), [agent]);
  const writeWorkspaceFile = useCallback((path: string, content: string) => agent.stub.writeWorkspaceFile(path, content), [agent]);

  useEffect(() => {
    if (connected && (currentPath === "/analytics" || currentPath === "/ide")) void listWorkspaceFiles().catch(() => undefined);
  }, [connected, currentPath, listWorkspaceFiles]);

  const workspaceRefreshKey = useMemo(
    () => messages.map((message) => message.parts
      .filter(isToolUIPart)
      .map((part) => part.type + ":" + part.state)
      .join(",")).join("|"),
    [messages]
  );

  useEffect(() => {
    if (currentPath === "/") endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, currentPath]);

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
    if (!window.confirm("Hapus riwayat percakapan? Catatan proyek, file workspace, dan rencana kerja yang tersimpan terpisah tidak ikut dihapus.")) return;
    clearHistory();
  };

  const shareChat = async () => {
    if (!messages.length || busy) return;
    const approved = window.confirm(
      "Buat tautan read-only untuk percakapan ini? Siapa pun yang memiliki tautan dapat membaca teks pesan dan detail tool. Tautan berlaku 7 hari dan dapat dicabut."
    );
    if (!approved) return;

    setShareNotice("Membuat tautan…");
    try {
      const result = await agent.stub.createChatShare();
      setShareInfo(result);
      setShareNotice("Tautan dibuat. Siapa pun yang memiliki tautan dapat membaca snapshot ini selama 7 hari.");
      try {
        await navigator.clipboard.writeText(result.url);
        setShareNotice("Tautan disalin ke clipboard.");
      } catch {
        // Keep the URL visible so it can be copied manually.
      }
    } catch (shareError) {
      setShareNotice(shareError instanceof Error ? shareError.message : "Tautan tidak dapat dibuat.");
    }
  };

  const revokeShare = async () => {
    if (!shareInfo) return;
    if (!window.confirm("Cabut tautan ini sekarang? Tautan yang sudah dicabut tidak dapat dibuka lagi.")) return;
    try {
      const result = await agent.stub.revokeChatShare(shareInfo.token);
      if (result.revoked) {
        setShareInfo(null);
        setShareNotice("Tautan berhasil dicabut.");
      } else {
        setShareNotice("Tautan ini sudah tidak tersedia.");
      }
    } catch {
      setShareNotice("Tautan tidak dapat dicabut.");
    }
  };

  const copyShare = async () => {
    if (!shareInfo) return;
    try {
      await navigator.clipboard.writeText(shareInfo.url);
      setShareNotice("Tautan disalin ke clipboard.");
    } catch {
      setShareNotice("Clipboard tidak tersedia. Salin URL yang terlihat.");
    }
  };

  const saveSettings = async () => {
    setSettingsBusy(true);
    setSettingsNotice("");
    try {
      const response = await agent.stub.updateAutonomySettings(settings);
      setSettings(response.settings);
      setSettingsNotice("Preferensi berhasil disimpan.");
    } catch {
      setSettingsNotice("Preferensi tidak dapat disimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const header = (
    <header className="topbar">
      <a className="brand" href="/" onClick={(event) => navigate(event, "/")} aria-label="Space home">
        <span className="brand-mark">s</span>
        <span className="brand-copy"><strong>space</strong><small>AI workspace</small></span>
      </a>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={(event) => navigate(event, item.href)}
            className={currentPath === item.href ? "active" : ""}
            aria-current={currentPath === item.href ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="topbar-actions">
        <span className={`connection ${connected ? "online" : "offline"}`}>
          <i /> {connected ? "Connected" : "Connecting"}
        </span>
        <button className="text-button" type="button" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );

  const chatPage = (
    <main className="page-container chat-page">
      <div className="page-heading chat-page-heading">
        <div>
          <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
          <h1>What are we working on?</h1>
          <p>Ask Space to plan, reason, write files, or run a bounded code task.</p>
        </div>
        <div className="chat-heading-actions">
          <button className="button button-secondary" type="button" onClick={() => void shareChat()} disabled={!messages.length || busy}>Share chat</button>
          <button className="button button-quiet" type="button" onClick={clear} disabled={!messages.length || busy}>Clear</button>
        </div>
      </div>

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
            <a href={shareInfo.jsonUrl} target="_blank" rel="noreferrer">View JSON</a>
            <button type="button" className="danger" onClick={() => void revokeShare()}>Revoke</button>
          </div>}
        </section>
      )}

      <section className="chat-card">
        <div className="chat-card-header">
          <div><span className="chat-status-dot" /> <strong>Space</strong><span>Persistent conversation</span></div>
          <small>{messages.length} / 100 messages retained</small>
        </div>
        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">S</div>
              <h2>Start with a goal</h2>
              <p>Describe what you want to build, understand, or automate.</p>
              <div className="prompt-suggestions">
                <button type="button" onClick={() => setDraft("Create a small Python project and explain its files.")}>Create a project</button>
                <button type="button" onClick={() => setDraft("Help me understand how this workspace is structured.")}>Explore the workspace</button>
                <button type="button" onClick={() => setDraft("Run a Python snippet that prints 6 * 7.")}>Run a code snippet</button>
              </div>
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
                      <button type="button" className="button button-primary" onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}>Approve</button>
                      <button type="button" className="button button-secondary" onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}>Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {busy && <div className="thinking"><span /> Space is working…</div>}
          <div ref={endRef} />
        </div>

        {error && <div className="error-banner" role="status">{error}</div>}

        <form className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Message Space…"
            rows={3}
            maxLength={8000}
            disabled={!connected || busy}
            aria-label="Message Space"
          />
          <div className="composer-footer">
            <span>Enter to send · Shift + Enter for a new line</span>
            {busy ? (
              <button type="button" className="button button-primary" onClick={stop}>Stop response</button>
            ) : (
              <button type="submit" className="button button-primary" disabled={!draft.trim() || !connected}>Send message <span>↗</span></button>
            )}
          </div>
        </form>
      </section>
      <p className="page-footnote">Workspace files are private to this Space account. Sandbox runs use temporary, restricted GitHub-hosted containers.</p>
    </main>
  );

  const idePage = (
    <main className="page-container ide-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT WORKSPACE</p>
          <h1>Code workspace</h1>
          <p>Browse project files, edit source, and save changes to your private Space workspace.</p>
        </div>
        <div className="page-heading-meta"><span className="meta-chip">{workspaceFiles.length} files</span><span className="meta-chip">Private storage · 2 MB</span></div>
      </div>
      <Suspense fallback={<section className="ide-panel ide-loading">Loading editor…</section>}>
        <WorkspaceIDE
          refreshKey={workspaceRefreshKey}
          onListFiles={listWorkspaceFiles}
          onReadFile={readWorkspaceFile}
          onWriteFile={writeWorkspaceFile}
        />
      </Suspense>
    </main>
  );

  const settingsPage = (
    <main className="page-container settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES & ACCESS</p>
          <h1>Settings</h1>
          <p>Choose how Space should use the capabilities currently connected to this workspace.</p>
        </div>
        <span className="meta-chip">Owner controls</span>
      </div>

      <section className="surface-card settings-card">
        <div className="section-title"><div><h2>Autonomy preferences</h2><p>These choices are saved to the private Space agent. They do not activate tools that have not been implemented.</p></div></div>
        <SettingSelect
          label="Workspace execution"
          description="Run bounded Python and JavaScript snippets on a temporary GitHub-hosted Linux runner in an offline container."
          value={settings.workspaceExecution}
          options={[
            { value: "manual", label: "Ask before each run" },
            { value: "autonomous_sandbox", label: "Autonomous inside sandbox" }
          ]}
          onChange={(value) => setSettings((current) => ({ ...current, workspaceExecution: value }))}
        />
        <SettingSelect
          label="Browser research"
          description="Public-page reading can become automatic when a browser tool is connected. External write actions remain gated."
          value={settings.browserResearch}
          options={[
            { value: "manual", label: "Ask before browsing" },
            { value: "read_only_auto", label: "Automatic read-only research" }
          ]}
          onChange={(value) => setSettings((current) => ({ ...current, browserResearch: value }))}
        />
        <SettingSelect
          label="Project files"
          description="Create, read, and edit files in the private Space workspace shown in the IDE."
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
        <div className="settings-footer">
          <span role="status">{settingsNotice}</span>
          <button type="button" className="button button-primary" onClick={() => void saveSettings()} disabled={!connected || settingsBusy}>
            {settingsBusy ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </section>

      <section className="surface-card settings-card">
        <div className="section-title"><div><h2>Privacy and permissions</h2><p>Controls that keep the workspace private and prevent unapproved external actions.</p></div></div>
        <div className="policy-row"><span className="policy-icon">01</span><div><strong>Private workspace files</strong><p>Files live in Space's Durable Object storage. They are not automatically synced to GitHub or your device.</p></div></div>
        <div className="policy-row"><span className="policy-icon">02</span><div><strong>External account access</strong><p>Third-party services require their own official OAuth consent. Never share passwords, one-time codes, or private keys.</p></div></div>
        <div className="policy-row"><span className="policy-icon">03</span><div><strong>Protected actions</strong><p>Publishing, sending, spending, destructive changes, and security-setting changes require owner confirmation.</p></div></div>
      </section>
    </main>
  );

  return (
    <div className="app-shell">
      {header}
      {currentPath === "/ide" ? idePage :
        currentPath === "/analytics" ? <AnalyticsPage usage={tokenUsage} files={workspaceFiles} /> :
        currentPath === "/settings" ? settingsPage : chatPage}
    </div>
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
          <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Retry</button>
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
          <h1>Sign in to Space</h1>
          <p>Only the configured owner GitHub account can open this workspace.</p>
          <a className="auth-button" href="/auth/github">Continue with GitHub <span>↗</span></a>
        </section>
      </main>
    );
  }

  return <Workspace onLogout={() => void logout()} />;
}
