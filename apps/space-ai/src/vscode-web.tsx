import { useEffect, useMemo, useState } from "react";

const DEFAULT_REPOSITORY = "yyouki/space";

function normalizeRepository(value: string): string | null {
  const normalized = value.trim().replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "");
  const match = normalized.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return normalized;
}

export default function VSCodeWebPage() {
  const [repositoryInput, setRepositoryInput] = useState(() => {
    try {
      return typeof window === "undefined"
        ? DEFAULT_REPOSITORY
        : window.localStorage.getItem("space-vscode-repository") || DEFAULT_REPOSITORY;
    } catch {
      return DEFAULT_REPOSITORY;
    }
  });
  const repository = useMemo(() => normalizeRepository(repositoryInput), [repositoryInput]);
  const editorUrl = repository ? "https://github.dev/" + repository : "";
  const githubUrl = repository ? "https://github.com/" + repository : "";

  useEffect(() => {
    try {
      if (repository) window.localStorage.setItem("space-vscode-repository", repository);
    } catch {
      // The selected repository remains available for this page session.
    }
  }, [repository]);

  return (
    <main className="page-container vscode-page">
      <div className="page-heading vscode-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT WORKSPACE</p>
          <h1>VS Code Web</h1>
          <p>Open a GitHub repository in the official Visual Studio Code browser editor.</p>
        </div>
        <span className="meta-chip vscode-status"><span /> Official browser editor</span>
      </div>

      <section className="vscode-launch-card">
        <div className="vscode-launch-top">
          <div className="vscode-symbol" aria-hidden="true"><span>‹</span><span>/</span><span>›</span></div>
          <div>
            <p className="eyebrow">OPEN A REPOSITORY</p>
            <h2>Continue coding in VS Code</h2>
            <p>Choose a GitHub repository to browse, edit, search, and commit changes from your browser.</p>
          </div>
        </div>

        <label className="vscode-repository-field">
          <span>GitHub repository</span>
          <input
            type="text"
            value={repositoryInput}
            onChange={(event) => setRepositoryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && editorUrl) window.open(editorUrl, "_blank", "noopener,noreferrer");
            }}
            placeholder="owner/repository"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="vscode-repository-help"
          />
          <small id="vscode-repository-help">Enter owner/repository or paste a github.com repository URL.</small>
        </label>

        {!repository && (
          <p className="vscode-validation" role="alert">Enter a valid GitHub repository in owner/repository format.</p>
        )}

        <div className="vscode-launch-actions">
          <a
            className="button button-primary"
            href={editorUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!editorUrl}
            onClick={(event) => { if (!editorUrl) event.preventDefault(); }}
          >
            Open in VS Code Web <span aria-hidden="true">↗</span>
          </a>
          <a className="button button-secondary" href={githubUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!githubUrl}>
            View on GitHub
          </a>
        </div>
        <div className="vscode-repository-preview">
          <span className="vscode-repository-dot" />
          <span>{repository || "No repository selected"}</span>
          <span className="vscode-repository-provider">github.dev</span>
        </div>
      </section>

      <details className="surface-card vscode-shortcuts-card" open>
        <summary>
          <span><strong>Touch, pointer, and keyboard controls</strong><small>Quick controls for desktop, tablet, and mobile.</small></span>
          <span className="vscode-shortcuts-summary">Show controls</span>
        </summary>
        <div className="vscode-mobile-guidance">
          <article>
            <strong>Touchscreen and zoom</strong>
            <p>On the VS Code Web tab, use the browser's two-finger pinch gesture to zoom the page when the browser allows it. The Space launcher cannot override the viewport settings of the separate github.dev site.</p>
          </article>
          <article>
            <strong>Pointer and clicking</strong>
            <p>Tap an item to click it. For a visible cursor, connect a Bluetooth/USB mouse or trackpad; the operating system and browser draw that pointer. Space cannot inject a cursor into github.dev because it is a separate site.</p>
          </article>
        </div>
        <div className="vscode-shortcuts-grid">
          <div className="vscode-shortcut-row"><span>Command Palette</span><kbd>F1</kbd><small>Alternative to Ctrl/Cmd + Shift + P</small></div>
          <div className="vscode-shortcut-row"><span>Open file</span><kbd>Ctrl/Cmd + P</kbd><small>Quick Open</small></div>
          <div className="vscode-shortcut-row"><span>Zoom in</span><kbd>Ctrl/Cmd + =</kbd><small>Increase editor zoom</small></div>
          <div className="vscode-shortcut-row"><span>Zoom out</span><kbd>Ctrl/Cmd + -</kbd><small>Decrease editor zoom</small></div>
          <div className="vscode-shortcut-row"><span>Reset zoom</span><kbd>Ctrl/Cmd + Numpad 0</kbd><small>Reset editor zoom level</small></div>
          <div className="vscode-shortcut-row"><span>Toggle sidebar</span><kbd>Ctrl/Cmd + B</kbd><small>Show or hide Explorer sidebar</small></div>
          <div className="vscode-shortcut-row"><span>Show Explorer</span><kbd>Ctrl/Cmd + Shift + E</kbd><small>Focus the file explorer</small></div>
          <div className="vscode-shortcut-row"><span>Search in files</span><kbd>Ctrl/Cmd + Shift + F</kbd><small>Search across the repository</small></div>
          <div className="vscode-shortcut-row"><span>Save file</span><kbd>Ctrl/Cmd + S</kbd><small>Save current editor</small></div>
        </div>
        <p className="vscode-shortcuts-note">On Windows/Linux use Ctrl. On macOS use Command (⌘). Browser-reserved shortcuts can behave differently; F1 opens the Command Palette when Ctrl/Cmd + Shift + P is intercepted.</p>
        <a href="https://code.visualstudio.com/docs/reference/default-keybindings" target="_blank" rel="noopener noreferrer">Official VS Code keyboard shortcut reference ↗</a>
      </details>

      <section className="vscode-info-grid">
        <article className="surface-card vscode-info-card">
          <span className="vscode-info-number">01</span>
          <h3>Browser-based editor</h3>
          <p>Use Explorer, search, syntax highlighting, supported extensions, and Git source control in the official VS Code interface.</p>
        </article>
        <article className="surface-card vscode-info-card">
          <span className="vscode-info-number">02</span>
          <h3>Commit through GitHub</h3>
          <p>Sign in to GitHub in VS Code Web. Keep commits on the repository you selected and review the target before pushing changes.</p>
        </article>
        <article className="surface-card vscode-info-card">
          <span className="vscode-info-number">03</span>
          <h3>Runtime is separate</h3>
          <p>VS Code Web does not provide a terminal or build machine. Use a separately configured compute environment for builds and debugging.</p>
        </article>
      </section>

      <section className="vscode-sync-notice" aria-label="Workspace synchronization status">
        <div className="vscode-sync-icon" aria-hidden="true">↔</div>
        <div>
          <strong>Space workspace sync is not connected yet</strong>
          <p>Files saved inside Space currently remain in its private workspace. Opening a GitHub repository here does not automatically import or synchronize those files. GitHub App authorization and repository publishing are the next integration step.</p>
        </div>
      </section>

      <p className="vscode-footnote">
        VS Code Web is a separate official Microsoft/GitHub service. Space opens it in a new tab and does not embed or repackage its editor.
      </p>
    </main>
  );
}
